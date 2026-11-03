// Data functions shared by the REST API, the MCP server, the worker and the scripts.
import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import { encrypt } from './crypto.ts';
import { validZone, zoneFor } from './window.ts';
import { dayStart, warmupCap } from './caps.ts';
import { putFile, removeFile, contentTypeFor } from './storage.ts';
import type { EmailInput, LeadFilter, LeadInput, LeadPatch } from './schemas.ts';

export type Actor = 'dashboard' | 'mcp' | 'worker' | 'script' | 'public';

const STOP_STATUSES = ['replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced'];

export const logEvent = async (type: string, detail: Record<string, unknown> = {}, ids: { lead_id?: string | null; email_id?: string | null; account_id?: string | null } = {}) => {
  const sql = db();
  await sql`insert into events (type, detail, lead_id, email_id, account_id)
    values (${type}, ${sql.json(detail as any)}, ${ids.lead_id ?? null}, ${ids.email_id ?? null}, ${ids.account_id ?? null})`;
};

// ---------- settings ----------
export type Settings = { postal_address: string; from_name: string; reply_to: string | null; paused: boolean; default_daily_cap: number };

export const getSettings = async (): Promise<Settings> => {
  const sql = db();
  const [s] = await sql`select postal_address, from_name, reply_to, paused, default_daily_cap from settings where id = 1`;
  return s as unknown as Settings;
};

export const updateSettings = async (patch: Partial<Settings>, actor: Actor = 'dashboard') => {
  const sql = db();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Record<string, unknown>;
  if ('reply_to' in clean && !clean.reply_to) clean.reply_to = null;
  if (Object.keys(clean).length) {
    await sql`update settings set ${sql(clean as any, Object.keys(clean) as any)}, updated_at = now() where id = 1`;
    await logEvent('settings_changed', { actor, fields: Object.keys(clean) });
  }
  return getSettings();
};

// ---------- campaigns ----------
const campaignCounts = (sql: ReturnType<typeof db>) => sql`
  select c.*,
    (select count(*)::int from leads l where l.campaign_id = c.id) as leads,
    (select count(*)::int from emails e where e.campaign_id = c.id) as emails,
    (select count(*)::int from emails e where e.campaign_id = c.id and e.status = 'draft') as drafts,
    (select count(*)::int from emails e where e.campaign_id = c.id and e.status in ('approved', 'sending')) as queued,
    (select count(*)::int from emails e where e.campaign_id = c.id and e.status = 'sent') as sent,
    (select count(*)::int from emails e where e.campaign_id = c.id and e.status = 'failed') as failed,
    (select count(distinct e.lead_id)::int from emails e join leads l on l.id = e.lead_id
       where e.campaign_id = c.id and l.status in ('replied', 'interested', 'won', 'lost')) as replied,
    (select count(distinct e.lead_id)::int from emails e join leads l on l.id = e.lead_id
       where e.campaign_id = c.id and l.status = 'bounced') as bounced,
    (select count(distinct e.lead_id)::int from emails e join leads l on l.id = e.lead_id
       where e.campaign_id = c.id and l.status = 'unsubscribed') as unsubscribed,
    (select max(e.sent_at) from emails e where e.campaign_id = c.id) as last_sent_at
  from campaigns c`;

export const listCampaigns = async () => {
  const sql = db();
  return sql`${campaignCounts(sql)} order by c.created_at desc`;
};

export const getCampaign = async (id: string) => {
  const sql = db();
  const [c] = await sql`${campaignCounts(sql)} where c.id = ${id}`;
  return c ?? null;
};

export const findCampaign = async (idOrName: string) => {
  const sql = db();
  const isId = /^[0-9a-f-]{36}$/i.test(idOrName);
  const [c] = isId ? await sql`select * from campaigns where id = ${idOrName}` : await sql`select * from campaigns where lower(name) = lower(${idOrName})`;
  return c ?? null;
};

