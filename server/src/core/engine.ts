// The worker's two jobs: send approved emails within limits, and read inboxes for replies and bounces.
import { randomUUID } from 'node:crypto';
import { db } from './db.ts';
import { decrypt, unsubToken } from './crypto.ts';
import { env } from './env.ts';
import { dayStart, nextGapMs, warmupCap } from './caps.ts';
import { localTime, DEFAULT_TZ } from './window.ts';
import { compose } from './compose.ts';
import { getFile, contentTypeFor } from './storage.ts';
import { gmailSender } from './senders/gmail.ts';
import { resendSender } from './senders/resend.ts';
import type { Attachment, Sender } from './senders/types.ts';
import { classify, fetchNew, stripQuoted, type InMessage } from './inbox.ts';
import { fetchNewGmailApi, gmailApiSender } from './google.ts';
import { getSettings, logEvent, suppress, STOP_LEAD_STATUSES } from './repo.ts';

export type AccountRow = {
  id: string; provider: 'gmail' | 'gmail_api' | 'resend'; email: string; from_name: string | null; secret_enc: string;
  daily_cap: number; warmup_start: Date; status: string; fail_streak: number; imap_last_uid: string | number;
};

export const senderFor = (a: AccountRow): Sender =>
  a.provider === 'gmail' ? gmailSender(a.email, decrypt(a.secret_enc))
    : a.provider === 'gmail_api' ? gmailApiSender(a.email, decrypt(a.secret_enc))
    : resendSender(decrypt(a.secret_enc));

export const unsubscribeUrl = (leadId: string) => `${env.publicUrl}/u/${unsubToken(leadId)}`;

const shuffle = <T,>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
const domainOf = (email: string) => email.split('@')[1] || 'localhost';

export type SendOutcome = { account: string; email_id?: string; to?: string; ok?: boolean; error?: string; held?: string };

