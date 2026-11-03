import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from './env.ts';

export type InMessage = {
  uid: number;
  from: string;
  subject: string;
  date: Date;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  text: string;
  autoSubmitted: string | null;
  failedRecipients: string[];
  raw: string; // first part of the raw source, used to find bounced addresses
};

export type Classified = { kind: 'bounce' | 'auto' | 'reply'; bounced: string[] };

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export const classify = (m: Pick<InMessage, 'from' | 'subject' | 'autoSubmitted' | 'failedRecipients' | 'text' | 'raw'>, ownAddresses: string[] = []): Classified => {
  const from = m.from.toLowerCase();
  const subject = m.subject || '';
  const isBounce =
    /mailer-daemon|postmaster|mail delivery (subsystem|system)/i.test(from) ||
    /delivery status notification \(failure\)|undeliverable|undelivered mail|mail delivery failed|returned to sender|delivery has failed|failure notice|address not found/i.test(subject);
  if (isBounce) {
    const own = new Set(ownAddresses.map((a) => a.toLowerCase()));
    const found = new Set<string>(m.failedRecipients.map((a) => a.toLowerCase()));
    if (!found.size) {
      for (const a of `${m.text}\n${m.raw}`.match(EMAIL_RE) || []) {
        const x = a.toLowerCase();
        if (!own.has(x) && !/mailer-daemon|postmaster|googlemail\.com$|google\.com$/.test(x)) found.add(x);
      }
    }
    return { kind: 'bounce', bounced: [...found] };
  }
  if ((m.autoSubmitted && !/^no$/i.test(m.autoSubmitted)) || /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|autoreply)/i.test(subject))
    return { kind: 'auto', bounced: [] };
  return { kind: 'reply', bounced: [] };
};

// Removes the quoted original from a reply ("On ... wrote:" and "> " lines) so the dashboard shows only what they wrote.
export const stripQuoted = (text: string) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if (/^On .{4,200}wrote:\s*$/.test(l) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^From: .+/.test(l) && out.length > 0) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').trim().slice(0, 4000);
};

const addr = (v: any): string => {
  const a = v?.value?.[0]?.address || v?.[0]?.address || '';
  return String(a).toLowerCase();
};

// Reads new messages from a Gmail inbox over IMAP (App Password). Returns them with the highest UID seen.
export const fetchNew = async (email: string, appPassword: string, lastUid: number): Promise<{ messages: InMessage[]; maxUid: number }> => {
  const client = new ImapFlow({
    host: env.smtpHostOverride || 'imap.gmail.com',
    port: env.smtpHostOverride ? Number(process.env.IMAP_PORT_OVERRIDE || 1143) : 993,
    secure: !env.smtpHostOverride,
    auth: { user: email, pass: appPassword.replace(/\s+/g, '') },
    logger: false,
  });
  await client.connect();
  const messages: InMessage[] = [];
  let maxUid = lastUid;
  const lock = await client.getMailboxLock('INBOX');
  try {
    const query = lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 14 * 86_400_000) };
    const uids = ((await client.search(query, { uid: true })) || []).filter((u: number) => u > lastUid).slice(-500);
    if (uids.length) {
      for await (const msg of client.fetch(uids.join(','), { uid: true, source: true }, { uid: true })) {
        if (!msg.source || msg.uid <= lastUid) continue;
        maxUid = Math.max(maxUid, msg.uid);
        const p = await simpleParser(msg.source);
        const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : [];
        const failed = String(p.headers.get('x-failed-recipients') || '').match(EMAIL_RE) || [];
        messages.push({
          uid: msg.uid,
          from: addr(p.from),
          subject: p.subject || '',
          date: p.date || new Date(),
          messageId: p.messageId || null,
          inReplyTo: p.inReplyTo || null,
          references: refs,
          text: p.text || (typeof p.html === 'string' ? p.html.replace(/<[^>]+>/g, ' ') : ''),
          autoSubmitted: (p.headers.get('auto-submitted') as string) || null,
          failedRecipients: failed,
          raw: msg.source.toString('utf8', 0, Math.min(msg.source.length, 20000)),
        });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => client.close());
  }
  return { messages, maxUid };
};

export const verifyImap = async (email: string, appPassword: string) => {
  const client = new ImapFlow({
    host: env.smtpHostOverride || 'imap.gmail.com',
    port: env.smtpHostOverride ? Number(process.env.IMAP_PORT_OVERRIDE || 1143) : 993,
    secure: !env.smtpHostOverride,
    auth: { user: email, pass: appPassword.replace(/\s+/g, '') },
    logger: false,
  });
  try {
    await client.connect();
    const box = await client.mailboxOpen('INBOX', { readOnly: true });
    return `IMAP works (${box.exists} messages in the inbox)`;
  } catch (e) {
    throw new Error(`IMAP: ${(e as Error).message}`);
  } finally {
    await client.logout().catch(() => client.close());
  }
};
