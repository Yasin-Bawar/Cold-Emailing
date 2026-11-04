import { Router, type Request } from 'express';
import { z } from 'zod';
import * as repo from '../core/repo.ts';
import { AccountInput, EmailInput, LeadFilter, LeadInput, LeadPatch, SettingsPatch, LEAD_STATUSES } from '../core/schemas.ts';
import { csvToLeads, extractEmails, toCsv } from '../core/csv.ts';
import { getFile, contentTypeFor, storageKind } from '../core/storage.ts';
import { compose, esc, insertAddress, hasAddressSlot } from '../core/compose.ts';
import { decrypt, signedFileUrl } from '../core/crypto.ts';
import { env } from '../core/env.ts';
import { gmailSender } from '../core/senders/gmail.ts';
import { resendSender } from '../core/senders/resend.ts';
import { verifyImap } from '../core/inbox.ts';
import { unsubscribeUrl } from '../core/engine.ts';
import { gmailApiSender, googleConfigured, redirectUri } from '../core/google.ts';
import { createToken, listTokens, revokeToken } from './auth.ts';
import { listDesigns, renderDesign, SAMPLE, TYPES, parseDesignKey } from '../templates/index.ts';
import { generateEmails } from '../core/generate.ts';

export const api = Router();

const arr = (v: unknown) => (v === undefined || v === '' ? undefined : (Array.isArray(v) ? v : String(v).split(',')).map(String).filter(Boolean));
const bool = (v: unknown) => (v === 'true' || v === true ? true : v === 'false' || v === false ? false : undefined);
const uuid = z.string().uuid();
const ids = z.object({ ids: z.array(uuid).min(1).max(5000) });

const leadFilterFrom = (q: Request['query']) =>
  LeadFilter.parse({
    q: q.q || undefined,
    status: arr(q.status),
    campaign_id: q.campaign_id || undefined,
    list_id: q.list_id || undefined,
    city: arr(q.city),
    state: arr(q.state),
    category: arr(q.category),
    replied: bool(q.replied),
    has_email_draft: bool(q.has_email_draft),
    limit: q.limit,
    offset: q.offset,
    sort: q.sort || undefined,
    dir: q.dir || undefined,
  });

// ---------- overview ----------
api.get('/stats', async (req, res) => res.json(await repo.stats(Number(req.query.days) || 14)));
api.get('/queue', async (_req, res) => res.json(await repo.queueStatus()));
api.get('/activity', async (req, res) =>
  res.json(await repo.listActivity({ type: arr(req.query.type), limit: Math.min(Number(req.query.limit) || 50, 200), offset: Number(req.query.offset) || 0 })));
api.get('/replies', async (req, res) => res.json(await repo.listReplies({ since: (req.query.since as string) || undefined, limit: Math.min(Number(req.query.limit) || 50, 200), offset: Number(req.query.offset) || 0 })));
api.get('/meta', async (_req, res) => res.json({ storage: storageKind(), public_url: env.publicUrl, lead_statuses: LEAD_STATUSES, google: googleConfigured(), google_redirect_uri: redirectUri() }));