export const createCampaign = async (name: string, notes?: string | null, actor: Actor = 'dashboard') => {
  const sql = db();
  const [c] = await sql`insert into campaigns (name, notes) values (${name.trim()}, ${notes ?? null})
    on conflict (name) do update set notes = coalesce(excluded.notes, campaigns.notes) returning *`;
  await logEvent('campaign_created', { actor, name: c.name }, {});
  return c;
};

export const updateCampaign = async (id: string, patch: { name?: string; notes?: string | null; status?: string }, actor: Actor = 'dashboard') => {
  const sql = db();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) return getCampaign(id);
  await sql`update campaigns set ${sql(clean as any, Object.keys(clean) as any)} where id = ${id}`;
  await logEvent('campaign_updated', { actor, campaign_id: id, ...clean });
  return getCampaign(id);
};

export const deleteCampaign = async (id: string) => {
  const sql = db();
  await sql`delete from emails where campaign_id = ${id} and status <> 'sent'`;
  await sql`delete from campaigns where id = ${id}`;
};

// ---------- leads ----------
const LEAD_COLS = ['email', 'business_name', 'contact_name', 'category', 'city', 'state', 'timezone', 'phone', 'address', 'website', 'source_url', 'score', 'notes', 'campaign_id'] as const;

export type UpsertResult = {
  created: { id: string; email: string }[];
  existing: { id: string; email: string }[];
  skipped: { email: string; reason: string }[];
};

export const upsertLeads = async (rows: LeadInput[], opts: { campaign_id?: string | null; list_id?: string | null; actor?: Actor } = {}): Promise<UpsertResult> => {
  const sql = db();
  const out: UpsertResult = { created: [], existing: [], skipped: [] };
  const seen = new Set<string>();
  const unique: LeadInput[] = [];
  for (const r of rows) {
    const e = r.email.trim().toLowerCase();
    if (seen.has(e)) { out.skipped.push({ email: e, reason: 'duplicate in this batch' }); continue; }
    seen.add(e);
    unique.push({ ...r, email: e });
  }
  if (!unique.length) return out;
  const emails = unique.map((r) => r.email);
  const suppressed = new Set((await sql`select email from suppression where email in ${sql(emails)}`).map((r) => r.email as string));
  const existing = new Map((await sql`select id, lower(email) as email from leads where lower(email) in ${sql(emails)}`).map((r) => [r.email as string, r.id as string]));
  const fresh: Record<string, unknown>[] = [];
  for (const r of unique) {
    if (suppressed.has(r.email)) { out.skipped.push({ email: r.email, reason: 'on the suppression list' }); continue; }
    const id = existing.get(r.email);
    if (id) { out.existing.push({ id, email: r.email }); continue; }
    fresh.push({
      email: r.email,
      business_name: r.business_name || '',
      contact_name: r.contact_name ?? null,
      category: r.category ?? null,
      city: r.city ?? null,
      state: r.state ? r.state.toUpperCase() : null,
      timezone: validZone(r.timezone) || zoneFor(r.state, r.city),
      phone: r.phone ?? null,
      address: r.address ?? null,
      website: r.website ?? null,
      source_url: r.source_url ?? null,
      score: r.score ?? null,
      notes: r.notes ?? null,
      campaign_id: opts.campaign_id ?? null,
    });
  }
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500);
    const ins = await sql`insert into leads ${sql(chunk as any, LEAD_COLS as any)} on conflict do nothing returning id, email`;
    out.created.push(...ins.map((r) => ({ id: r.id as string, email: String(r.email).toLowerCase() })));
  }
  if (opts.campaign_id && out.existing.length) {
    await sql`update leads set campaign_id = ${opts.campaign_id}, updated_at = now() where id in ${sql(out.existing.map((r) => r.id))} and campaign_id is null`;
  }
  if (opts.list_id) {
    const ids = [...out.created, ...out.existing].map((r) => r.id);
    if (ids.length) await addToList(opts.list_id, ids);
  }
  if (out.created.length) await logEvent('leads_added', { actor: opts.actor ?? 'dashboard', count: out.created.length, campaign_id: opts.campaign_id ?? null });
  return out;
};

