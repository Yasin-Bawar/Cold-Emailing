// Turns leads into draft emails using the 140 template designs. Each lead gets a design for its business type;
// two leads in the same city never get the same design (until all ten are used there).
import { db } from './db.ts';
import { addEmail, logEvent, type Actor } from './repo.ts';
import { detectType, designKey, renderDesign, renderFollowup, DESIGNS_PER_TYPE, TYPES, type Fields } from '../templates/index.ts';

export type GenerateOptions = {
  campaign_id: string;
  lead_ids?: string[];
  followup?: boolean; // also draft a short follow-up (step 1)
  followup_days?: number;
  overwrite?: boolean; // replace existing unsent drafts made from templates
  type?: string; // force a business type for every lead
};

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

export const leadFields = (l: Record<string, any>): Fields => {
  const c = (l.custom || {}) as Record<string, any>;
  const first = c.first_name || (l.contact_name ? String(l.contact_name).trim().split(/\s+/)[0] : null);
  return {
    business_name: l.business_name || String(l.email).split('@')[0],
    first_name: first || null,
    city: l.city, state: l.state,
    hook: c.hook ?? null, specialty: c.specialty ?? null,
    rating: c.rating ?? null, reviews: c.reviews ?? null,
    phone: l.phone ?? null,
  };
};

export const generateEmails = async (o: GenerateOptions, actor: Actor = 'dashboard') => {
  const sql = db();
  if (o.type && !TYPES.some((t) => t.key === o.type)) throw new Error(`Unknown business type "${o.type}"`);
  const leads = await sql`
    select l.* from leads l
    where l.campaign_id = ${o.campaign_id}
      ${o.lead_ids?.length ? sql`and l.id in ${sql(o.lead_ids)}` : sql``}
      and l.status not in ('replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced')
    order by l.city nulls last, l.created_at`;
  // Designs already used in this campaign, per city.
  const used = new Map<string, Set<string>>();
  for (const r of await sql`select lower(coalesce(l.city, '')) as city, e.design from emails e join leads l on l.id = e.lead_id
      where e.campaign_id = ${o.campaign_id} and e.design is not null and e.step = 0`) {
    if (!used.has(r.city)) used.set(r.city, new Set());
    used.get(r.city)!.add(r.design);
  }
  const existing = new Map((await sql`select lead_id, status, design from emails where campaign_id = ${o.campaign_id} and step = 0`).map((r) => [r.lead_id as string, r]));
  const out = { created: 0, followups: 0, skipped: [] as { email: string; reason: string }[], by_type: {} as Record<string, number> };

  for (const l of leads) {
    const prev = existing.get(l.id);
    if (prev && !(o.overwrite && prev.status === 'draft' && prev.design)) {
      out.skipped.push({ email: l.email, reason: prev.design || prev.status !== 'draft' ? `already has an email (${prev.status})` : 'already has a custom email' });
      continue;
    }
    const t = o.type ? TYPES.find((x) => x.key === o.type)! : detectType(l.custom?.type, l.category, l.business_name);
    if (!t) { out.skipped.push({ email: l.email, reason: `unknown business type (category: ${l.category || 'none'}); set category or custom.type` }); continue; }
    const city = String(l.city || '').toLowerCase();
    const set = used.get(city) ?? new Set<string>();
    used.set(city, set);
    if (prev?.design) set.delete(prev.design);
    let idx = hash(l.id) % DESIGNS_PER_TYPE;
    for (let k = 0; k < DESIGNS_PER_TYPE && set.has(designKey(t.key, idx)); k++) idx = (idx + 1) % DESIGNS_PER_TYPE;
    const key = designKey(t.key, idx);
    set.add(key);
    const f = leadFields(l);
    const r = renderDesign(key, f);
    await addEmail({ lead_id: l.id, campaign_id: o.campaign_id, step: 0, delay_days: 0, subject: r.subject, html: r.html, text: r.text, design: key }, null, actor);
    out.created++;
    out.by_type[t.key] = (out.by_type[t.key] || 0) + 1;
    if (o.followup) {
      const fu = renderFollowup(key, f, r.subject);
      await addEmail({ lead_id: l.id, campaign_id: o.campaign_id, step: 1, delay_days: o.followup_days ?? 4, subject: fu.subject, text: fu.text, design: key }, null, actor);
      out.followups++;
    }
  }
  await logEvent('emails_generated', { actor, campaign_id: o.campaign_id, created: out.created, followups: out.followups, skipped: out.skipped.length });
  return out;
};
