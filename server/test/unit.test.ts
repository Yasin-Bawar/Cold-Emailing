import { describe, expect, it } from 'vitest';
import { localTime, zoneFor } from '../src/core/window.ts';
import { dayStart, nextGapMs, warmupCap } from '../src/core/caps.ts';
import { compose, LEGACY_PLACEHOLDER, htmlToText, stripTextHeaders } from '../src/core/compose.ts';
import { decrypt, encrypt, readUnsubToken, unsubToken } from '../src/core/crypto.ts';
import { classify, stripQuoted } from '../src/core/inbox.ts';

describe('sending window', () => {
  it('is closed on weekends, open weekday mornings, closed at night', () => {
    // 2026-11-07 is a Saturday.
    expect(localTime('America/Chicago', new Date('2026-11-07T16:00:00Z')).open).toBe(false);
    // Tuesday 10:00 Chicago = 16:00 UTC (CST, UTC-6).
    expect(localTime('America/Chicago', new Date('2026-11-03T16:00:00Z'))).toMatchObject({ open: true, hour: 10, weekday: 'Tue' });
    // Tuesday 21:00 Chicago.
    expect(localTime('America/Chicago', new Date('2026-11-04T03:00:00Z')).open).toBe(false);
    // 16:00 UTC is 8:00 in Los Angeles: open; 15:59 UTC is 7:59: closed.
    expect(localTime('America/Los_Angeles', new Date('2026-11-03T16:00:00Z')).open).toBe(true);
    expect(localTime('America/Los_Angeles', new Date('2026-11-03T15:59:00Z')).open).toBe(false);
  });
  it('maps states to zones, El Paso to Mountain', () => {
    expect(zoneFor('TX', 'Houston')).toBe('America/Chicago');
    expect(zoneFor('TX', 'El Paso')).toBe('America/Denver');
    expect(zoneFor('az', null)).toBe('America/Phoenix');
    expect(zoneFor(null, null)).toBe('America/Chicago');
  });
});

describe('limits', () => {
  it('warms up 10/20/30 then the daily cap', () => {
    const start = new Date('2026-11-01T00:00:00Z');
    expect(warmupCap(40, start, new Date('2026-11-01T12:00:00Z'))).toBe(10);
    expect(warmupCap(40, start, new Date('2026-11-08T12:00:00Z'))).toBe(20);
    expect(warmupCap(40, start, new Date('2026-11-15T12:00:00Z'))).toBe(30);
    expect(warmupCap(40, start, new Date('2026-11-22T12:00:00Z'))).toBe(40);
    expect(warmupCap(5, start, new Date('2026-11-01T12:00:00Z'))).toBe(5);
  });
  it('waits 1 to 4 minutes between sends', () => {
    expect(nextGapMs(() => 0)).toBe(60_000);
    expect(nextGapMs(() => 1)).toBe(240_000);
  });
  it('counts the day from midnight Toronto', () => {
    // 2026-11-03 02:00 UTC is Nov 2 21:00 in Toronto (EST, UTC-5).
    expect(dayStart(new Date('2026-11-03T02:00:00Z')).toISOString()).toBe('2026-11-02T05:00:00.000Z');
    expect(dayStart(new Date('2026-11-03T16:00:00Z')).toISOString()).toBe('2026-11-03T05:00:00.000Z');
  });
});