const leadWhere = (sql: ReturnType<typeof db>, f: Partial<LeadFilter>) =>
  sql`and`.join([
    sql`true`,
    f.q && sql`(l.email ilike ${'%' + f.q + '%'} or l.business_name ilike ${'%' + f.q + '%'} or l.city ilike ${'%' + f.q + '%'} or coalesce(l.contact_name, '') ilike ${'%' + f.q + '%'} or coalesce(l.category, '') ilike ${'%' + f.q + '%'})`,
    f.status?.length && sql`l.status in ${sql(f.status)}`,
    f.campaign_id && sql`l.campaign_id = ${f.campaign_id}`,
    f.list_id && sql`exists (select 1 from list_leads ll where ll.lead_id = l.id and ll.list_id = ${f.list_id})`,
    f.city?.length && sql`l.city in ${sql(f.city)}`,
    f.state?.length && sql`l.state in ${sql(f.state)}`,
    f.category?.length && sql`l.category in ${sql(f.category)}`,
    f.replied === true && sql`l.last_reply_at is not null`,
    f.replied === false && sql`l.last_reply_at is null`,
    f.has_email_draft === true && sql`exists (select 1 from emails e where e.lead_id = l.id and e.status = 'draft')`,
    f.has_email_draft === false && sql`not exists (select 1 from emails e where e.lead_id = l.id)`,
  ]);

export const searchLeads = async (f: LeadFilter) => {
  const sql = db();
  const where = leadWhere(sql, f);
  const order = sql.unsafe(`l.${f.sort} ${f.dir === 'asc' ? 'asc' : 'desc'} nulls last, l.id`);
  const rows = await sql`
    select l.*, c.name as campaign_name,
      (select count(*)::int from emails e where e.lead_id = l.id and e.status = 'sent') as sent_count,
      (select e.status from emails e where e.lead_id = l.id order by e.step asc limit 1) as first_email_status
    from leads l left join campaigns c on c.id = l.campaign_id
    where ${where} order by ${order} limit ${f.limit} offset ${f.offset}`;
  const [{ total }] = await sql`select count(*)::int as total from leads l where ${where}`;
  return { rows, total: total as number, limit: f.limit, offset: f.offset };
};

export const leadFacets = async () => {
  const sql = db();
  const facet = (col: string) => sql`select ${sql.unsafe(col)} as value, count(*)::int as count from leads
    where ${sql.unsafe(col)} is not null and ${sql.unsafe(col)}::text <> '' group by 1 order by 2 desc limit 100`;
  const [status, city, state, category] = await Promise.all([facet('status'), facet('city'), facet('state'), facet('category')]);
  return { status, city, state, category };
};

export const getLead = async (id: string): Promise<Record<string, any> | null> => {
  const sql = db();
  const [lead] = await sql`select l.*, c.name as campaign_name from leads l left join campaigns c on c.id = l.campaign_id where l.id = ${id}`;
  if (!lead) return null;
  const emails = await sql`select e.id, e.campaign_id, e.step, e.delay_days, e.subject, e.status, e.send_after, e.sent_at, e.error, e.image_path,
      e.created_at, a.email as account_email
    from emails e left join accounts a on a.id = e.account_id where e.lead_id = ${id} order by e.step, e.created_at`;
  const events = await sql`select id, type, detail, created_at from events where lead_id = ${id} order by created_at desc limit 100`;
  const lists = await sql`select li.id, li.name from list_leads ll join lists li on li.id = ll.list_id where ll.lead_id = ${id}`;
  return { ...lead, emails, events, lists };
};

export const findLeadByEmail = async (email: string) => {
  const sql = db();
  const [l] = await sql`select * from leads where lower(email) = ${email.trim().toLowerCase()}`;
  return l ?? null;
};