// ---------- leads ----------
api.get('/leads', async (req, res) => res.json(await repo.searchLeads(leadFilterFrom(req.query))));
api.get('/leads/facets', async (_req, res) => res.json(await repo.leadFacets()));
api.get('/leads/export.csv', async (req, res) => {
  const f = { ...leadFilterFrom(req.query), limit: 500 };
  const cols = ['email', 'business_name', 'contact_name', 'category', 'city', 'state', 'timezone', 'phone', 'website', 'source_url', 'status', 'score', 'campaign_name', 'sent_count', 'last_reply_at', 'last_reply', 'notes', 'created_at'];
  const all: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await repo.searchLeads({ ...f, offset });
    all.push(...(page.rows as unknown as Record<string, unknown>[]));
    if (page.rows.length < 500) break;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(all, cols));
});
api.post('/leads', async (req, res) => {
  const body = z.object({ leads: z.array(LeadInput).min(1).max(5000), campaign_id: uuid.nullish(), list_id: uuid.nullish() }).parse(req.body);
  res.json(await repo.upsertLeads(body.leads, { campaign_id: body.campaign_id, list_id: body.list_id }));
});
// Bulk include/exclude: paste emails or a CSV, then add them as leads or put them on the never-email list.
api.post('/leads/bulk', async (req, res) => {
  const body = z.object({
    action: z.enum(['include', 'exclude']),
    text: z.string().max(5_000_000).optional(),
    csv: z.string().max(10_000_000).optional(),
    campaign_id: uuid.nullish(),
    list_id: uuid.nullish(),
  }).parse(req.body);
  if (body.action === 'exclude') {
    const emails = [...extractEmails(body.text || ''), ...extractEmails(body.csv || '')].slice(0, 5000);
    return res.json({ excluded: await repo.suppressMany(emails, 'manual'), found: emails.length });
  }
  const fromCsv = body.csv ? csvToLeads(body.csv) : { leads: [], bad: 0 };
  const fromText = extractEmails(body.text || '').map((email) => ({ email }));
  const rows = [...fromCsv.leads, ...fromText].slice(0, 5000);
  const valid: z.infer<typeof LeadInput>[] = [];
  let bad = fromCsv.bad;
  for (const r of rows) { const p = LeadInput.safeParse(r); if (p.success) valid.push(p.data); else bad++; }
  const out = await repo.upsertLeads(valid, { campaign_id: body.campaign_id, list_id: body.list_id });
  res.json({ ...out, invalid_rows: bad });
});
api.get('/leads/:id', async (req, res) => {
  const lead = await repo.getLead(uuid.parse(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});
api.patch('/leads/:id', async (req, res) => {
  const id = uuid.parse(req.params.id);
  await repo.updateLeads([id], LeadPatch.parse(req.body));
  res.json(await repo.getLead(id));
});
api.post('/leads/bulk-update', async (req, res) => {
  const body = ids.extend({ patch: LeadPatch }).parse(req.body);
  res.json({ updated: await repo.updateLeads(body.ids, body.patch) });
});
api.post('/leads/delete', async (req, res) => res.json({ deleted: await repo.deleteLeads(ids.parse(req.body).ids) }));

// ---------- lists ----------
api.get('/lists', async (_req, res) => res.json(await repo.listLists()));
api.post('/lists', async (req, res) => res.json(await repo.createList(z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body).name)));
api.delete('/lists/:id', async (req, res) => { await repo.deleteList(uuid.parse(req.params.id)); res.json({ ok: true }); });
api.post('/lists/:id/leads', async (req, res) => res.json({ added: await repo.addToList(uuid.parse(req.params.id), ids.parse(req.body).ids) }));
api.post('/lists/:id/remove', async (req, res) => res.json({ removed: await repo.removeFromList(uuid.parse(req.params.id), ids.parse(req.body).ids) }));

// ---------- campaigns ----------
api.get('/campaigns', async (_req, res) => res.json(await repo.listCampaigns()));
api.post('/campaigns', async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(120), notes: z.string().max(5000).nullish() }).parse(req.body);
  res.json(await repo.createCampaign(b.name, b.notes));
});
api.get('/campaigns/:id', async (req, res) => {
  const c = await repo.getCampaign(uuid.parse(req.params.id));
  if (!c) return res.status(404).json({ error: 'Campaign not found' });
  res.json(c);
});
api.patch('/campaigns/:id', async (req, res) => {
  const b = z.object({ name: z.string().trim().min(1).max(120).optional(), notes: z.string().max(5000).nullish(), status: z.enum(['draft', 'active', 'paused', 'done']).optional() }).parse(req.body);
  res.json(await repo.updateCampaign(uuid.parse(req.params.id), b));
});
api.delete('/campaigns/:id', async (req, res) => res.json({ ok: true, ...(await repo.deleteCampaign(uuid.parse(req.params.id), { withLeads: req.query.leads === '1' })) }));
api.post('/campaigns/:id/approve', async (req, res) => res.json(await repo.approveEmails({ campaign_id: uuid.parse(req.params.id) })));

