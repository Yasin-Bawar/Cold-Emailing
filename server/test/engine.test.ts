// Integration test against a real Postgres. Run with TEST_DATABASE_URL set (skipped otherwise).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutMessage, Sender } from '../src/core/senders/types.ts';

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d('send and inbox engine', async () => {
  process.env.DATABASE_URL = url;
  const { db, closeDb } = await import('../src/core/db.ts');
  const { migrate } = await import('../src/scripts/migrate.ts');
  const repo = await import('../src/core/repo.ts');
  const { sendTick, handleInbound } = await import('../src/core/engine.ts');
  const sent: OutMessage[] = [];
  let fail = false;
  const fake = (): Sender => ({
    async send(m) { if (fail) throw new Error('550 mailbox unavailable'); sent.push(m); return { providerId: `p-${sent.length}`, messageId: m.messageId }; },
    async verify() { return 'ok'; },
  });
  const TUE_10_CHICAGO = new Date('2026-11-03T16:00:00Z'); // also 8:00 Los Angeles, 9:00 Denver
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const sql = db();
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(() => {});
  });
  afterAll(async () => { await closeDb(); });

  it('holds everything until a postal address is set', async () => {
    const r = await sendTick(TUE_10_CHICAGO, fake);
    expect(r.skipped).toMatch(/postal address/i);
  });

  it('sets up an account, campaign, leads and emails', async () => {
    await repo.updateSettings({ postal_address: '1 Test St, Toronto, ON M5V 1A1', from_name: 'Mavan' });
    const acc = await repo.addAccount({ provider: 'gmail', email: 'sender@gmail.com', secret: 'abcd efgh ijkl mnop', daily_cap: 40, warmup_start: '2026-11-01' });
    ids.acc = acc.id;
    const c = await repo.createCampaign('Test campaign');
    ids.c = c.id;
    const r = await repo.upsertLeads([
      { email: 'Owner@TacoShop.com', business_name: 'Taco Shop', city: 'Houston', state: 'TX' },
      { email: 'hi@fresnocakes.com', business_name: 'Fresno Cakes', city: 'Fresno', state: 'CA' },
      { email: 'owner@tacoshop.com', business_name: 'dupe' },
    ], { campaign_id: c.id });
    expect(r.created).toHaveLength(2);
    expect(r.skipped).toEqual([{ email: 'owner@tacoshop.com', reason: 'duplicate in this batch' }]);
    const again = await repo.upsertLeads([{ email: 'owner@tacoshop.com' }]);
    expect(again.existing).toHaveLength(1);
    const taco = await repo.findLeadByEmail('owner@tacoshop.com');
    const cakes = await repo.findLeadByEmail('hi@fresnocakes.com');
    expect(taco.timezone).toBe('America/Chicago');
    expect(cakes.timezone).toBe('America/Los_Angeles');
    ids.taco = taco.id; ids.cakes = cakes.id;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const e0 = await repo.addEmail({ lead_id: taco.id, step: 0, delay_days: 0, subject: 'A website for Taco Shop', html: '<p>Hi</p><img src="{{image_url}}"><p>Mavan · {{postal_address}}</p>' }, { bytes: png, contentType: 'image/png' }, 'mcp');
    expect(e0.image_path).toMatch(/\.png$/);
    await repo.addEmail({ lead_id: taco.id, step: 1, delay_days: 3, subject: 'Re: A website for Taco Shop', text: 'Just checking in.' }, null, 'mcp');
    await repo.addEmail({ lead_email: 'hi@fresnocakes.com', step: 0, delay_days: 0, subject: 'A website for Fresno Cakes', text: 'Hello cakes' }, null, 'mcp');
    expect((await repo.listEmails({ campaign_id: c.id })).total).toBe(3);
  });

  it('sends nothing before approval, then one email per inbox per tick', async () => {
    expect((await sendTick(TUE_10_CHICAGO, fake)).results[0].held).toBe('nothing to send');
    expect(await repo.approveEmails({ campaign_id: ids.c }, 'mcp')).toEqual({ approved: 3 });
    expect((await repo.findLeadByEmail('owner@tacoshop.com')).status).toBe('queued');
    const r1 = await sendTick(TUE_10_CHICAGO, fake);
    expect(r1.results).toHaveLength(1);
    expect(r1.results[0].ok).toBe(true);
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m.html).toContain('src="cid:concept"');
    expect(m.html).toContain('1 Test St, Toronto');
    expect(m.attachments[0]).toMatchObject({ cid: 'concept', contentType: 'image/png' });
    expect(m.unsubscribeUrl).toMatch(/^https:\/\/outreach\.test\/u\//);
    // The inbox now waits 1-4 minutes.
    expect((await sendTick(new Date(TUE_10_CHICAGO.getTime() + 30_000), fake)).results).toHaveLength(0);
  });

  it('sends the second first-email after the gap, and holds the follow-up for 3 days', async () => {
    const t2 = new Date(TUE_10_CHICAGO.getTime() + 5 * 60_000);
    const r2 = await sendTick(t2, fake);
    expect(r2.results[0].ok).toBe(true);
    expect(sent.map((m) => m.to).sort()).toEqual(['hi@fresnocakes.com', 'owner@tacoshop.com']);
    expect(sent.find((m) => m.to === 'hi@fresnocakes.com')!.text).toContain('Unsubscribe: https://outreach.test/u/');
    const r3 = await sendTick(new Date(t2.getTime() + 10 * 60_000), fake);
    expect(r3.results[0].held).toBe('nothing to send');
  });

  it('does not send outside business hours', async () => {
    const satNoon = new Date('2026-11-07T18:00:00Z');
    const r = await sendTick(satNoon, fake);
    expect(r.results[0].held).toMatch(/business hours|nothing/);
  });

  it('sends the follow-up in the same thread after 3 days', async () => {
    const fri = new Date('2026-11-06T16:30:00Z');
    const r = await sendTick(fri, fake);
    expect(r.results[0].ok).toBe(true);
    const f = sent[sent.length - 1];
    expect(f.to).toBe('owner@tacoshop.com');
    expect(f.inReplyTo).toBe(sent[0].messageId);
    expect(f.references).toBe(sent[0].messageId);
  });

  it('records a reply, cancels pending follow-ups, and an opt-out reply suppresses', async () => {
    await repo.addEmail({ lead_id: ids.cakes, step: 1, delay_days: 3, subject: 'Re: cakes', text: 'Following up' });
    await repo.approveEmails({ campaign_id: ids.c });
    const cakesMsg = sent.find((m) => m.to === 'hi@fresnocakes.com')!;
    const r = await handleInbound([{
      uid: 5, from: 'hi@fresnocakes.com', subject: 'Re: A website for Fresno Cakes', date: new Date('2026-11-04T18:00:00Z'),
      messageId: '<r1@x>', inReplyTo: cakesMsg.messageId, references: [cakesMsg.messageId], autoSubmitted: null, failedRecipients: [], raw: '',
      text: 'Love it, can we talk Thursday?\n\nOn Tue, Nov 3, 2026 Mavan <sender@gmail.com> wrote:\n> Hi',
    }], ['sender@gmail.com']);
    expect(r.replies).toBe(1);
    const lead = await repo.getLead(ids.cakes);
    expect(lead!.status).toBe('replied');
    expect(lead!.last_reply).toBe('Love it, can we talk Thursday?');
    expect(lead!.emails.find((e: any) => e.step === 1).status).toBe('cancelled');
    expect((await repo.listReplies()).length).toBe(1);

    await repo.upsertLeads([{ email: 'nope@shop.com', business_name: 'Nope' }]);
    await handleInbound([{ uid: 6, from: 'nope@shop.com', subject: 'Re: hi', date: new Date(), messageId: null, inReplyTo: null, references: [], autoSubmitted: null, failedRecipients: [], raw: '', text: 'No thanks.' }], ['sender@gmail.com']);
    expect((await repo.findLeadByEmail('nope@shop.com')).status).toBe('unsubscribed');
  });

  it('suppresses bounces and never re-adds suppressed leads', async () => {
    await repo.upsertLeads([{ email: 'dead@shop.com', business_name: 'Dead' }]);
    const r = await handleInbound([{ uid: 7, from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', date: new Date(), messageId: null, inReplyTo: null, references: [], autoSubmitted: null, failedRecipients: [], raw: '', text: "Your message wasn't delivered to dead@shop.com" }], ['sender@gmail.com']);
    expect(r.bounces).toBe(1);
    expect((await repo.findLeadByEmail('dead@shop.com')).status).toBe('bounced');
    expect((await repo.upsertLeads([{ email: 'dead@shop.com' }])).skipped[0].reason).toMatch(/suppression/);
    expect((await repo.listSuppression()).total).toBe(2);
  });

  it('marks failures and pauses an inbox after 3 in a row', async () => {
    await repo.upsertLeads([1, 2, 3].map((i) => ({ email: `f${i}@x.com`, state: 'TX' })), { campaign_id: ids.c });
    for (const i of [1, 2, 3]) await repo.addEmail({ lead_email: `f${i}@x.com`, step: 0, delay_days: 0, subject: 's', text: 't' });
    await repo.approveEmails({ campaign_id: ids.c });
    fail = true;
    let t = new Date('2026-11-09T15:00:00Z'); // Monday 9:00 Chicago
    for (let i = 0; i < 3; i++) { await sendTick(t, fake); t = new Date(t.getTime() + 6 * 60_000); }
    const [a] = (await repo.listAccounts(t)).filter((x) => x.id === ids.acc);
    expect(a.status).toBe('error');
    expect(a.fail_streak).toBe(3);
    expect((await repo.listEmails({ status: ['failed'] })).total).toBe(3);
    fail = false;
  });

  it('reports stats and queue status', async () => {
    const s = await repo.stats(14, new Date('2026-11-09T18:00:00Z'));
    expect(s.totals.sent).toBe(3);
    expect(s.totals.replied).toBe(2);
    expect(s.daily.length).toBeGreaterThan(10);
    const q = await repo.queueStatus(new Date('2026-11-09T18:00:00Z'));
    expect(q.postal_address_set).toBe(true);
    expect(q.accounts[0].status).toBe('error');
    const f = await repo.leadFacets();
    expect(f.state.find((x: any) => x.value === 'TX')!.count).toBeGreaterThan(1);
    const found = await repo.searchLeads({ q: 'taco', limit: 25, offset: 0, sort: 'created_at', dir: 'desc' });
    expect(found.total).toBe(1);
  });
});

const d2 = process.env.TEST_DATABASE_URL ? describe : describe.skip;
d2('template generation', async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { db, closeDb } = await import('../src/core/db.ts');
  const { migrate } = await import('../src/scripts/migrate.ts');
  const repo = await import('../src/core/repo.ts');
  const { generateEmails } = await import('../src/core/generate.ts');
  afterAll(async () => { await closeDb(); });

  it('drafts one email per lead, never repeats a design in a city, and skips unknown types', async () => {
    const sql = db();
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    await migrate(() => {});
    const c = await repo.createCampaign('Templates');
    const leads = [
      ...Array.from({ length: 12 }, (_, i) => ({ email: `b${i}@x.com`, business_name: `Barber ${i}`, category: 'Barbershop', city: 'Tulsa', state: 'OK' })),
      { email: 'truck@x.com', business_name: 'Taco Loco', category: 'Food truck', city: 'Tulsa', state: 'OK', custom: { hook: 'Your birria quesatacos sell out by noon.', rating: 4.9, reviews: 210 } },
      { email: 'acct@x.com', business_name: 'Numbers LLC', category: 'Accounting', city: 'Tulsa', state: 'OK' },
      { email: 'forced@x.com', business_name: 'Mystery Spot', category: 'Shop', city: 'Tulsa', state: 'OK', custom: { type: 'tattoo' } },
    ];
    await repo.upsertLeads(leads as any, { campaign_id: c.id });
    const r = await generateEmails({ campaign_id: c.id, followup: true });
    expect(r.created).toBe(14);
    expect(r.followups).toBe(14);
    expect(r.skipped).toEqual([{ email: 'acct@x.com', reason: expect.stringMatching(/unknown business type/) }]);
    expect(r.by_type).toEqual({ barbershop: 12, 'food-truck': 1, tattoo: 1 });
    const designs = (await sql`select e.design from emails e join leads l on l.id = e.lead_id where l.category = 'Barbershop' and e.step = 0`).map((x) => x.design);
    expect(new Set(designs.slice(0, 10)).size).toBe(10); // first ten barbers in Tulsa all different
    expect(new Set(designs).size).toBe(10); // 11th and 12th reuse only after all ten are used
    const [truck] = await sql`select e.html, e.subject from emails e join leads l on l.id = e.lead_id where l.email = 'truck@x.com' and e.step = 0`;
    expect(truck.html).toContain('Your birria quesatacos sell out by noon.');
    expect(truck.subject).toContain('Taco Loco');
    const [fu] = await sql`select e.subject, e.delay_days from emails e join leads l on l.id = e.lead_id where l.email = 'truck@x.com' and e.step = 1`;
    expect(fu.subject).toBe(`Re: ${truck.subject}`);
    expect(fu.delay_days).toBe(4);
    // Running again creates nothing new.
    const again = await generateEmails({ campaign_id: c.id });
    expect(again.created).toBe(0);
    // Overwrite re-renders template drafts with new details.
    await repo.upsertLeads([{ email: 'truck@x.com', custom: { hook: 'New hook line.' } }] as any);
    const re = await generateEmails({ campaign_id: c.id, overwrite: true, lead_ids: [(await repo.findLeadByEmail('truck@x.com')).id] });
    expect(re.created).toBe(1);
    const [truck2] = await sql`select e.html from emails e join leads l on l.id = e.lead_id where l.email = 'truck@x.com' and e.step = 0`;
    expect(truck2.html).toContain('New hook line.');
  });
});