export const updateLeads = async (ids: string[], patch: LeadPatch, actor: Actor = 'dashboard') => {
  const sql = db();
  const clean: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (clean.timezone !== undefined) clean.timezone = validZone(clean.timezone as string) ?? null;
  if (!ids.length || !Object.keys(clean).length) return 0;
  const res = await sql`update leads set ${sql(clean as any, Object.keys(clean) as any)}, updated_at = now() where id in ${sql(ids)}`;
  if (clean.status && STOP_STATUSES.includes(clean.status as string)) {
    await sql`update emails set status = 'cancelled', error = ${'lead marked ' + clean.status}
      where lead_id in ${sql(ids)} and status in ('draft', 'approved')`;
  }
  for (const id of ids.slice(0, 200)) await logEvent('lead_updated', { actor, ...clean }, { lead_id: id });
  return res.count;
};

export const deleteLeads = async (ids: string[]) => {
  const sql = db();
  if (!ids.length) return 0;
  return (await sql`delete from leads where id in ${sql(ids)}`).count;
};

// ---------- lists ----------
export const listLists = async () => {
  const sql = db();
  return sql`select li.*, (select count(*)::int from list_leads ll where ll.list_id = li.id) as leads from lists li order by li.created_at desc`;
};
export const createList = async (name: string) => {
  const sql = db();
  const [l] = await sql`insert into lists (name) values (${name.trim()}) on conflict (name) do update set name = excluded.name returning *`;
  return l;
};
export const deleteList = async (id: string) => { const sql = db(); await sql`delete from lists where id = ${id}`; };
export const addToList = async (listId: string, leadIds: string[]) => {
  const sql = db();
  if (!leadIds.length) return 0;
  const rows = leadIds.map((lead_id) => ({ list_id: listId, lead_id }));
  return (await sql`insert into list_leads ${sql(rows as any, ['list_id', 'lead_id'] as any)} on conflict do nothing`).count;
};
export const removeFromList = async (listId: string, leadIds: string[]) => {
  const sql = db();
  if (!leadIds.length) return 0;
  return (await sql`delete from list_leads where list_id = ${listId} and lead_id in ${sql(leadIds)}`).count;
};

// ---------- emails ----------
export type ImageInput = { bytes: Buffer; contentType?: string; filename?: string };

export const addEmail = async (input: EmailInput, image?: ImageInput | null, actor: Actor = 'dashboard') => {
  const sql = db();
  const lead = input.lead_id
    ? (await sql`select * from leads where id = ${input.lead_id}`)[0]
    : input.lead_email ? await findLeadByEmail(input.lead_email) : null;
  if (!lead) throw new Error('Lead not found. Add the lead first (add_leads), then its email.');
  if (!input.html && !input.text) throw new Error('Give html, text or both.');
  const campaignId = input.campaign_id ?? lead.campaign_id ?? null;
  const [old] = await sql`select id, status, image_path from emails where lead_id = ${lead.id} and campaign_id is not distinct from ${campaignId} and step = ${input.step}`;
  if (old && !['draft', 'approved', 'failed', 'skipped', 'cancelled'].includes(old.status)) throw new Error(`Step ${input.step} for this lead is already ${old.status} and can't be replaced.`);
  let imagePath: string | null = old?.image_path ?? null;
  if (image) {
    const ct = image.contentType || contentTypeFor(image.filename || '');
    const ext = ct === 'image/png' ? 'png' : ct === 'image/gif' ? 'gif' : ct === 'image/webp' ? 'webp' : 'jpg';
    imagePath = await putFile(`${campaignId ?? 'no-campaign'}/${lead.id}/step${input.step}-${randomUUID().slice(0, 8)}.${ext}`, image.bytes, ct);
    if (old?.image_path) await removeFile(old.image_path).catch(() => {});
  }
  const row = {
    lead_id: lead.id, campaign_id: campaignId, step: input.step, delay_days: input.step === 0 ? 0 : input.delay_days || 3,
    subject: input.subject, html: input.html ?? null, text: input.text ?? null, image_path: imagePath,
  };
  let email;
  if (old) {
    [email] = await sql`update emails set subject = ${row.subject}, html = ${row.html}, text = ${row.text}, image_path = ${row.image_path},
      delay_days = ${row.delay_days}, status = 'draft', error = null, send_after = null where id = ${old.id} returning id, lead_id, campaign_id, step, status`;
  } else {
    [email] = await sql`insert into emails ${sql(row as any, Object.keys(row) as any)} returning id, lead_id, campaign_id, step, status`;
  }
  if (campaignId && !lead.campaign_id) await sql`update leads set campaign_id = ${campaignId} where id = ${lead.id}`;
  await logEvent(old ? 'email_replaced' : 'email_added', { actor, step: input.step, subject: input.subject }, { lead_id: lead.id, email_id: email.id });
  return { ...email, image_path: imagePath, lead_email: lead.email, replaced: !!old };
};