// ---------- emails ----------
api.get('/emails', async (req, res) =>
  res.json(await repo.listEmails({
    campaign_id: (req.query.campaign_id as string) || undefined,
    lead_id: (req.query.lead_id as string) || undefined,
    status: arr(req.query.status),
    q: (req.query.q as string) || undefined,
    limit: Math.min(Number(req.query.limit) || 50, 500),
    offset: Number(req.query.offset) || 0,
  })));
api.post('/emails', async (req, res) => {
  const b = EmailInput.extend({ image_base64: z.string().max(15_000_000).nullish(), image_type: z.string().max(40).nullish() }).parse(req.body);
  const image = b.image_base64 ? { bytes: Buffer.from(b.image_base64.replace(/^data:[^;]+;base64,/, ''), 'base64'), contentType: b.image_type || 'image/jpeg' } : null;
  res.json(await repo.addEmail(b, image));
});
api.get('/emails/:id', async (req, res) => {
  const e = await repo.getEmail(uuid.parse(req.params.id));
  if (!e) return res.status(404).json({ error: 'Email not found' });
  res.json(e);
});
api.patch('/emails/:id', async (req, res) => {
  const b = z.object({ subject: z.string().trim().min(1).max(300).optional(), html: z.string().max(2_000_000).nullish(), text: z.string().max(100_000).nullish(), delay_days: z.number().int().min(0).max(60).optional() }).parse(req.body);
  res.json(await repo.updateEmail(uuid.parse(req.params.id), b));
});
api.post('/emails/approve', async (req, res) => res.json(await repo.approveEmails({ ids: ids.parse(req.body).ids })));
api.post('/emails/skip', async (req, res) => res.json({ skipped: await repo.setEmailStatus(ids.parse(req.body).ids, 'skipped') }));
api.post('/emails/unapprove', async (req, res) => res.json({ reset: await repo.setEmailStatus(ids.parse(req.body).ids, 'draft') }));

