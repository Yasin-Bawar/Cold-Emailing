// Gmail API (Google sign-in) against a fake Google server. The OAuth callback part needs TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const sentRaw: string[] = [];
const replyRaw = [
  'From: Owner <owner@shop.com>', 'To: me@gmail.com', 'Subject: Re: Hello', 'Message-ID: <reply1@shop.com>',
  'In-Reply-To: <gmail-assigned@mail.gmail.com>', 'References: <gmail-assigned@mail.gmail.com>', 'Date: Tue, 03 Nov 2026 16:00:00 +0000',
  'Content-Type: text/plain; charset=utf-8', '', 'Yes, call me.', '', 'On Tue, Nov 3, 2026 Mavan <me@gmail.com> wrote:', '> Hi',
].join('\r\n');

const fake = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = (o: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const url = new URL(req.url!, 'http://x');
  if (url.pathname === '/token') {
    const p = new URLSearchParams(body);
    if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'good' ? json({ access_token: 'at1', expires_in: 3600, refresh_token: 'rt1', scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly' }) : json({ error: 'invalid_grant' }, 400);
    return p.get('refresh_token') === 'rt1' ? json({ access_token: 'at2', expires_in: 3600 }) : json({ error: 'invalid_grant' }, 400);
  }
  if (!/^Bearer at[12]$/.test(req.headers.authorization || '')) return json({ error: { message: 'bad token' } }, 401);
  if (url.pathname === '/gmail/v1/users/me/profile') return json({ emailAddress: 'Me@gmail.com', messagesTotal: 5 });
  if (url.pathname === '/gmail/v1/users/me/messages/send') { sentRaw.push(JSON.parse(body).raw); return json({ id: 'g1', threadId: 't1' }); }
  if (url.pathname === '/gmail/v1/users/me/messages/g1') return json({ payload: { headers: [{ name: 'Message-Id', value: '<gmail-assigned@mail.gmail.com>' }] } });
  if (url.pathname === '/gmail/v1/users/me/messages') return json({ messages: [{ id: 'r1' }] });
  if (url.pathname === '/gmail/v1/users/me/messages/r1') return json({ id: 'r1', internalDate: '1793721600000', raw: Buffer.from(replyRaw).toString('base64url') });
  json({ error: { message: 'not found' } }, 404);
});

describe('Gmail API with Google sign-in', async () => {
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => fake.listen(0, r));
    base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
    Object.assign(process.env, { GOOGLE_OAUTH_BASE: base, GMAIL_API_BASE: base, GOOGLE_AUTH_BASE: base, GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret' });
  });
  afterAll(() => { fake.close(); });
  const g = await import('../src/core/google.ts');

  it('signs state and builds the consent URL', () => {
    const s = g.makeState();
    expect(g.checkState(s)).toBe(true);
    expect(g.checkState(s.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBe(false);
    const u = new URL(g.authUrl(s));
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('scope')).toContain('gmail.send');
    expect(u.searchParams.get('redirect_uri')).toBe('https://outreach.test/oauth/google/callback');
  });

  it('exchanges the code for a refresh token and the address', async () => {
    expect(await g.exchangeCode('good')).toEqual({ email: 'me@gmail.com', refreshToken: 'rt1' });
    await expect(g.exchangeCode('bad')).rejects.toThrow(/invalid_grant/);
  });

  it('sends the same MIME message as SMTP would, and records Gmail’s Message-ID', async () => {
    const s = g.gmailApiSender('me@gmail.com', 'rt1');
    expect(await s.verify()).toMatch(/Connected to Me@gmail.com/);
    const r = await s.send({
      from: 'me@gmail.com', fromName: 'Mavan', to: 'owner@shop.com', subject: 'Hello', html: '<p>Hi</p><img src="cid:concept">', text: 'Hi',
      messageId: '<ours@gmail.com>', unsubscribeUrl: 'https://x.test/u/t', inReplyTo: '<prev@gmail.com>', references: '<prev@gmail.com>',
      attachments: [{ filename: 'concept.png', content: Buffer.from('png'), contentType: 'image/png', cid: 'concept' }],
    });
    expect(r).toEqual({ providerId: 'g1', messageId: '<gmail-assigned@mail.gmail.com>' });
    const raw = Buffer.from(sentRaw[0], 'base64url').toString();
    expect(raw).toMatch(/List-Unsubscribe: <https:\/\/x\.test\/u\/t>/);
    expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(raw).toContain('In-Reply-To: <prev@gmail.com>');
    expect(raw).toContain('Content-ID: <concept>');
  });

  it('reads new inbox messages', async () => {
    const r = await g.fetchNewGmailApi('me@gmail.com', 'rt1', 0);
    expect(r.maxUid).toBe(1793721600000);
    expect(r.messages[0]).toMatchObject({ from: 'owner@shop.com', inReplyTo: '<gmail-assigned@mail.gmail.com>', subject: 'Re: Hello' });
    expect((await g.fetchNewGmailApi('me@gmail.com', 'rt1', 1793721600000)).messages).toHaveLength(0);
  });

  const url = process.env.TEST_DATABASE_URL;
  (url ? it : it.skip)('connects an account through the callback, sends with it and matches the reply', async () => {
    process.env.DATABASE_URL = url;
    const { db, closeDb } = await import('../src/core/db.ts');
    const { migrate } = await import('../src/scripts/migrate.ts');
    const { buildApp } = await import('../src/api/app.ts');
    const repo = await import('../src/core/repo.ts');
    const { sendTick, inboxTick } = await import('../src/core/engine.ts');
    const sql = db();
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(() => {});
    const server = buildApp().listen(0);
    const app = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const bad = await fetch(`${app}/oauth/google/callback?code=good&state=forged`, { redirect: 'manual' });
      expect(bad.headers.get('location')).toMatch(/error=/);
      const ok = await fetch(`${app}/oauth/google/callback?code=good&state=${encodeURIComponent(g.makeState())}`, { redirect: 'manual' });
      expect(ok.headers.get('location')).toBe('/accounts?connected=me%40gmail.com');
      const [acc] = await repo.listAccounts();
      expect(acc).toMatchObject({ provider: 'gmail_api', email: 'me@gmail.com', status: 'active' });
      expect((await fetch(`${app}/oauth/google/start`, { redirect: 'manual' })).status).toBe(401);

      await repo.updateSettings({ postal_address: '1 Test St' });
      await repo.upsertLeads([{ email: 'owner@shop.com', business_name: 'Shop', state: 'TX' }]);
      await repo.addEmail({ lead_email: 'owner@shop.com', step: 0, delay_days: 0, subject: 'Hello', text: 'Hi' });
      await repo.addEmail({ lead_email: 'owner@shop.com', step: 1, delay_days: 3, subject: 'Re: Hello', text: 'Following up' });
      await repo.approveEmails({ ids: (await repo.listEmails({})).rows.map((r: any) => r.id) });
      const r = await sendTick(new Date('2026-11-03T16:00:00Z'));
      expect(r.results[0]).toMatchObject({ ok: true, to: 'owner@shop.com' });
      const [e] = await sql`select message_id_header, provider_message_id from emails where step = 0`;
      expect(e).toEqual({ message_id_header: '<gmail-assigned@mail.gmail.com>', provider_message_id: 'g1' });
      const inbox = await inboxTick();
      expect(inbox[0]).toMatchObject({ account: 'me@gmail.com', replies: 1 });
      const lead = await repo.findLeadByEmail('owner@shop.com');
      expect(lead.status).toBe('replied');
      expect(lead.last_reply).toBe('Yes, call me.');
      const [f] = await sql`select status from emails where step = 1`;
      expect(f.status).toBe('cancelled');
    } finally {
      server.close();
      await closeDb();
    }
  });
});