export const sendTick = async (now = new Date(), makeSender: (a: AccountRow) => Sender = senderFor): Promise<{ skipped?: string; results: SendOutcome[] }> => {
  const sql = db();
  // An email stuck in "sending" means the worker died mid-send. It may or may not have gone out, so never retry it automatically.
  await sql`update emails set status = 'failed', error = 'Interrupted while sending. Check the Sent folder before approving it again.'
    where status = 'sending' and claimed_at < ${new Date(now.getTime() - 15 * 60_000)}`;
  const settings = await getSettings();
  if (settings.paused) return { skipped: 'Sending is paused in Settings.', results: [] };
  if (!settings.postal_address.trim()) return { skipped: 'No postal address in Settings, so nothing is sent (CAN-SPAM).', results: [] };

  const accounts = (await sql`select * from accounts where status = 'active' and (next_send_at is null or next_send_at <= ${now})`) as unknown as AccountRow[];
  const activeIds = (await sql`select id from accounts where status = 'active'`).map((r) => r.id as string);
  const firstGmail = (await sql`select email from accounts where provider in ('gmail', 'gmail_api') and status <> 'error' order by created_at limit 1`)[0]?.email as string | undefined;
  const since = dayStart(now);
  const results: SendOutcome[] = [];

  for (const acc of shuffle(accounts)) {
    const [{ n }] = await sql`select count(*)::int as n from emails where account_id = ${acc.id} and status = 'sent' and sent_at >= ${since}`;
    const cap = warmupCap(acc.daily_cap, acc.warmup_start, now);
    if (n >= cap) { results.push({ account: acc.email, held: `daily limit reached (${n}/${cap})` }); continue; }

    const candidates = await sql`
      select e.id, e.lead_id, e.step, e.subject, e.html, e.text, e.image_path,
        l.email as lead_email, l.timezone,
        p.message_id_header as prev_msgid, f.message_id_header as first_msgid
      from emails e
      join leads l on l.id = e.lead_id
      left join campaigns c on c.id = e.campaign_id
      left join emails p on p.lead_id = e.lead_id and p.campaign_id is not distinct from e.campaign_id and p.step = e.step - 1
      left join emails f on f.lead_id = e.lead_id and f.campaign_id is not distinct from e.campaign_id and f.step = 0
      where e.status = 'approved'
        and (e.send_after is null or e.send_after <= ${now})
        and l.status not in ${sql(STOP_LEAD_STATUSES)}
        and l.last_reply_at is null
        and not exists (select 1 from suppression s where s.email = lower(l.email))
        and (c.id is null or c.status in ('draft', 'active'))
        and (
          (e.step = 0 and not exists (select 1 from emails x where x.lead_id = e.lead_id and x.status in ('sent', 'sending') and x.step = 0 and x.campaign_id is not distinct from e.campaign_id))
          or (e.step > 0 and p.status = 'sent' and p.sent_at + make_interval(days => e.delay_days) <= ${now}
              and (p.account_id = ${acc.id} or p.account_id is null or not (p.account_id = any(${activeIds}::uuid[]))))
        )
      order by e.step desc, e.created_at asc
      limit 300`;
    const pick = candidates.find((c) => localTime((c.timezone as string) || DEFAULT_TZ, now).open);
    if (!pick) { results.push({ account: acc.email, held: candidates.length ? `${candidates.length} waiting for business hours in the recipient's time zone` : 'nothing to send' }); continue; }

    const claimed = await sql`update emails set status = 'sending', claimed_at = ${now}, account_id = ${acc.id}
      where id = ${pick.id} and status = 'approved' returning id`;
    if (!claimed.count) continue;

    const messageId = `<${randomUUID()}@${domainOf(acc.email)}>`;
    try {
      const attachments: Attachment[] = [];
      let imageSrc: string | undefined;
      if (pick.image_path) {
        const bytes = await getFile(pick.image_path as string);
        const ct = contentTypeFor(pick.image_path as string);
        const inline = String(pick.html || '').includes('{{image_url}}');
        attachments.push({ filename: `concept.${ct.split('/')[1].replace('jpeg', 'jpg')}`, content: bytes, contentType: ct, ...(inline ? { cid: 'concept' } : {}) });
        if (inline) imageSrc = 'cid:concept';
      }
      const unsub = unsubscribeUrl(pick.lead_id as string);
      const body = compose({ html: pick.html as string | null, text: pick.text as string | null, address: settings.postal_address, unsubscribeUrl: unsub, imageSrc });
      const refs = [pick.first_msgid, pick.prev_msgid].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i) as string[];
      const sender = makeSender(acc);
      const replyTo = settings.reply_to || (acc.provider === 'resend' ? firstGmail : null) || null;
      const res = await sender.send({
        from: acc.email,
        fromName: acc.from_name || settings.from_name,
        to: pick.lead_email as string,
        subject: pick.subject as string,
        html: body.html,
        text: body.text,
        replyTo,
        messageId,
        inReplyTo: (pick.prev_msgid as string) || null,
        references: refs.length ? refs.join(' ') : null,
        unsubscribeUrl: unsub,
        attachments,
      });
      sender.close?.();
      await sql`update emails set status = 'sent', sent_at = ${now}, provider_message_id = ${res.providerId}, message_id_header = ${res.messageId || messageId}, error = null where id = ${pick.id}`;
      await sql`update leads set status = 'sent', updated_at = now() where id = ${pick.lead_id} and status in ('new', 'queued')`;
      await sql`update accounts set fail_streak = 0, last_error = null, next_send_at = ${new Date(now.getTime() + nextGapMs())} where id = ${acc.id}`;
      await logEvent('sent', { to: pick.lead_email, subject: pick.subject, step: pick.step, from: acc.email }, { lead_id: pick.lead_id as string, email_id: pick.id as string, account_id: acc.id });
      results.push({ account: acc.email, email_id: pick.id as string, to: pick.lead_email as string, ok: true });
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 500);
      const streak = acc.fail_streak + 1;
      await sql`update emails set status = 'failed', error = ${msg} where id = ${pick.id}`;
      await sql`update accounts set fail_streak = ${streak}, last_error = ${msg}, status = ${streak >= 3 ? 'error' : 'active'},
        next_send_at = ${new Date(now.getTime() + 5 * 60_000)} where id = ${acc.id}`;
      await logEvent('send_failed', { to: pick.lead_email, error: msg, from: acc.email }, { lead_id: pick.lead_id as string, email_id: pick.id as string, account_id: acc.id });
      results.push({ account: acc.email, email_id: pick.id as string, to: pick.lead_email as string, ok: false, error: msg });
    }
  }
  return { results };
};