// The email exactly as it will look, for the preview iframe. Sandboxed: no scripts, no forms.
api.get('/emails/:id/preview', async (req, res) => {
  const e = await repo.getEmail(uuid.parse(req.params.id));
  if (!e) return res.status(404).send('Not found');
  const s = await repo.getSettings();
  const img = e.image_path ? signedFileUrl(e.image_path) : '';
  let html: string;
  if (s.postal_address.trim()) {
    html = compose({ html: e.html || `<pre style="font:14px/1.6 Arial;white-space:pre-wrap;padding:24px">${esc(e.text || '')}</pre>`, text: e.text, address: s.postal_address, unsubscribeUrl: unsubscribeUrl(e.lead_id), imageSrc: img, assetBase: '/photos' }).html!;
  } else {
    html = (e.html || `<pre style="font:14px/1.6 Arial;white-space:pre-wrap;padding:24px">${esc(e.text || '')}</pre>`).split('{{image_url}}').join(img).split('{{asset_base}}').join('/photos');
    html = insertAddress(html, '', '⚠ Postal address not set (Settings)').html;
  }
  res.setHeader('Content-Security-Policy', "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com");
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
api.get('/emails/:id/check', async (req, res) => {
  const e = await repo.getEmail(uuid.parse(req.params.id));
  if (!e) return res.status(404).json({ error: 'Not found' });
  res.json({ address_slot: hasAddressSlot(e.html, e.text), has_image: !!e.image_path, html_kb: Math.round((e.html || '').length / 1024), image_url: e.image_path ? signedFileUrl(e.image_path) : null });
});

// Stored images (email concepts), for the dashboard.
api.get('/files/*path', async (req, res) => {
  const p = ([] as string[]).concat((req.params as any).path).join('/');
  try {
    const bytes = await getFile(p);
    res.setHeader('Content-Type', contentTypeFor(p));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(bytes);
  } catch {
    res.status(404).send('Not found');
  }
});

// ---------- suppression ----------
api.get('/suppression', async (req, res) => res.json(await repo.listSuppression((req.query.q as string) || undefined, Math.min(Number(req.query.limit) || 100, 500), Number(req.query.offset) || 0)));
api.post('/suppression', async (req, res) => {
  const b = z.object({ emails: z.array(z.string()).min(1).max(5000), reason: z.string().max(60).default('manual') }).parse(req.body);
  res.json({ added: await repo.suppressMany(b.emails, b.reason) });
});
api.post('/suppression/remove', async (req, res) => res.json({ removed: await repo.unsuppress(z.object({ email: z.string().email() }).parse(req.body).email) }));

// ---------- accounts ----------
api.get('/accounts', async (_req, res) => res.json(await repo.listAccounts()));
api.post('/accounts', async (req, res) => res.json(await repo.addAccount(AccountInput.parse(req.body))));
api.patch('/accounts/:id', async (req, res) => {
  const b = z.object({ from_name: z.string().max(120).nullish(), daily_cap: z.number().int().min(1).max(500).optional(), status: z.enum(['active', 'paused']).optional(), secret: z.string().min(8).max(500).optional(), warmed_up: z.boolean().optional() }).parse(req.body);
  res.json(await repo.updateAccount(uuid.parse(req.params.id), b));
});
api.delete('/accounts/:id', async (req, res) => { await repo.deleteAccount(uuid.parse(req.params.id)); res.json({ ok: true }); });
api.post('/accounts/:id/test', async (req, res) => {
  const a = await repo.getAccountRow(uuid.parse(req.params.id));
  if (!a) return res.status(404).json({ error: 'Account not found' });
  const secret = decrypt(a.secret_enc);
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const run = async (name: string, fn: () => Promise<string>) => {
    try { checks.push({ name, ok: true, detail: await fn() }); } catch (e) { checks.push({ name, ok: false, detail: String((e as Error).message).slice(0, 300) }); }
  };
  if (a.provider === 'gmail') {
    const s = gmailSender(a.email, secret);
    await run('Sending (SMTP)', () => s.verify());
    s.close?.();
    await run('Inbox (IMAP)', () => verifyImap(a.email, secret));
  } else if (a.provider === 'gmail_api') {
    await run('Gmail (Google sign-in)', () => gmailApiSender(a.email, secret).verify());
  } else {
    await run('Resend API key', () => resendSender(secret).verify());
  }
  res.json({ ok: checks.every((c) => c.ok), checks });
});

// ---------- settings & tokens ----------
api.get('/settings', async (_req, res) => res.json(await repo.getSettings()));
api.patch('/settings', async (req, res) => res.json(await repo.updateSettings(SettingsPatch.parse(req.body) as any)));
api.get('/tokens', async (_req, res) => res.json(await listTokens()));
api.post('/tokens', async (req, res) => res.json(await createToken(z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body).name)));
api.delete('/tokens/:id', async (req, res) => { await revokeToken(uuid.parse(req.params.id)); res.json({ ok: true }); });

// ---------- templates ----------
api.get('/business-types', (_req, res) => res.json(TYPES.map((t) => ({ key: t.key, label: t.label, plural: t.plural, keywords: t.keywords, photos: t.photos.length }))));
api.get('/designs', (req, res) => res.json(listDesigns((req.query.type as string) || undefined)));
api.get('/designs/:key/preview', (req, res) => {
  const d = parseDesignKey(req.params.key);
  if (!d) return res.status(404).send('Unknown design');
  const r = renderDesign(req.params.key, SAMPLE[d.t.key]);
  const html = compose({ html: r.html, text: r.text, address: 'Your postal address', unsubscribeUrl: '#unsubscribe', assetBase: '/photos' }).html!;
  res.setHeader('Content-Security-Policy', "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'");
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
api.post('/campaigns/:id/generate', async (req, res) => {
  const b = z.object({ followup: z.boolean().optional(), followup_days: z.number().int().min(1).max(30).optional(), overwrite: z.boolean().optional(), type: z.string().optional(), lead_ids: z.array(uuid).max(5000).optional() }).parse(req.body || {});
  res.json(await generateEmails({ campaign_id: uuid.parse(req.params.id), ...b }));
});
