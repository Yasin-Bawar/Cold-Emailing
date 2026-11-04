import { describe, expect, it } from 'vitest';
import { TYPES, detectType, listDesigns, renderDesign, renderFollowup, SAMPLE, DESIGNS_PER_TYPE } from '../src/templates/index.ts';
import { compose } from '../src/core/compose.ts';
import { existsSync } from 'node:fs';
import path from 'node:path';

describe('templates', () => {
  it('has 14 types x 10 designs, and every photo exists', () => {
    expect(TYPES.length).toBe(14);
    expect(DESIGNS_PER_TYPE).toBe(10);
    expect(listDesigns().length).toBe(140);
    for (const t of TYPES) {
      expect(t.accents.length).toBe(10);
      for (const p of t.photos) expect(existsSync(path.resolve('assets/photos', t.key, `${p}.jpg`)), `${t.key}/${p}`).toBe(true);
    }
  });

  it('renders all 140 designs with only send-time tokens left, under 60 KB each', () => {
    const subjects = new Set<string>();
    for (const d of listDesigns()) {
      const r = renderDesign(d.key, { ...SAMPLE[d.type], hook: 'Saw your 4.9-star reviews & "best fade" comments.', first_name: 'Ana' });
      const left = (r.html + r.text).match(/\{\{[a-z_]+\}\}/g) || [];
      expect(new Set(left), d.key).toEqual(new Set(['{{asset_base}}', '{{unsubscribe_url}}', '{{postal_address}}']));
      expect(r.html).toContain(SAMPLE[d.type].business_name.replace(/&/g, '&amp;'));
      expect(r.html).toContain('Hi Ana,');
      expect(r.html).toContain('&quot;best fade&quot;'); // escaped
      expect(r.html.length).toBeLessThan(60_000);
      expect(r.text).toContain('$250 one-time');
      subjects.add(r.subject);
      const sent = compose({ html: r.html, text: r.text, address: '1 Test St', unsubscribeUrl: 'https://x/u/t', assetBase: 'https://app.test/photos' });
      expect(sent.html).not.toMatch(/\{\{/);
      expect(sent.html).toContain(`https://app.test/photos/${d.type}/`);
    }
    expect(subjects.size).toBeGreaterThan(30);
  });

  it('escapes business names and falls back when there is no hook', () => {
    const r = renderDesign('restaurant-01', { business_name: 'Tom & Jerry <Grill>', city: 'Waco', state: 'TX' });
    expect(r.html).toContain('Tom &amp; Jerry &lt;Grill&gt;');
    expect(r.html).not.toContain('<Grill>');
    expect(r.html).toContain('in Waco, TX');
    expect(r.html).toContain('Hi Tom &amp; Jerry &lt;Grill&gt; team,');
  });

  it('detects business types from categories', () => {
    const k = (s: string) => detectType(s)?.key;
    expect(k('Barbershop')).toBe('barbershop');
    expect(k('Hair salon')).toBe('hair-salon');
    expect(k('Nail salon')).toBe('nail-salon');
    expect(k('Food truck')).toBe('food-truck');
    expect(k('Mexican restaurant')).toBe('restaurant');
    expect(k('Auto repair shop')).toBe('auto-repair');
    expect(k('Lash studio')).toBe('beauty-spa');
    expect(k('Dog grooming')).toBe('pet-grooming');
    expect(k('Plumbing')).toBe('home-trades');
    expect(k('Carpet cleaning')).toBe('cleaning');
    expect(k('Personal trainer')).toBe('fitness');
    expect(k('Tattoo shop')).toBe('tattoo');
    expect(k('Cupcake bakery')).toBe('bakery-cafe');
    expect(k('Lawn care')).toBe('landscaping');
    expect(k('pet-grooming')).toBe('pet-grooming');
    expect(k('Accounting firm')).toBeUndefined();
  });

  it('makes a threaded plain-text follow-up', () => {
    const f = renderFollowup('barbershop-02', { business_name: 'Fresh Fadez' }, 'A website idea for Fresh Fadez');
    expect(f.subject).toBe('Re: A website idea for Fresh Fadez');
    expect(f.text).toContain('Fresh Fadez');
    expect(f.text).toContain('{{unsubscribe_url}}');
  });
});

describe('grammar', () => {
  it('uses "an" before vowels', () => {
    const r = renderDesign('restaurant-01', { business_name: 'Casa Verde' });
    expect(r.html).toContain('An online ordering system built in');
    expect(r.text).toContain('2. An online ordering system built in');
    expect(renderDesign('barbershop-01', { business_name: 'X' }).html).toContain('A booking system built in');
  });
});