export const listEmails = async (f: { campaign_id?: string; status?: string[]; lead_id?: string; limit?: number; offset?: number; q?: string }) => {
  const sql = db();
  const where = sql`and`.join([
    sql`true`,
    f.campaign_id && sql`e.campaign_id = ${f.campaign_id}`,
    f.status?.length && sql`e.status in ${sql(f.status)}`,
    f.lead_id && sql`e.lead_id = ${f.lead_id}`,
    f.q && sql`(l.business_name ilike ${'%' + f.q + '%'} or l.email ilike ${'%' + f.q + '%'} or e.subject ilike ${'%' + f.q + '%'})`,
  ]);
  const rows = await sql`select e.id, e.lead_id, e.campaign_id, e.step, e.delay_days, e.subject, e.status, e.send_after, e.sent_at, e.error,
      e.image_path, e.created_at, l.email as lead_email, l.business_name, l.city, l.state, l.timezone, l.status as lead_status, a.email as account_email
    from emails e join leads l on l.id = e.lead_id left join accounts a on a.id = e.account_id
    where ${where} order by e.created_at asc, e.step asc limit ${f.limit ?? 50} offset ${f.offset ?? 0}`;
  const [{ total }] = await sql`select count(*)::int as total from emails e join leads l on l.id = e.lead_id where ${where}`;
  return { rows, total: total as number };
};

export const getEmail = async (id: string) => {
  const sql = db();
  const [e] = await sql`select e.*, l.email as lead_email, l.business_name, l.timezone from emails e join leads l on l.id = e.lead_id where e.id = ${id}`;
  return e ?? null;
};

export const updateEmail = async (id: string, patch: { subject?: string; html?: string | null; text?: string | null; delay_days?: number }, actor: Actor = 'dashboard') => {
  const sql = db();
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) return getEmail(id);
  const res = await sql`update emails set ${sql(clean as any, Object.keys(clean) as any)} where id = ${id} and status in ('draft', 'approved', 'failed') returning lead_id`;
  if (!res.count) throw new Error('Only draft, approved or failed emails can be edited.');
  await logEvent('email_edited', { actor, fields: Object.keys(clean) }, { lead_id: res[0].lead_id, email_id: id });
  return getEmail(id);
};

// Approve drafts so the worker may send them. Either ids, or a whole campaign.
export const approveEmails = async (sel: { ids?: string[]; campaign_id?: string }, actor: Actor = 'dashboard') => {
  const sql = db();
  if (!sel.ids?.length && !sel.campaign_id) throw new Error('Give email ids or a campaign_id.');
  const where = sel.ids?.length ? sql`e.id in ${sql(sel.ids)}` : sql`e.campaign_id = ${sel.campaign_id!}`;
  const res = await sql`update emails e set status = 'approved', error = null from leads l
    where l.id = e.lead_id and ${where} and e.status in ('draft', 'failed')
      and l.status not in ${sql(STOP_STATUSES)}
      and not exists (select 1 from suppression s where s.email = lower(l.email))
    returning e.id, e.lead_id, e.campaign_id`;
  const leadIds = [...new Set(res.map((r) => r.lead_id as string))];
  if (leadIds.length) await sql`update leads set status = 'queued', updated_at = now() where id in ${sql(leadIds)} and status = 'new'`;
  const campaigns = [...new Set(res.map((r) => r.campaign_id).filter(Boolean) as string[])];
  if (campaigns.length) await sql`update campaigns set status = 'active' where id in ${sql(campaigns)} and status = 'draft'`;
  await logEvent('emails_approved', { actor, count: res.count, campaign_id: sel.campaign_id ?? null });
  return { approved: res.count };
};

