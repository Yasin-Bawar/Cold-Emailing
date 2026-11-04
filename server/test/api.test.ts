// API + MCP integration test against a real Postgres (TEST_DATABASE_URL), app started in-process.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('REST API and MCP server', async () => {
  process.env.DATABASE_URL = url;
  const { db, closeDb } = await import('../src/core/db.ts');
  const { migrate } = await import('../src/scripts/migrate.ts');
  const { buildApp } = await import('../src/api/app.ts');
  const { createToken } = await import('../src/api/auth.ts');
  const { unsubToken } = await import('../src/core/crypto.ts');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  let server: Server;
  let base = '';
  let token = '';
  let cookie = '';

  beforeAll(async () => {
    const sql = db();
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(() => {});
    token = (await createToken('test')).token;
    server = buildApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await closeDb(); });

  const mcp = async (t = token) => {
    const c = new Client({ name: 'test', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${t}` } } }));
    return c;
  };
  const call = async (c: any, name: string, args: Record<string, unknown> = {}) => {
    const r = await c.callTool({ name, arguments: args });
    const text = r.content[0].text as string;
    if (r.isError) throw new Error(text);
    return JSON.parse(text);
  };

  it('requires sign-in, accepts the password, rejects a wrong one', async () => {
    expect((await fetch(`${base}/api/stats`)).status).toBe(401);
    expect((await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"nope"}' })).status).toBe(401);
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"test-password"}' });
    expect(r.status).toBe(200);
    cookie = r.headers.get('set-cookie')!.split(';')[0];
    expect((await fetch(`${base}/api/stats`, { headers: { cookie } })).status).toBe(200);
  });

  it('rejects MCP calls without a valid token', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer wrong' }, body: '{}' });
    expect(r.status).toBe(401);
    await expect(mcp('bad')).rejects.toThrow();
  });

  it('lists the MCP tools', async () => {
    const c = await mcp();
    const { tools } = await c.listTools();
    const names = tools.map((t: any) => t.name);
    for (const n of ['create_campaign', 'add_leads', 'add_email', 'add_followup', 'approve_emails', 'queue_status', 'list_replies', 'suppress_email', 'stats', 'pause_sending', 'delete_leads', 'delete_campaign'])
      expect(names).toContain(n);
    await c.close();
  });

  it('runs the Claude flow: campaign, leads, email with image, follow-up, approve', async () => {
    const c = await mcp();
    const camp = await call(c, 'create_campaign', { name: 'MCP test', notes: 'from test' });
    const leads = Array.from({ length: 102 }, (_, i) => ({ email: `shop${i}@example.com`, business_name: `Shop ${i}`, city: 'Tulsa', state: 'OK', source_url: 'https://facebook.com/x' }));
    const added = await call(c, 'add_leads', { leads, campaign: 'MCP test', list: 'Tulsa shops' });
    expect(added.created).toBe(102);
    const again = await call(c, 'add_leads', { leads: leads.slice(0, 2) });
    expect(again.existing).toBe(2);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    for (const l of leads) {
      await call(c, 'add_email', { lead: l.email, subject: `Hello ${l.business_name}`, html: `<p>Hi</p><img src="{{image_url}}"><p>{{postal_address}}</p>`, text: 'Hi', image_base64: png });
    }
    const f = await call(c, 'add_followup', { lead: 'shop0@example.com', subject: 'Re: Hello Shop 0', text: 'Checking in', delay_days: 4 });
    expect(f.step).toBe(1);
    const list = await call(c, 'list_emails', { campaign: camp.id, limit: 5 });
    expect(list.total).toBe(103);
    const big = await call(c, 'approve_emails', { campaign: 'MCP test' });
    expect(big.approved).toBe(0);
    expect(big.would_approve).toBe(103);
    expect((await call(c, 'approve_emails', { campaign: 'MCP test', confirm: true })).approved).toBe(103);
    const q = await call(c, 'queue_status');
    expect(q.queue.approved).toBe(103);
    expect(q.postal_address_set).toBe(false);
    const found = await call(c, 'list_leads', { q: 'Shop 10', limit: 5 });
    expect(found.total).toBeGreaterThanOrEqual(1);
    const upd = await call(c, 'update_lead', { lead: 'shop5@example.com', status: 'interested', notes: 'Wants a call' });
    expect(upd.status).toBe('interested');
    const lead = await call(c, 'get_lead', { lead: 'shop5@example.com' });
    expect(lead.emails[0].status).toBe('cancelled');
    expect((await call(c, 'pause_sending')).paused).toBe(true);
    expect((await call(c, 'resume_sending')).paused).toBe(false);
    await expect(call(c, 'add_email', { lead: 'nobody@example.com', subject: 's', text: 't' })).rejects.toThrow(/Lead not found/);
    await c.close();
  });

  it('serves the email preview with a signed image link', async () => {
    const r = await fetch(`${base}/api/emails?limit=1`, { headers: { cookie } });
    const { rows } = await r.json();
    const p = await fetch(`${base}/api/emails/${rows[0].id}/preview`, { headers: { cookie } });
    expect(p.headers.get('content-security-policy')).toMatch(/sandbox/);
    const html = await p.text();
    const img = /src="(\/files\/[^"]+)"/.exec(html)![1].replace(/&amp;/g, '&');
    const ok = await fetch(base + img);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect((await fetch(base + img.replace(/sig=[^&]+/, 'sig=bad'))).status).toBe(403);
  });

  it('unsubscribes with the confirm page and with one-click POST', async () => {
    const sql = db();
    const [l1] = await sql`select id from leads where email = 'shop1@example.com'`;
    const [l2] = await sql`select id from leads where email = 'shop2@example.com'`;
    const page = await fetch(`${base}/u/${unsubToken(l1.id)}`);
    expect(await page.text()).toContain('shop1@example.com');
    const [still] = await sql`select status from leads where id = ${l1.id}`;
    expect(still.status).not.toBe('unsubscribed');
    await fetch(`${base}/u/${unsubToken(l1.id)}`, { method: 'POST' });
    await fetch(`${base}/u/${unsubToken(l2.id)}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    const rows = await sql`select email, status from leads where id in (${l1.id}, ${l2.id}) order by email`;
    expect(rows.map((r) => r.status)).toEqual(['unsubscribed', 'unsubscribed']);
    expect((await fetch(`${base}/u/bogus.token`)).status).toBe(404);
  });

  it('bulk include/exclude, CSV export and validation errors', async () => {
    const h = { cookie, 'content-type': 'application/json' };
    const inc = await (await fetch(`${base}/api/leads/bulk`, { method: 'POST', headers: h, body: JSON.stringify({ action: 'include', csv: 'Email,Company,City,State\nnew1@x.com,New One,Waco,TX\nbad-row,Nope,,\n"new2@x.com","Two, Inc",Mesa,AZ\n' }) })).json();
    expect(inc.created).toHaveLength(2);
    expect(inc.invalid_rows).toBe(1);
    const exc = await (await fetch(`${base}/api/leads/bulk`, { method: 'POST', headers: h, body: JSON.stringify({ action: 'exclude', text: 'new1@x.com\nfoo bar new2@x.com' }) })).json();
    expect(exc.excluded).toBe(2);
    const csv = await (await fetch(`${base}/api/leads/export.csv?state=AZ`, { headers: { cookie } })).text();
    expect(csv.split('\n')[1]).toContain('"Two, Inc"');
    const bad = await fetch(`${base}/api/campaigns`, { method: 'POST', headers: h, body: '{}' });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/name/);
  });
  it('deletes a campaign with its leads, keeping leads that were already emailed', async () => {
    const h = { cookie, 'content-type': 'application/json' };
    const post = async (p: string, b: unknown) => (await fetch(`${base}/api${p}`, { method: 'POST', headers: h, body: JSON.stringify(b) })).json();
    const camp = await post('/campaigns', { name: 'Delete me' });
    const up = await post('/leads', { campaign_id: camp.id, leads: [{ email: 'del1@x.com', state: 'TX' }, { email: 'del2@x.com', state: 'TX' }, { email: 'del3@x.com', state: 'TX' }] });
    const [a, b] = up.created;
    const e = await post('/emails', { lead_id: a.id, campaign_id: camp.id, step: 0, subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    await post('/emails', { lead_id: b.id, campaign_id: camp.id, step: 0, subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    await db()`update emails set status = 'sent', sent_at = now() where id = ${e.id}`;
    const r = await (await fetch(`${base}/api/campaigns/${camp.id}?leads=1`, { method: 'DELETE', headers: { cookie } })).json();
    expect(r).toMatchObject({ ok: true, deleted: true, leads_deleted: 2, leads_kept: 1 });
    const left = await db()`select l.email, l.campaign_id, (select count(*)::int from emails x where x.lead_id = l.id) as emails from leads l where l.email like 'del%@x.com'`;
    expect(left).toEqual([{ email: 'del1@x.com', campaign_id: null, emails: 1 }]);

    // MCP: delete_leads asks for confirm above 10 and never deletes an emailed lead; delete_campaign needs confirm
    const c = await mcp();
    await post('/leads', { leads: [{ email: 'del4@x.com', state: 'TX' }] });
    const d = await call(c, 'delete_leads', { leads: ['del1@x.com', 'del4@x.com'] });
    expect(d).toMatchObject({ deleted: 1, kept_contacted: ['del1@x.com'] });
    const c2 = await post('/campaigns', { name: 'Delete me too' });
    expect(await call(c, 'delete_campaign', { campaign: 'Delete me too' })).toMatchObject({ deleted: false });
    expect(await call(c, 'delete_campaign', { campaign: 'Delete me too', confirm: true })).toMatchObject({ deleted: true });
    expect((await fetch(`${base}/api/campaigns/${c2.id}`, { headers: { cookie } })).status).toBe(404);
    await c.close();
  });
});
