// MCP server: lets Claude create campaigns, add leads and custom-designed emails, approve them, and read replies.
// Sending itself only ever happens in the worker, within limits, business hours and the suppression list.
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as repo from '../core/repo.ts';
import { LeadInput, LEAD_STATUSES, EMAIL_STATUSES } from '../core/schemas.ts';

const INSTRUCTIONS = `Mavan Outreach: a cold-email platform. Typical flow:
1. create_campaign (or list_campaigns to reuse one).
2. add_leads with each business's public email, name, city, state and source_url (where the email was found).
3. add_email for each lead (step 0): a unique subject, a full HTML email (inline CSS, table layout, max ~600px wide, under ~100 KB) and a plain-text version.
   Optional image (base64 or https URL): put {{image_url}} where it should appear, e.g. <img src="{{image_url}}" width="560" alt="...">.
   Put {{postal_address}} in the footer (it is filled from Settings) and optionally {{unsubscribe_url}} for a link; if missing, an unsubscribe line is added automatically.
4. Optionally add_followup (step 1, 2) with delay_days; follow-ups go in the same thread and are cancelled when the lead replies.
5. approve_emails when the user says to. Nothing is sent before approval. The worker sends weekdays 8:00-17:00 in each lead's time zone, within each inbox's daily limit.
6. Later: list_replies, get_lead, update_lead (status interested/won/lost, notes), stats, queue_status.
Never invent facts about a business, and never invent a postal address.`;

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] });
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(e as Error)?.message ?? e}` }], isError: true });
const wrap = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => { try { return ok(await fn(a)); } catch (e) { return fail(e); } };

const campaignRef = z.string().describe('Campaign id or exact name');
const resolveCampaign = async (ref?: string | null) => {
  if (!ref) return null;
  const c = await repo.findCampaign(ref);
  if (!c) throw new Error(`Campaign "${ref}" not found. Use list_campaigns or create_campaign.`);
  return c;
};

const MAX_IMAGE = 8 * 1024 * 1024;
const loadImage = async (b64?: string | null, url?: string | null, type?: string | null) => {
  if (b64) {
    const m = /^data:([^;]+);base64,/.exec(b64);
    const bytes = Buffer.from(b64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE) throw new Error('Image must be 1 byte to 8 MB.');
    return { bytes, contentType: m?.[1] || type || 'image/jpeg' };
  }
  if (url) {
    if (!/^https:\/\//i.test(url)) throw new Error('image_url must be https.');
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const ct = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !ct.startsWith('image/')) throw new Error(`Could not fetch an image from that URL (${r.status} ${ct}).`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_IMAGE) throw new Error('Image is over 8 MB.');
    return { bytes, contentType: ct };
  }
  return null;
};

const emailShape = {
  lead: z.string().describe('Lead id or email address'),
  campaign: campaignRef.optional().describe('Campaign id or name (defaults to the lead\'s campaign)'),
  subject: z.string().min(1).max(300),
  html: z.string().max(2_000_000).optional().describe('Full HTML email. Use {{image_url}}, {{postal_address}}, {{unsubscribe_url}} tokens.'),
  text: z.string().max(100_000).optional().describe('Plain-text version (recommended).'),
  image_base64: z.string().max(12_000_000).optional().describe('Image as base64 or a data: URI'),
  image_url: z.string().url().optional().describe('Or an https URL to fetch the image from'),
  image_type: z.string().optional().describe('MIME type for image_base64, default image/jpeg'),
};

type EmailArgs = { lead: string; campaign?: string; subject: string; html?: string; text?: string; image_base64?: string; image_url?: string; image_type?: string };

const saveEmail = async (a: EmailArgs, step: number, delay: number) => {
  const c = await resolveCampaign(a.campaign);
  const isEmail = a.lead.includes('@');
  const r = await repo.addEmail(
    { lead_id: isEmail ? undefined : a.lead, lead_email: isEmail ? a.lead : undefined, campaign_id: c?.id, step, delay_days: delay, subject: a.subject, html: a.html, text: a.text },
    await loadImage(a.image_base64, a.image_url, a.image_type),
    'mcp',
  );
  return { ...r, note: 'Saved as a draft. It is sent only after approve_emails.' };
};

export const buildMcpServer = () => {
  const s = new McpServer({ name: 'mavan-outreach', version: '1.0.0' }, { instructions: INSTRUCTIONS });

  s.registerTool('create_campaign', {
    title: 'Create campaign',
    description: 'Create a campaign (or return the existing one with that name).',
    inputSchema: { name: z.string().min(1).max(120), notes: z.string().max(5000).optional() },
  }, wrap(async (a: { name: string; notes?: string }) => repo.createCampaign(a.name, a.notes, 'mcp')));

  s.registerTool('list_campaigns', {
    title: 'List campaigns',
    description: 'All campaigns with counts: leads, drafts, queued, sent, replied, bounced, unsubscribed.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, wrap(async () => repo.listCampaigns()));

  s.registerTool('add_leads', {
    title: 'Add leads',
    description: 'Add up to 1000 leads. Duplicates (by email) and suppressed addresses are skipped and reported. Time zone is set from the state if not given.',
    inputSchema: {
      leads: z.array(LeadInput).min(1).max(1000),
      campaign: campaignRef.optional(),
      list: z.string().optional().describe('List name to add them to (created if missing)'),
    },
  }, wrap(async (a: { leads: z.infer<typeof LeadInput>[]; campaign?: string; list?: string }) => {
    const c = await resolveCampaign(a.campaign);
    const list = a.list ? await repo.createList(a.list) : null;
    const r = await repo.upsertLeads(a.leads, { campaign_id: c?.id, list_id: list?.id, actor: 'mcp' });
    return { created: r.created.length, existing: r.existing.length, skipped: r.skipped, leads: [...r.created, ...r.existing] };
  }));

  s.registerTool('list_leads', {
    title: 'Find leads',
    description: 'Search leads by text, status, campaign, city, state, category, or whether they replied.',
    inputSchema: {
      q: z.string().optional(),
      status: z.array(z.enum(LEAD_STATUSES)).optional(),
      campaign: campaignRef.optional(),
      city: z.array(z.string()).optional(),
      state: z.array(z.string()).optional(),
      category: z.array(z.string()).optional(),
      replied: z.boolean().optional(),
      without_email: z.boolean().optional().describe('Only leads that have no email written yet'),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: any) => {
    const c = await resolveCampaign(a.campaign);
    const r = await repo.searchLeads({
      q: a.q, status: a.status, campaign_id: c?.id, city: a.city, state: a.state, category: a.category, replied: a.replied,
      has_email_draft: a.without_email ? false : undefined, limit: a.limit ?? 50, offset: a.offset ?? 0, sort: 'created_at', dir: 'asc',
    });
    return {
      total: r.total,
      leads: r.rows.map((l: any) => ({ id: l.id, email: l.email, business_name: l.business_name, category: l.category, city: l.city, state: l.state, status: l.status, campaign: l.campaign_name, emails_sent: l.sent_count, last_reply_at: l.last_reply_at, source_url: l.source_url })),
    };
  }));

  s.registerTool('get_lead', {
    title: 'Get lead',
    description: 'One lead with all its emails, events and the latest reply text.',
    inputSchema: { lead: z.string().describe('Lead id or email') },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: { lead: string }) => {
    const l = a.lead.includes('@') ? await repo.findLeadByEmail(a.lead) : { id: a.lead };
    const full = l ? await repo.getLead(l.id) : null;
    if (!full) throw new Error('Lead not found');
    return full;
  }));

  s.registerTool('update_lead', {
    title: 'Update lead',
    description: 'Change a lead\'s status (e.g. interested, won, lost) or notes. Setting replied/interested/won/lost/unsubscribed cancels its unsent emails.',
    inputSchema: {
      lead: z.string().describe('Lead id or email'),
      status: z.enum(LEAD_STATUSES).optional(),
      notes: z.string().max(5000).optional(),
      contact_name: z.string().max(200).optional(),
      phone: z.string().max(60).optional(),
    },
  }, wrap(async (a: any) => {
    const l = a.lead.includes('@') ? await repo.findLeadByEmail(a.lead) : await repo.getLead(a.lead);
    if (!l) throw new Error('Lead not found');
    await repo.updateLeads([l.id], { status: a.status, notes: a.notes, contact_name: a.contact_name, phone: a.phone }, 'mcp');
    const full = await repo.getLead(l.id);
    return { id: full!.id, email: full!.email, status: full!.status, notes: full!.notes };
  }));

  s.registerTool('add_email', {
    title: 'Add first email',
    description: 'Save the first email (step 0) for a lead as a draft, with an optional image stored in Supabase Storage. Re-running replaces an unsent draft.',
    inputSchema: emailShape,
  }, wrap(async (a: EmailArgs) => saveEmail(a, 0, 0)));

  s.registerTool('add_followup', {
    title: 'Add follow-up',
    description: 'Save a follow-up (step 1 or 2) sent delay_days after the previous step, in the same thread. Cancelled automatically if the lead replies.',
    inputSchema: { ...emailShape, step: z.number().int().min(1).max(5).default(1), delay_days: z.number().int().min(1).max(30).default(3) },
  }, wrap(async (a: EmailArgs & { step?: number; delay_days?: number }) => saveEmail(a, a.step ?? 1, a.delay_days ?? 3)));

  s.registerTool('list_emails', {
    title: 'List emails',
    description: 'Emails in a campaign or for a lead, with status (draft, approved, sent, failed, cancelled, skipped).',
    inputSchema: {
      campaign: campaignRef.optional(),
      lead: z.string().optional().describe('Lead id or email'),
      status: z.array(z.enum(EMAIL_STATUSES)).optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: any) => {
    const c = await resolveCampaign(a.campaign);
    let leadId: string | undefined;
    if (a.lead) { const l = a.lead.includes('@') ? await repo.findLeadByEmail(a.lead) : { id: a.lead }; leadId = l?.id; if (!leadId) throw new Error('Lead not found'); }
    return repo.listEmails({ campaign_id: c?.id, lead_id: leadId, status: a.status, limit: a.limit ?? 50, offset: a.offset ?? 0 });
  }));

  s.registerTool('approve_emails', {
    title: 'Approve emails for sending',
    description: 'Approve drafts so the worker may send them (within limits and business hours). Give email ids or a campaign. More than 100 at once needs confirm: true. Only do this when the user asked to send.',
    inputSchema: { ids: z.array(z.string().uuid()).max(5000).optional(), campaign: campaignRef.optional(), confirm: z.boolean().optional() },
    annotations: { destructiveHint: true },
  }, wrap(async (a: { ids?: string[]; campaign?: string; confirm?: boolean }) => {
    const c = await resolveCampaign(a.campaign);
    const sel = { ids: a.ids, campaign_id: c?.id };
    const n = await repo.countApprovable(sel);
    if (n > 100 && !a.confirm) return { approved: 0, would_approve: n, note: 'More than 100 emails. Ask the user, then call again with confirm: true.' };
    return repo.approveEmails(sel, 'mcp');
  }));

  s.registerTool('skip_emails', {
    title: 'Skip emails',
    description: 'Mark draft or approved emails as skipped so they are never sent.',
    inputSchema: { ids: z.array(z.string().uuid()).min(1).max(5000) },
  }, wrap(async (a: { ids: string[] }) => ({ skipped: await repo.setEmailStatus(a.ids, 'skipped', 'mcp') })));

  s.registerTool('pause_sending', {
    title: 'Pause all sending',
    description: 'Stop the worker from sending anything until resume_sending.',
    inputSchema: {},
  }, wrap(async () => ({ paused: (await repo.updateSettings({ paused: true }, 'mcp')).paused })));

  s.registerTool('resume_sending', {
    title: 'Resume sending',
    description: 'Let the worker send approved emails again.',
    inputSchema: {},
  }, wrap(async () => ({ paused: (await repo.updateSettings({ paused: false }, 'mcp')).paused })));

  s.registerTool('queue_status', {
    title: 'Queue status',
    description: 'What is waiting to send, and each inbox\'s sends today, limit and next send time.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, wrap(async () => repo.queueStatus()));

  s.registerTool('list_replies', {
    title: 'List replies',
    description: 'Leads who replied, newest first, with the reply text.',
    inputSchema: { since: z.string().optional().describe('ISO date, e.g. 2026-11-01'), limit: z.number().int().min(1).max(200).default(50) },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: { since?: string; limit?: number }) => repo.listReplies({ since: a.since, limit: a.limit ?? 50 })));

  s.registerTool('suppress_email', {
    title: 'Never email an address',
    description: 'Add addresses to the never-email list (cancels their unsent emails).',
    inputSchema: { emails: z.array(z.string().email()).min(1).max(1000), reason: z.string().max(60).default('manual') },
  }, wrap(async (a: { emails: string[]; reason?: string }) => ({ suppressed: await repo.suppressMany(a.emails, a.reason || 'manual', 'mcp') })));

  s.registerTool('stats', {
    title: 'Stats',
    description: 'Totals (leads, sent, queued, replies, bounces, unsubscribes) and daily sends and replies for the last N days.',
    inputSchema: { days: z.number().int().min(1).max(90).default(14) },
    annotations: { readOnlyHint: true },
  }, wrap(async (a: { days?: number }) => repo.stats(a.days ?? 14)));

  s.registerTool('get_settings', {
    title: 'Get settings',
    description: 'From name, reply-to, whether a postal address is set, and whether sending is paused.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, wrap(async () => { const st = await repo.getSettings(); return { ...st, postal_address_set: !!st.postal_address.trim() }; }));

  return s;
};

// Stateless Streamable HTTP: a fresh server and transport per request.
export const handleMcp = async (req: Request, res: Response) => {
  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req as any, res as any, req.body);
};