export const countApprovable = async (sel: { ids?: string[]; campaign_id?: string }) => {
  const sql = db();
  const where = sel.ids?.length ? sql`id in ${sql(sel.ids)}` : sql`campaign_id = ${sel.campaign_id ?? null}`;
  const [{ n }] = await sql`select count(*)::int as n from emails where ${where} and status in ('draft', 'failed')`;
  return n as number;
};

export const setEmailStatus = async (ids: string[], status: 'skipped' | 'draft' | 'cancelled', actor: Actor = 'dashboard') => {
  const sql = db();
  if (!ids.length) return 0;
  const from = status === 'draft' ? ['approved', 'skipped', 'failed', 'cancelled'] : ['draft', 'approved', 'failed'];
  const res = await sql`update emails set status = ${status} where id in ${sql(ids)} and status in ${sql(from)}`;
  await logEvent(`emails_${status}`, { actor, count: res.count });
  return res.count;
};

// ---------- suppression ----------
export const suppress = async (email: string, reason: string, actor: Actor = 'dashboard') => {
  const sql = db();
  const e = email.trim().toLowerCase();
  await sql`insert into suppression (email, reason) values (${e}, ${reason}) on conflict (email) do nothing`;
  const leadStatus = reason === 'bounce' ? 'bounced' : reason === 'unsubscribe' ? 'unsubscribed' : null;
  const leads = await sql`select id from leads where lower(email) = ${e}`;
  for (const l of leads) {
    if (leadStatus) await sql`update leads set status = ${leadStatus}, updated_at = now() where id = ${l.id}`;
    await sql`update emails set status = 'cancelled', error = ${'suppressed: ' + reason} where lead_id = ${l.id} and status in ('draft', 'approved')`;
    await logEvent(reason === 'bounce' ? 'bounced' : reason === 'unsubscribe' ? 'unsubscribed' : 'suppressed', { actor, reason }, { lead_id: l.id });
  }
  if (!leads.length) await logEvent('suppressed', { actor, reason, email: e });
  return { email: e, reason, leads: leads.length };
};

export const suppressMany = async (emails: string[], reason: string, actor: Actor = 'dashboard') => {
  let n = 0;
  for (const e of emails) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())) continue;
    await suppress(e, reason, actor);
    n++;
  }
  return n;
};

export const listSuppression = async (q?: string, limit = 100, offset = 0) => {
  const sql = db();
  const rows = await sql`select * from suppression ${q ? sql`where email ilike ${'%' + q + '%'}` : sql``} order by created_at desc limit ${limit} offset ${offset}`;
  const [{ total }] = await sql`select count(*)::int as total from suppression ${q ? sql`where email ilike ${'%' + q + '%'}` : sql``}`;
  return { rows, total: total as number };
};

export const unsuppress = async (email: string) => {
  const sql = db();
  return (await sql`delete from suppression where email = ${email.trim().toLowerCase()}`).count;
};

// ---------- accounts ----------
export const listAccounts = async (now = new Date()): Promise<Record<string, any>[]> => {
  const sql = db();
  const since = dayStart(now);
  const rows = await sql`select a.id, a.provider, a.email, a.from_name, a.daily_cap, a.warmup_start, a.status, a.fail_streak, a.last_error,
      a.next_send_at, a.imap_checked_at, a.created_at,
      (select count(*)::int from emails e where e.account_id = a.id and e.status = 'sent' and e.sent_at >= ${since}) as sent_today,
      (select count(*)::int from emails e where e.account_id = a.id and e.status = 'sent') as sent_total
    from accounts a order by a.created_at`;
  return rows.map((a) => ({ ...(a as Record<string, any>), cap_today: warmupCap(a.daily_cap as number, a.warmup_start as Date, now) }));
};

