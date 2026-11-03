// Gmail connected with Google sign-in: sends and reads mail through the Gmail API over HTTPS (port 443).
// Needed on hosts that block SMTP ports (Railway Trial/Hobby). Scopes: send mail and read the inbox (for replies).
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { createHmac, randomBytes } from 'node:crypto';
import { env } from './env.ts';
import { unsubscribeHeaders, type OutMessage, type Sender } from './senders/types.ts';
import type { InMessage } from './inbox.ts';

export const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
const oauthBase = () => process.env.GOOGLE_OAUTH_BASE || 'https://oauth2.googleapis.com';
const authBase = () => process.env.GOOGLE_AUTH_BASE || 'https://accounts.google.com';
const apiBase = () => process.env.GMAIL_API_BASE || 'https://gmail.googleapis.com';

export const googleConfigured = () => !!(env.googleClientId && env.googleClientSecret);
export const redirectUri = () => `${env.publicUrl}/oauth/google/callback`;

// State parameter: random nonce + expiry, signed, so the callback can't be forged.
const sign = (s: string) => createHmac('sha256', `oauth:${env.encryptionKey}`).update(s).digest('base64url').slice(0, 32);
export const makeState = () => { const v = `${randomBytes(12).toString('base64url')}.${Date.now() + 10 * 60_000}`; return `${v}.${sign(v)}`; };
export const checkState = (state: string) => {
  const [n, exp, sig] = state.split('.');
  return !!n && Number(exp) > Date.now() && sign(`${n}.${exp}`) === sig;
};

export const authUrl = (state: string, loginHint?: string) => {
  const p = new URLSearchParams({
    client_id: env.googleClientId, redirect_uri: redirectUri(), response_type: 'code', scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state, ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `${authBase()}/o/oauth2/v2/auth?${p}`;
};

const tokenCall = async (body: Record<string, string>) => {
  const r = await fetch(`${oauthBase()}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...body }),
    signal: AbortSignal.timeout(30_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google sign-in: ${j.error_description || j.error || r.status}`);
  return j as { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
};

export const exchangeCode = async (code: string) => {
  const t = await tokenCall({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
  const missing = GOOGLE_SCOPES.filter((s) => !(t.scope || '').includes(s));
  if (missing.length) throw new Error('Please tick both boxes on Google’s screen (send email and read email), then connect again.');
  const profile = await gmailCall(t.access_token, '/gmail/v1/users/me/profile');
  return { email: String(profile.emailAddress).toLowerCase(), refreshToken: t.refresh_token };
};

// Access tokens last an hour; cache one per refresh token.
const cache = new Map<string, { token: string; until: number }>();
export const accessToken = async (refreshToken: string) => {
  const c = cache.get(refreshToken);
  if (c && c.until > Date.now() + 60_000) return c.token;
  const t = await tokenCall({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  cache.set(refreshToken, { token: t.access_token, until: Date.now() + t.expires_in * 1000 });
  return t.access_token;
};

const gmailCall = async (token: string, path: string, init: RequestInit = {}) => {
  const r = await fetch(`${apiBase()}${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }, signal: AbortSignal.timeout(60_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gmail API ${r.status}: ${j.error?.message || 'request failed'}`);
  return j;
};

// Builds the exact same MIME message the SMTP sender would send.
const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
export const buildRaw = async (m: OutMessage) => {
  const info: any = await composer.sendMail({
    from: { name: m.fromName, address: m.from }, to: m.to, subject: m.subject, html: m.html ?? undefined, text: m.text,
    replyTo: m.replyTo || undefined, messageId: m.messageId, inReplyTo: m.inReplyTo || undefined, references: m.references || undefined,
    headers: unsubscribeHeaders(m),
    attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType, cid: a.cid })),
  });
  return Buffer.from(info.message as Buffer);
};

export const gmailApiSender = (email: string, refreshToken: string): Sender => ({
  async send(m) {
    const token = await accessToken(refreshToken);
    const raw = (await buildRaw(m)).toString('base64url');
    const sent = await gmailCall(token, '/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw }) });
    // Gmail may assign its own Message-ID; store the real one so replies can be matched to this email.
    let messageId = m.messageId;
    try {
      const meta = await gmailCall(token, `/gmail/v1/users/me/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
      const h = (meta.payload?.headers || []).find((x: any) => /^message-id$/i.test(x.name));
      if (h?.value) messageId = h.value;
    } catch { /* keep ours */ }
    return { providerId: String(sent.id), messageId };
  },
  async verify() {
    const token = await accessToken(refreshToken);
    const p = await gmailCall(token, '/gmail/v1/users/me/profile');
    if (String(p.emailAddress).toLowerCase() !== email.toLowerCase()) throw new Error(`Connected to ${p.emailAddress}, expected ${email}`);
    return `Connected to ${p.emailAddress} with Google (${p.messagesTotal} messages)`;
  },
});

// New inbox messages since `sinceMs` (the internal date of the newest one already processed).
export const fetchNewGmailApi = async (_email: string, refreshToken: string, sinceMs: number): Promise<{ messages: InMessage[]; maxUid: number }> => {
  const token = await accessToken(refreshToken);
  const after = Math.floor((sinceMs > 0 ? sinceMs : Date.now() - 14 * 86_400_000) / 1000) - 60;
  const ids: string[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ q: `in:inbox after:${after}`, maxResults: '100', ...(pageToken ? { pageToken } : {}) });
    const list = await gmailCall(token, `/gmail/v1/users/me/messages?${q}`);
    ids.push(...(list.messages || []).map((x: any) => x.id));
    pageToken = list.nextPageToken || '';
  } while (pageToken && ids.length < 500);
  const messages: InMessage[] = [];
  let maxUid = sinceMs;
  for (const id of ids.reverse()) {
    const full = await gmailCall(token, `/gmail/v1/users/me/messages/${id}?format=raw`);
    const internal = Number(full.internalDate || 0);
    if (internal <= sinceMs) continue;
    maxUid = Math.max(maxUid, internal);
    const source = Buffer.from(String(full.raw), 'base64url');
    const p = await simpleParser(source);
    const refs = p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : [];
    const failed = String(p.headers.get('x-failed-recipients') || '').match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    messages.push({
      uid: internal,
      from: String((p.from as any)?.value?.[0]?.address || '').toLowerCase(),
      subject: p.subject || '',
      date: p.date || new Date(internal),
      messageId: p.messageId || null,
      inReplyTo: p.inReplyTo || null,
      references: refs,
      text: p.text || (typeof p.html === 'string' ? p.html.replace(/<[^>]+>/g, ' ') : ''),
      autoSubmitted: (p.headers.get('auto-submitted') as string) || null,
      failedRecipients: failed,
      raw: source.toString('utf8', 0, Math.min(source.length, 20000)),
    });
  }
  return { messages, maxUid };
};
