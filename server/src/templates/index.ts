// Email templates: 14 business types x 10 layouts = 140 designs. A design is "<type>-<01..10>".
// Only the words change per business (name, city, personal line, rating, ...); the design stays the same.
import { TYPES, TYPE_BY_KEY, detectType, type BusinessType } from './types.ts';
import { LAYOUTS, an, mix, slug, type Ctx, type Fields } from './layouts.ts';

export { TYPES, detectType, type BusinessType, type Fields };

export const DESIGNS_PER_TYPE = LAYOUTS.length;

export type Design = { key: string; type: string; type_label: string; index: number; layout: string };

export const designKey = (type: string, index: number) => `${type}-${String(index + 1).padStart(2, '0')}`;

export const parseDesignKey = (key: string) => {
  const m = /^([a-z-]+)-(\d{2})$/.exec(key);
  if (!m) return null;
  const t = TYPE_BY_KEY.get(m[1]);
  const i = Number(m[2]) - 1;
  return t && i >= 0 && i < LAYOUTS.length ? { t, i } : null;
};

export const listDesigns = (type?: string): Design[] =>
  TYPES.filter((t) => !type || t.key === type).flatMap((t) =>
    LAYOUTS.map((l, i) => ({ key: designKey(t.key, i), type: t.key, type_label: t.label, index: i, layout: l.name })));

const fill = (s: string, name: string) => s.split('{name}').join(name);

const buildCtx = (t: BusinessType, i: number, f: Fields): Ctx => {
  const accent = t.accents[i % t.accents.length];
  const name = f.business_name.trim();
  const photos = t.photos;
  return {
    t, i, f, accent,
    soft: mix(accent, '#ffffff', 0.86),
    tint: mix(accent, '#ffffff', 0.94),
    deep: mix(accent, '#000000', 0.25),
    name,
    place: [f.city, f.state].filter(Boolean).join(', '),
    domain: `${slug(name)}.com`,
    headline: fill(t.headlines[i % t.headlines.length], name),
    tagline: f.specialty?.trim() ? `${f.specialty.trim()}${f.city ? ` in ${f.city}` : ''}.` : t.tagline,
    // Each design starts the photo rotation at a different photo, so neighbours in a city look different.
    photo: (n: number) => `{{asset_base}}/${t.key}/${photos[(i + n) % photos.length]}.jpg`,
  };
};

const textVersion = (c: Ctx) => {
  const hook = c.f.hook?.trim() || `I came across ${c.name}${c.place ? ` in ${c.place}` : ''} and couldn't find a website for it, so we sketched what one could look like.`;
  return [
    c.f.first_name ? `Hi ${c.f.first_name},` : `Hi ${c.name} team,`,
    '',
    hook,
    '',
    `I'm writing from Mavan, a small studio that builds websites and apps for local businesses. We put together a quick concept for ${c.name}.`,
    '',
    "What's in the concept:",
    `1. Your own website (like ${c.domain}) where customers can ${c.t.feature}.`,
    `2. ${an(c.t.appName)} ${c.t.appName} built in, with no marketplace fees or commissions.`,
    `3. A management app for you, with ${c.t.appLine} on your phone.`,
    '',
    `Price: Website: $250 one-time. Website plus the ${c.t.appName} and management app: $500 one-time, live in about 14 days. No commission on your sales. Optional care plan from $49/month for hosting and updates.`,
    '',
    "This is a quick concept, not a live website. If you like the direction, just reply to this email and we'll set up a 15-minute call.",
    '',
    'Our work: https://mavan.app/#work',
    '',
    'Best regards,',
    'The Mavan team',
    'hello@mavan.app · mavan.app',
    '',
    '--',
    `We sent this one-time note to ${c.name} because your business email is listed publicly. Not interested? Reply "no thanks" and we won't write again. Unsubscribe: {{unsubscribe_url}}`,
    'Mavan · {{postal_address}}',
  ].join('\n');
};

export type Rendered = { design: string; subject: string; html: string; text: string };

export const renderDesign = (key: string, f: Fields): Rendered => {
  const d = parseDesignKey(key);
  if (!d) throw new Error(`Unknown design "${key}"`);
  if (!f.business_name?.trim()) throw new Error('business_name is required');
  const c = buildCtx(d.t, d.i, f);
  return {
    design: key,
    subject: fill(d.t.subjects[d.i % d.t.subjects.length], c.name),
    html: LAYOUTS[d.i].render(c),
    text: textVersion(c),
  };
};

// Short plain-text follow-up, sent in the same thread a few days later.
export const renderFollowup = (key: string, f: Fields, firstSubject: string) => {
  const d = parseDesignKey(key);
  if (!d) throw new Error(`Unknown design "${key}"`);
  const name = f.business_name.trim();
  const variants = [
    `Just bringing this back to the top of your inbox. Happy to send the ${name} concept as a live link you can click through on your phone, no strings attached.`,
    `Quick follow-up on the website concept for ${name}. If the timing isn't right, no problem. If you'd like a version with your own photos and prices, just reply "yes".`,
    `Did you get a chance to look at the concept for ${name}? Reply with any changes you'd want and we'll update it for free so you can see it with your details.`,
  ];
  const body = variants[d.i % variants.length];
  return {
    subject: /^re:/i.test(firstSubject) ? firstSubject : `Re: ${firstSubject}`,
    text: `${f.first_name ? `Hi ${f.first_name},` : `Hi ${name} team,`}\n\n${body}\n\nBest,\nThe Mavan team\n\n--\nNot interested? Reply "no thanks" and we won't write again. Unsubscribe: {{unsubscribe_url}}\nMavan · {{postal_address}}`,
  };
};

// Sample details for previews in the dashboard.
export const SAMPLE: Record<string, Fields> = Object.fromEntries(TYPES.map((t) => [t.key, {
  business_name: ({ barbershop: 'Fresh Fadez', 'hair-salon': 'Glow Hair Studio', 'nail-salon': 'Polished Nail Bar', 'beauty-spa': 'Lash & Brow House', tattoo: 'Black Rose Tattoo', restaurant: 'Casa Verde Grill', 'food-truck': 'Taco Loco Truck', 'bakery-cafe': 'Sweet Crumb Bakery', cleaning: 'Sparkle Home Cleaning', landscaping: 'Green Edge Lawn Care', 'home-trades': 'Reliable Plumbing Co', 'auto-repair': 'Precision Auto Repair', fitness: 'Iron Will Fitness', 'pet-grooming': 'Happy Paws Grooming' } as Record<string, string>)[t.key] || t.label,
  city: 'Phoenix', state: 'AZ', rating: 4.8, reviews: 126,
}]));