export const addAccount = async (a: { provider: 'gmail' | 'gmail_api' | 'resend'; email: string; from_name?: string | null; secret: string; daily_cap: number; warmup_start?: string }) => {
  const sql = db();
  const [row] = await sql`insert into accounts (provider, email, from_name, secret_enc, daily_cap, warmup_start)
    values (${a.provider}, ${a.email}, ${a.from_name ?? null}, ${encrypt(a.secret.trim())}, ${a.daily_cap}, ${a.warmup_start ?? sql`current_date`})
    on conflict (email) do update set provider = excluded.provider, from_name = excluded.from_name, secret_enc = excluded.secret_enc,
      daily_cap = excluded.daily_cap, status = 'active', fail_streak = 0, last_error = null,
      imap_last_uid = case when accounts.provider = excluded.provider then accounts.imap_last_uid else 0 end
    returning id, provider, email, from_name, daily_cap, warmup_start, status`;
  await logEvent('account_added', { provider: a.provider, email: a.email }, { account_id: row.id });
  return row;
};

export const updateAccount = async (id: string, patch: { from_name?: string | null; daily_cap?: number; status?: 'active' | 'paused'; secret?: string }) => {
  const sql = db();
  const clean: Record<string, unknown> = {};
  if (patch.from_name !== undefined) clean.from_name = patch.from_name;
  if (patch.daily_cap !== undefined) clean.daily_cap = patch.daily_cap;
  if (patch.status !== undefined) Object.assign(clean, { status: patch.status, fail_streak: 0, last_error: null });
  if (patch.secret) Object.assign(clean, { secret_enc: encrypt(patch.secret.trim()), status: 'active', fail_streak: 0, last_error: null });
  if (Object.keys(clean).length) await sql`update accounts set ${sql(clean as any, Object.keys(clean) as any)} where id = ${id}`;
  return (await listAccounts()).find((a) => a.id === id) ?? null;
};

export const deleteAccount = async (id: string) => { const sql = db(); await sql`delete from accounts where id = ${id}`; };

export const getAccountRow = async (id: string) => {
  const sql = db();
  const [a] = await sql`select * from accounts where id = ${id}`;
  return a ?? null;
};

// ---------- activity, replies, stats ----------
export const listActivity = async (f: { type?: string[]; limit?: number; offset?: number; since?: string }) => {
  const sql = db();
  const where = sql`and`.join([
    sql`true`,
    f.type?.length && sql`ev.type in ${sql(f.type)}`,
    f.since && sql`ev.created_at >= ${new Date(f.since)}`,
  ]);
  return sql`select ev.id, ev.type, ev.detail, ev.created_at, ev.lead_id, l.email as lead_email, l.business_name
    from events ev left join leads l on l.id = ev.lead_id where ${where}
    order by ev.created_at desc limit ${f.limit ?? 50} offset ${f.offset ?? 0}`;
};

export const listReplies = async (f: { since?: string; limit?: number; offset?: number } = {}) => {
  const sql = db();
  return sql`select l.id, l.email, l.business_name, l.city, l.state, l.status, l.last_reply, l.last_reply_at, l.notes, c.name as campaign_name
    from leads l left join campaigns c on c.id = l.campaign_id
    where l.last_reply_at is not null ${f.since ? sql`and l.last_reply_at >= ${new Date(f.since)}` : sql``}
    order by l.last_reply_at desc limit ${f.limit ?? 50} offset ${f.offset ?? 0}`;
};