const OPT_OUT = /^\s*(no,? thanks?|no thank you|unsubscribe|stop|remove( me)?|not interested|please (remove|stop)|take me off)\b/i;

export const handleInbound = async (messages: InMessage[], ownAddresses: string[]) => {
  const sql = db();
  const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
  const out = { replies: 0, bounces: 0, auto: 0, ignored: 0 };
  for (const m of messages) {
    if (own.has(m.from)) { out.ignored++; continue; }
    const c = classify(m, ownAddresses);
    if (c.kind === 'bounce') {
      let any = false;
      for (const a of c.bounced) {
        const [lead] = await sql`select id from leads where lower(email) = ${a}`;
        if (!lead) continue;
        await suppress(a, 'bounce', 'worker');
        any = true;
      }
      if (any) out.bounces++; else out.ignored++;
      continue;
    }
    const ids = [m.inReplyTo, ...m.references].filter(Boolean) as string[];
    let lead = ids.length
      ? (await sql`select l.* from emails e join leads l on l.id = e.lead_id where e.message_id_header in ${sql(ids)} limit 1`)[0]
      : undefined;
    lead ??= (await sql`select * from leads where lower(email) = ${m.from} limit 1`)[0];
    if (!lead) { out.ignored++; continue; }
    if (c.kind === 'auto') {
      await logEvent('auto_reply', { subject: m.subject }, { lead_id: lead.id });
      out.auto++;
      continue;
    }
    const text = stripQuoted(m.text);
    await sql`update leads set
        status = case when status in ('interested', 'won', 'lost', 'unsubscribed', 'bounced') then status else 'replied' end,
        last_reply = ${text}, last_reply_at = ${m.date}, updated_at = now()
      where id = ${lead.id}`;
    const cancelled = await sql`update emails set status = 'cancelled', error = 'Lead replied' where lead_id = ${lead.id} and status in ('draft', 'approved')`;
    await logEvent('replied', { subject: m.subject, snippet: text.slice(0, 300), from: m.from, followups_cancelled: cancelled.count }, { lead_id: lead.id });
    if (OPT_OUT.test(text)) await suppress(lead.email, 'unsubscribe', 'worker');
    out.replies++;
  }
  return out;
};

export const inboxTick = async (fetcher?: typeof fetchNew) => {
  const sql = db();
  const accounts = (await sql`select * from accounts where provider in ('gmail', 'gmail_api') and status <> 'error' order by created_at`) as unknown as AccountRow[];
  const own = (await sql`select email from accounts`).map((r) => String(r.email).toLowerCase());
  const results: Record<string, unknown>[] = [];
  for (const a of accounts) {
    try {
      const fetch = fetcher ?? (a.provider === 'gmail_api' ? fetchNewGmailApi : fetchNew);
      const { messages, maxUid } = await fetch(a.email, decrypt(a.secret_enc), Number(a.imap_last_uid) || 0);
      const r = await handleInbound(messages, own);
      await sql`update accounts set imap_last_uid = ${maxUid}, imap_checked_at = now() where id = ${a.id}`;
      results.push({ account: a.email, fetched: messages.length, ...r });
    } catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 500);
      await sql`update accounts set last_error = ${'Inbox check: ' + msg}, imap_checked_at = now() where id = ${a.id}`;
      results.push({ account: a.email, error: msg });
    }
  }
  return results;
};