describe('compose', () => {
  const red = `<span style="color:#b91c1c;font-weight:700;">[Mavan postal address in Toronto, Canada — add it in content-us.cjs before sending]</span>`;
  it('fills the outreach placeholder and adds an unsubscribe link', () => {
    const out = compose({
      html: `<html><body><p>Hi</p><p>Mavan · ${red}</p><img src="{{image_url}}"></body></html>`,
      text: `Hi\nMavan · ${LEGACY_PLACEHOLDER}`,
      address: '1 Test St, Toronto, ON',
      unsubscribeUrl: 'https://x.test/u/abc',
      imageSrc: 'cid:concept',
    });
    expect(out.html).not.toContain('b91c1c');
    expect(out.html).toContain('<span>1 Test St, Toronto, ON</span>');
    expect(out.html).toContain('href="https://x.test/u/abc"');
    expect(out.html).toContain('src="cid:concept"');
    expect(out.html!.indexOf('Unsubscribe')).toBeLessThan(out.html!.indexOf('</body>'));
    expect(out.text).toContain('Mavan · 1 Test St, Toronto, ON');
    expect(out.text).toContain('Unsubscribe: https://x.test/u/abc');
  });
  it('uses tokens, and adds the address when there is no slot', () => {
    const a = compose({ html: '<p>{{postal_address}} <a href="{{unsubscribe_url}}">Opt out</a></p>', text: null, address: 'A & B St 1', unsubscribeUrl: 'https://u' });
    expect(a.html).toBe('<p>A &amp; B St 1 <a href="https://u">Opt out</a></p>');
    expect(a.text).toContain('A & B St 1');
    const b = compose({ html: '<p>Hello</p>', text: 'Hello', address: '9 Road', unsubscribeUrl: 'https://u' });
    expect(b.html).toContain('9 Road · <a href="https://u"');
    expect(b.text).toBe('Hello\n9 Road\nUnsubscribe: https://u');
  });
  it('refuses to send without an address', () => {
    expect(() => compose({ html: '<p>x</p>', text: 'x', address: ' ', unsubscribeUrl: 'u' })).toThrow(/postal address/i);
  });
  it('makes plain text from html and strips To/Subject lines', () => {
    expect(htmlToText('<p>Hi&nbsp;there</p><p><a href="https://m.app">site</a></p>')).toBe('Hi there\nsite (https://m.app)');
    expect(stripTextHeaders('To: a@b.c\nSubject: S\n\nBody')).toBe('Body');
  });
});

describe('crypto', () => {
  it('round-trips secrets and rejects tampering', () => {
    const p = encrypt('abcd efgh ijkl mnop');
    expect(p).not.toContain('abcd');
    expect(decrypt(p)).toBe('abcd efgh ijkl mnop');
    const parts = p.split('.');
    parts[3] = Buffer.from('zzzz').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
  it('makes unforgeable unsubscribe tokens', () => {
    const id = '3f2b8c1e-5a7d-4e9f-8b6a-1c2d3e4f5a6b';
    const t = unsubToken(id);
    expect(readUnsubToken(t)).toBe(id);
    expect(readUnsubToken(t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(readUnsubToken('garbage')).toBeNull();
  });
});

describe('inbox', () => {
  const base = { autoSubmitted: null, failedRecipients: [], text: '', raw: '' };
  it('spots bounces and the failed address', () => {
    const c = classify({ ...base, from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', text: "Your message wasn't delivered to dead@shop.com because the address couldn't be found." }, ['me@gmail.com']);
    expect(c).toEqual({ kind: 'bounce', bounced: ['dead@shop.com'] });
    expect(classify({ ...base, from: 'postmaster@x.com', subject: 'Undeliverable', failedRecipients: ['A@B.com'] }).bounced).toEqual(['a@b.com']);
  });
  it('spots auto-replies and real replies', () => {
    expect(classify({ ...base, from: 'owner@shop.com', subject: 'Automatic reply: hello' }).kind).toBe('auto');
    expect(classify({ ...base, from: 'owner@shop.com', subject: 'Re: hi', autoSubmitted: 'auto-replied' }).kind).toBe('auto');
    expect(classify({ ...base, from: 'owner@shop.com', subject: 'Re: hi', autoSubmitted: 'no' }).kind).toBe('reply');
  });
  it('drops the quoted original', () => {
    expect(stripQuoted('Sounds good, call me.\n\nOn Tue, Nov 3, 2026 at 10:00 AM Mavan <a@b.c> wrote:\n> Hi there')).toBe('Sounds good, call me.');
  });
});

import { accountDayStart, nextDayStart, warmupDays } from '../src/core/caps.ts';
describe('per-provider days and warm-up', () => {
  it('counts Resend days in UTC and others in Toronto', () => {
    const t = new Date('2026-11-04T02:30:00Z'); // Nov 3, 21:30 in Toronto
    expect(accountDayStart('resend', t).toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(accountDayStart('gmail_api', t).toISOString()).toBe('2026-11-03T05:00:00.000Z');
    expect(nextDayStart('resend', t).toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(nextDayStart('gmail', t).toISOString()).toBe('2026-11-04T05:00:00.000Z');
  });
  it('treats an account started 28 days ago as warmed up', () => {
    expect(warmupDays('2026-10-07', new Date('2026-11-04T12:00:00Z'))).toBe(28);
    expect(warmupCap(100, '2026-10-07', new Date('2026-11-04T12:00:00Z'))).toBe(100);
  });
});