export const stats = async (days = 14, now = new Date()) => {
  const sql = db();
  const from = new Date(now.getTime() - days * 86_400_000);
  const [totals] = await sql`select
      (select count(*)::int from leads) as leads,
      (select count(*)::int from emails where status = 'sent') as sent,
      (select count(*)::int from emails where status in ('approved', 'sending')) as queued,
      (select count(*)::int from emails where status = 'draft') as drafts,
      (select count(*)::int from emails where status = 'failed') as failed,
      (select count(*)::int from leads where last_reply_at is not null) as replied,
      (select count(*)::int from leads where status = 'interested') as interested,
      (select count(*)::int from leads where status = 'won') as won,
      (select count(*)::int from leads where status = 'bounced') as bounced,
      (select count(*)::int from leads where status = 'unsubscribed') as unsubscribed,
      (select count(*)::int from suppression) as suppressed,
      (select count(*)::int from campaigns) as campaigns`;
  // Same numbers for the previous period, for the % change chips.
  const [cur] = await sql`select
      (select count(*)::int from emails where status = 'sent' and sent_at >= ${from}) as sent,
      (select count(*)::int from events where type = 'replied' and created_at >= ${from}) as replied,
      (select count(*)::int from events where type = 'bounced' and created_at >= ${from}) as bounced,
      (select count(*)::int from events where type = 'unsubscribed' and created_at >= ${from}) as unsubscribed,
      (select count(*)::int from leads where created_at >= ${from}) as leads`;
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  const [prev] = await sql`select
      (select count(*)::int from emails where status = 'sent' and sent_at >= ${prevFrom} and sent_at < ${from}) as sent,
      (select count(*)::int from events where type = 'replied' and created_at >= ${prevFrom} and created_at < ${from}) as replied,
      (select count(*)::int from events where type = 'bounced' and created_at >= ${prevFrom} and created_at < ${from}) as bounced,
      (select count(*)::int from events where type = 'unsubscribed' and created_at >= ${prevFrom} and created_at < ${from}) as unsubscribed,
      (select count(*)::int from leads where created_at >= ${prevFrom} and created_at < ${from}) as leads`;
  const daily = await sql`select to_char(d, 'YYYY-MM-DD') as day,
      (select count(*)::int from emails e where e.status = 'sent' and e.sent_at >= d and e.sent_at < d + interval '1 day') as sent,
      (select count(*)::int from events ev where ev.type = 'replied' and ev.created_at >= d and ev.created_at < d + interval '1 day') as replied
    from generate_series(date_trunc('day', ${from}::timestamptz), date_trunc('day', ${now}::timestamptz), interval '1 day') as d order by d`;
  const byStatus = await sql`select status as value, count(*)::int as count from leads group by 1 order by 2 desc`;
  const byCategory = await sql`select coalesce(nullif(category, ''), 'other') as value, count(*)::int as count,
      count(*) filter (where last_reply_at is not null)::int as replied from leads group by 1 order by 2 desc limit 8`;
  const byCity = await sql`select coalesce(nullif(city, ''), 'unknown') as value, count(*)::int as count from leads group by 1 order by 2 desc limit 8`;
  return { totals, period: { days, current: cur, previous: prev }, daily, byStatus, byCategory, byCity };
};

export const queueStatus = async (now = new Date()) => {
  const settings = await getSettings();
  const accounts = await listAccounts(now);
  const sql = db();
  const [q] = await sql`select
      count(*) filter (where status = 'approved')::int as approved,
      count(*) filter (where status = 'approved' and step = 0)::int as first_emails,
      count(*) filter (where status = 'approved' and step > 0)::int as followups,
      count(*) filter (where status = 'draft')::int as drafts,
      count(*) filter (where status = 'sending')::int as sending
    from emails`;
  return {
    paused: settings.paused,
    postal_address_set: !!settings.postal_address.trim(),
    queue: q,
    accounts: accounts.map((a) => ({
      id: a.id, email: a.email, provider: a.provider, status: a.status, sent_today: a.sent_today, cap_today: a.cap_today,
      next_send_at: a.next_send_at, last_error: a.last_error,
    })),
    capacity_today: accounts.filter((a) => a.status === 'active').reduce((n, a) => n + Math.max(0, a.cap_today - (a.sent_today as number)), 0),
  };
};

export const STOP_LEAD_STATUSES = STOP_STATUSES;
