// Ten email layouts. Each takes a business type + one lead's details and returns email-safe HTML
// (tables and inline styles only, max 600px wide, images by URL). Tokens left for send time:
// {{asset_base}} (photo URL base), {{postal_address}}, {{unsubscribe_url}}.
import type { BusinessType } from './types.ts';

export type Fields = {
  business_name: string;
  first_name?: string | null;
  city?: string | null;
  state?: string | null;
  hook?: string | null; // one personal line about this business
  specialty?: string | null; // e.g. "Birria tacos" or "Silk press specialists"
  rating?: number | string | null;
  reviews?: number | string | null;
  phone?: string | null;
};

export type Ctx = {
  t: BusinessType; i: number; f: Fields;
  accent: string; soft: string; deep: string; tint: string;
  name: string; place: string; domain: string; headline: string; tagline: string;
  photo: (n: number) => string;
};

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---- color helpers ----
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (r: number[]) => '#' + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, k) => v + (y[k] - v) * t)); };

export const an = (word: string, cap = true) => { const a = /^[aeiou]/i.test(word) ? 'an' : 'a'; return cap ? a[0].toUpperCase() + a.slice(1) : a; };

export const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 28) || 'yourbusiness';

const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const PALA = "'Palatino Linotype',Palatino,Georgia,serif";
const TREB = "'Trebuchet MS','Segoe UI',Tahoma,sans-serif";
const VERD = "Verdana,Geneva,sans-serif";
const MONO = "'Courier New',Courier,monospace";
const BLACK = "'Arial Black','Helvetica Neue',Arial,sans-serif";

const nameSize = (name: string, base: number) => Math.max(18, Math.round(base - Math.max(0, name.length - 14) * 0.9));

// ---- shared pieces ----
type Tone = { bg: string; card: string; ink: string; muted: string; line: string; font: string; head: string; radius: number; dark?: boolean };

const doc = (c: Ctx, tone: Tone, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${tone.dark ? 'dark' : 'light'}"><title>${esc(c.name)}</title></head>
<body style="margin:0;padding:0;background:${tone.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(`A quick ${c.t.label.toLowerCase()} website concept we made for ${c.name}.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tone.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${tone.card};border-radius:${tone.radius}px;border:1px solid ${tone.line};font-family:${tone.font};color:${tone.ink};">
${body}
</table></td></tr></table></body></html>`;

const top = (c: Ctx, tone: Tone) => `<tr><td style="padding:22px 32px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${SANS};font-size:19px;font-weight:800;letter-spacing:-0.5px;color:${tone.ink};">mavan<span style="color:${c.accent};">&#9679;</span></td>
<td align="right" style="font-family:${SANS};font-size:11px;color:${tone.muted};letter-spacing:0.4px;text-transform:uppercase;">Concept for ${esc(c.name)}</td>
</tr></table></td></tr>`;

const greet = (c: Ctx) => (c.f.first_name ? `Hi ${esc(c.f.first_name)},` : `Hi ${esc(c.name)} team,`);

const hookLine = (c: Ctx) =>
  c.f.hook?.trim()
    ? esc(c.f.hook.trim())
    : `I came across ${esc(c.name)}${c.place ? ` in ${esc(c.place)}` : ''} and couldn&rsquo;t find a website for it, so we sketched what one could look like.`;

const intro = (c: Ctx, tone: Tone, opts: { headline?: boolean } = {}) => `<tr><td style="padding:22px 32px 6px;">
${opts.headline === false ? '' : `<h1 style="margin:0 0 14px;font-family:${tone.head};font-size:26px;line-height:1.2;color:${tone.ink};font-weight:700;">${esc(c.headline)}</h1>`}
<p style="margin:0 0 12px;font-size:15px;line-height:1.65;">${greet(c)}</p>
<p style="margin:0 0 12px;font-size:15px;line-height:1.65;">${hookLine(c)}</p>
<p style="margin:0;font-size:15px;line-height:1.65;">I&rsquo;m writing from Mavan, a small studio that builds websites and apps for local businesses. Here&rsquo;s a quick concept for ${esc(c.name)}:</p>
</td></tr>`;

const bullets = (c: Ctx, tone: Tone) => {
  const items = [
    `Your own website (like ${esc(c.domain)}) where customers can ${esc(c.t.feature)}.`,
    `${an(c.t.appName)} ${esc(c.t.appName)} built in, with no marketplace fees or commissions.`,
    `A management app for you, with ${esc(c.t.appLine)} on your phone.`,
  ];
  return `<tr><td style="padding:18px 32px 4px;">
<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${c.deep};">What&rsquo;s in the concept</p>
${items.map((t, k) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;"><tr>
<td valign="top" style="width:26px;"><span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:${c.soft};color:${c.deep};font-size:11px;font-weight:700;text-align:center;font-family:${SANS};">${k + 1}</span></td>
<td style="font-size:14.5px;line-height:1.6;color:${tone.ink};">${t}</td></tr></table>`).join('')}
</td></tr>`;
};

const price = (c: Ctx, tone: Tone) => `<tr><td style="padding:10px 32px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tone.dark ? mix(tone.card, '#ffffff', 0.06) : c.tint};border-radius:${Math.min(tone.radius, 12)}px;border:1px solid ${tone.dark ? tone.line : mix(c.accent, '#ffffff', 0.78)};"><tr><td style="padding:16px 18px;">
<p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${tone.dark ? c.accent : c.deep};">Price</p>
<p style="margin:0;font-size:14.5px;line-height:1.65;color:${tone.ink};">Website: <b>$250 one-time</b>. Website plus the ${esc(c.t.appName)} and management app: <b>$500 one-time</b>, live in about 14 days. No commission on your sales. Optional care plan from $49/month for hosting and updates.</p>
</td></tr></table></td></tr>`;

const close = (c: Ctx, tone: Tone) => `<tr><td style="padding:18px 32px 8px;">
<p style="margin:0 0 16px;font-size:15px;line-height:1.65;">This is a quick concept, not a live website. If you like the direction, just reply to this email and we&rsquo;ll set up a 15-minute call. We&rsquo;ll change anything you want: colors, photos, wording and sections.</p>
<a href="https://mavan.app/#work" style="display:inline-block;background:${c.accent};color:#ffffff;text-decoration:none;font-family:${SANS};font-size:14px;font-weight:700;padding:12px 24px;border-radius:99px;">See our work</a>
<p style="margin:22px 0 0;font-size:14px;line-height:1.7;">Best regards,<br><b>The Mavan team</b><br><span style="color:${tone.muted};font-size:13px;">hello@mavan.app &middot; mavan.app</span></p>
</td></tr>
<tr><td style="padding:18px 32px 24px;border-top:1px solid ${tone.line};font-family:${SANS};font-size:11.5px;line-height:1.7;color:${tone.muted};">
We sent this one-time note to ${esc(c.name)} because your business email is listed publicly. Not interested? Reply &ldquo;no thanks&rdquo; or <a href="{{unsubscribe_url}}" style="color:${tone.muted};">unsubscribe</a> and we won&rsquo;t write again.<br>Mavan &middot; {{postal_address}}
</td></tr>`;

const browserBar = (c: Ctx, dark = false) => `<tr><td style="background:${dark ? '#1c1c1f' : '#f1f1f3'};padding:8px 12px;border-bottom:1px solid ${dark ? '#2a2a2e' : '#e4e4e7'};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="width:46px;font-size:0;"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:#f87171;margin-right:4px;"></span><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:#fbbf24;margin-right:4px;"></span><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:#34d399;"></span></td>
<td><span style="display:inline-block;background:${dark ? '#26262a' : '#ffffff'};border-radius:6px;padding:3px 10px;font-family:${SANS};font-size:11px;color:${dark ? '#a1a1aa' : '#71717a'};">${esc(c.domain)}</span></td>
</tr></table></td></tr>`;

const navRow = (c: Ctx, ink: string, accent: string, font: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-family:${font};font-size:15px;font-weight:700;color:${ink};">${esc(c.name)}</td>
<td align="right" style="font-family:${SANS};font-size:11px;color:${ink};opacity:0.75;">Services &nbsp; About &nbsp; <span style="color:${accent};font-weight:700;">${esc(c.t.cta)}</span></td>
</tr></table>`;

const btn = (label: string, bg: string, fg = '#ffffff', border?: string) =>
  `<span style="display:inline-block;background:${bg};color:${fg};font-family:${SANS};font-size:12px;font-weight:700;padding:8px 14px;border-radius:99px;${border ? `border:1px solid ${border};` : ''}">${esc(label)}</span>`;

const img = (src: string, h: number, radius = 0, alt = '') =>
  `<img src="${src}" width="100%" height="${h}" alt="${esc(alt)}" style="display:block;width:100%;height:${h}px;object-fit:cover;border:0;border-radius:${radius}px;">`;

const stars = (c: Ctx) => (c.f.rating ? `<span style="color:#f59e0b;">&#9733;</span> ${esc(c.f.rating)}${c.f.reviews ? ` &middot; ${esc(c.f.reviews)} reviews` : ''}` : '');

const chips = (c: Ctx, fg: string, bg: string, n = 4) => c.t.services.slice(0, n).map((s) =>
  `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:99px;background:${bg};color:${fg};font-family:${SANS};font-size:11.5px;">${esc(s)}</span>`).join('');

const mockWrap = (inner: string, border: string, radius = 12, pad = '6px 32px 10px') => `<tr><td style="padding:${pad};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:${radius}px;overflow:hidden;">${inner}</table>
<p style="margin:6px 0 0;font-family:${SANS};font-size:11px;color:#a1a1aa;text-align:center;">Concept preview of your website</p>
</td></tr>`;

// ---- the ten layouts ----
export const LAYOUTS: { name: string; render: (c: Ctx) => string }[] = [
  {
    name: 'Classic',
    render: (c) => {
      const tone: Tone = { bg: '#f4f4f5', card: '#ffffff', ink: '#18181b', muted: '#71717a', line: '#e4e4e7', font: SANS, head: SANS, radius: 16 };
      const mock = browserBar(c) + `<tr><td style="padding:12px 16px;background:#ffffff;">${navRow(c, '#18181b', c.accent, SANS)}</td></tr>
<tr><td>${img(c.photo(0), 220, 0, c.name)}</td></tr>
<tr><td style="padding:18px 18px 16px;background:#ffffff;">
<p style="margin:0 0 4px;font-family:${SANS};font-size:${nameSize(c.name, 26)}px;font-weight:800;color:#18181b;">${esc(c.name)}</p>
<p style="margin:0 0 12px;font-family:${SANS};font-size:13px;color:#52525b;">${esc(c.tagline)}${c.f.rating ? ` &nbsp; ${stars(c)}` : ''}</p>
${btn(c.t.cta, c.accent)} &nbsp; ${btn('Call us', '#ffffff', '#18181b', '#d4d4d8')}
<div style="margin-top:14px;">${chips(c, c.deep, c.soft)}</div></td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e4e4e7') + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Split',
    render: (c) => {
      const tone: Tone = { bg: mix(c.accent, '#ffffff', 0.92), card: '#ffffff', ink: '#1c1917', muted: '#78716c', line: '#e7e5e4', font: SANS, head: SERIF, radius: 10 };
      const mock = browserBar(c) + `<tr><td style="background:#ffffff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="52%" valign="middle" style="padding:20px 16px 20px 18px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${c.accent};font-weight:700;">${esc(c.f.city || c.t.label)}</p>
<p style="margin:0 0 8px;font-family:${SERIF};font-size:${nameSize(c.name, 24)}px;line-height:1.15;color:#1c1917;">${esc(c.name)}</p>
<p style="margin:0 0 14px;font-family:${SANS};font-size:12.5px;line-height:1.5;color:#57534e;">${esc(c.f.specialty || c.tagline)}</p>
${btn(c.t.cta, '#1c1917')}</td>
<td width="48%" valign="top">${img(c.photo(1), 210, 0, c.name)}</td>
</tr></table></td></tr>
<tr><td style="background:${c.tint};padding:12px 18px;font-family:${SANS};font-size:12px;color:${c.deep};">${c.t.services.slice(0, 4).map(esc).join(' &nbsp;&middot;&nbsp; ')}</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e7e5e4', 8) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Night',
    render: (c) => {
      const tone: Tone = { bg: '#09090b', card: '#111113', ink: '#f4f4f5', muted: '#a1a1aa', line: '#27272a', font: SANS, head: SANS, radius: 18, dark: true };
      const glow = mix(c.accent, '#ffffff', 0.25);
      const mock = browserBar(c, true) + `<tr><td style="background:#0c0c0e;padding:12px 16px;">${navRow(c, '#f4f4f5', glow, SANS)}</td></tr>
<tr><td style="background:#0c0c0e;">${img(c.photo(2), 200, 0, c.name)}</td></tr>
<tr><td style="background:#0c0c0e;padding:18px;">
<p style="margin:0 0 4px;font-family:${BLACK};font-size:${nameSize(c.name, 26)}px;color:${glow};letter-spacing:-0.5px;">${esc(c.name.toUpperCase())}</p>
<p style="margin:0 0 14px;font-family:${SANS};font-size:13px;color:#a1a1aa;">${esc(c.tagline)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${c.t.services.slice(0, 4).map((s) => `<tr><td style="padding:7px 0;border-top:1px solid #27272a;font-family:${SANS};font-size:13px;color:#e4e4e7;">${esc(s)}</td><td align="right" style="padding:7px 0;border-top:1px solid #27272a;font-family:${SANS};font-size:12px;color:${glow};font-weight:700;">${esc(c.t.cta)} &rarr;</td></tr>`).join('')}</table>
</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#27272a', 14) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Magazine',
    render: (c) => {
      const tone: Tone = { bg: '#f5f1ea', card: '#fffdf8', ink: '#292524', muted: '#78716c', line: '#e7e0d4', font: PALA, head: PALA, radius: 4 };
      const mock = browserBar(c) + `<tr><td style="background:#fffdf8;padding:22px 20px 10px;text-align:center;">
<p style="margin:0 0 4px;font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${c.accent};">${esc(c.t.label)}${c.f.city ? ` &middot; ${esc(c.f.city)}` : ''}</p>
<p style="margin:0 0 6px;font-family:${PALA};font-size:${nameSize(c.name, 32)}px;line-height:1.1;color:#292524;font-style:italic;">${esc(c.name)}</p>
<p style="margin:0;font-family:${PALA};font-size:14px;color:#57534e;">${esc(c.f.specialty || c.tagline)}</p></td></tr>
<tr><td style="background:#fffdf8;padding:12px 20px 6px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="50%" style="padding-right:5px;">${img(c.photo(0), 160, 2)}</td><td width="50%" style="padding-left:5px;">${img(c.photo(1), 160, 2)}</td></tr></table></td></tr>
<tr><td style="background:#fffdf8;padding:12px 20px 20px;text-align:center;">${btn(c.t.cta, '#292524')}</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e7e0d4', 4) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Phone',
    render: (c) => {
      const tone: Tone = { bg: '#eef2f7', card: '#ffffff', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', font: TREB, head: TREB, radius: 20 };
      const slots = ['10:30', '11:15', '1:00', '2:45'];
      const phone = `<table role="presentation" width="230" cellpadding="0" cellspacing="0" align="center" style="width:230px;background:#0f172a;border-radius:30px;padding:10px;"><tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:22px;overflow:hidden;">
<tr><td style="background:${c.accent};padding:16px 14px 14px;">
<p style="margin:0;font-family:${TREB};font-size:10px;color:#ffffff;opacity:0.85;">${esc(c.domain)}</p>
<p style="margin:4px 0 0;font-family:${TREB};font-size:${Math.min(18, nameSize(c.name, 18))}px;font-weight:700;color:#ffffff;line-height:1.2;">${esc(c.name)}</p></td></tr>
<tr><td>${img(c.photo(0), 110)}</td></tr>
<tr><td style="padding:12px 12px 6px;font-family:${TREB};font-size:11px;font-weight:700;color:#0f172a;">${esc(c.t.services[0])} &middot; pick a time</td></tr>
<tr><td style="padding:0 12px 6px;">${slots.map((s, k) => `<span style="display:inline-block;margin:0 4px 6px 0;padding:6px 8px;border-radius:8px;font-family:${TREB};font-size:11px;${k === 1 ? `background:${c.accent};color:#fff;` : `background:${c.soft};color:${c.deep};`}">${s}</span>`).join('')}</td></tr>
<tr><td style="padding:4px 12px 16px;"><span style="display:block;text-align:center;background:#0f172a;color:#fff;border-radius:10px;padding:9px 0;font-family:${TREB};font-size:12px;font-weight:700;">${esc(c.t.cta)}</span></td></tr>
</table></td></tr></table>`;
      const mock = `<tr><td style="padding:22px 16px;background:${c.tint};">${phone}</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, mix(c.accent, '#ffffff', 0.8), 18) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Cards',
    render: (c) => {
      const tone: Tone = { bg: '#f8fafc', card: '#ffffff', ink: '#111827', muted: '#6b7280', line: '#e5e7eb', font: VERD, head: SANS, radius: 14 };
      const card = (s: string, k: number) => `<td width="33%" valign="top" style="padding:0 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff;">
<tr><td>${img(c.photo(k), 84)}</td></tr>
<tr><td style="padding:9px 9px 11px;font-family:${VERD};font-size:11px;font-weight:700;color:#111827;">${esc(s)}<br><span style="font-weight:400;color:${c.accent};">${esc(c.t.cta)} &rsaquo;</span></td></tr></table></td>`;
      const mock = browserBar(c) + `<tr><td style="padding:16px;background:${c.accent};">
<p style="margin:0;font-family:${SANS};font-size:${nameSize(c.name, 24)}px;font-weight:800;color:#ffffff;">${esc(c.name)}</p>
<p style="margin:4px 0 0;font-family:${VERD};font-size:12px;color:#ffffff;opacity:0.9;">${esc(c.tagline)}</p></td></tr>
<tr><td style="padding:14px 10px;background:#f9fafb;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${c.t.services.slice(0, 3).map(card).join('')}</tr></table></td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e5e7eb') + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Minimal',
    render: (c) => {
      const tone: Tone = { bg: '#ffffff', card: '#ffffff', ink: '#171717', muted: '#737373', line: '#e5e5e5', font: SANS, head: SANS, radius: 0 };
      const mock = browserBar(c) + `<tr><td style="padding:30px 22px 8px;background:#ffffff;text-align:center;">
<p style="margin:0 0 10px;font-family:${MONO};font-size:11px;color:${c.accent};letter-spacing:2px;">${esc((c.f.city || c.t.label).toUpperCase())}</p>
<p style="margin:0 0 6px;font-family:${SANS};font-size:${nameSize(c.name, 28)}px;font-weight:300;letter-spacing:4px;text-transform:uppercase;color:#171717;">${esc(c.name)}</p>
<p style="margin:0 0 18px;font-family:${SANS};font-size:13px;color:#737373;">${esc(c.tagline)}</p>
${btn(c.t.cta, '#ffffff', '#171717', '#171717')}</td></tr>
<tr><td style="padding:18px 22px 22px;background:#ffffff;">${img(c.photo(2), 190)}</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone, { headline: true }) + mockWrap(mock, '#e5e5e5', 0) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Bold',
    render: (c) => {
      const tone: Tone = { bg: c.deep, card: '#ffffff', ink: '#111111', muted: '#666666', line: '#eeeeee', font: SANS, head: BLACK, radius: 6 };
      const mock = browserBar(c) + `<tr><td style="background:${c.accent};padding:28px 20px 24px;">
<p style="margin:0 0 6px;font-family:${BLACK};font-size:${nameSize(c.name, 34)}px;line-height:1.05;color:#ffffff;text-transform:uppercase;">${esc(c.name)}</p>
<p style="margin:0 0 16px;font-family:${SANS};font-size:13px;color:#ffffff;opacity:0.9;">${esc(c.f.specialty || c.tagline)}</p>
${btn(c.t.cta, '#ffffff', c.deep)}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%">${img(c.photo(1), 130)}</td><td width="50%">${img(c.photo(2), 130)}</td></tr></table></td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e5e5e5', 6) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Gallery',
    render: (c) => {
      const tone: Tone = { bg: '#fbf7f4', card: '#ffffff', ink: '#2b2926', muted: '#7c7670', line: '#efe8e1', font: SANS, head: SERIF, radius: 16 };
      const proof = c.f.rating
        ? `<p style="margin:0;font-family:${SERIF};font-size:20px;color:#2b2926;">${stars(c)}</p><p style="margin:4px 0 0;font-family:${SANS};font-size:12px;color:#7c7670;">Your rating, shown right on your site</p>`
        : `<p style="margin:0;font-family:${SERIF};font-size:17px;color:#2b2926;">Your Google reviews, front and center</p><p style="margin:4px 0 0;font-family:${SANS};font-size:12px;color:#7c7670;">So new customers trust you before they visit</p>`;
      const mock = browserBar(c) + `<tr><td style="background:#ffffff;padding:14px 16px;">${navRow(c, '#2b2926', c.accent, SERIF)}</td></tr>
<tr><td style="background:#ffffff;padding:0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="34%" style="padding:0 3px;">${img(c.photo(0), 120, 8)}</td><td width="33%" style="padding:0 3px;">${img(c.photo(1), 120, 8)}</td><td width="33%" style="padding:0 3px;">${img(c.photo(2), 120, 8)}</td></tr></table></td></tr>
<tr><td style="background:#ffffff;padding:16px 16px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.tint};border-radius:10px;"><tr><td style="padding:14px 16px;">${proof}</td>
<td align="right" style="padding:14px 16px;">${btn(c.t.cta, c.accent)}</td></tr></table></td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#efe8e1', 14) + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
  {
    name: 'Steps',
    render: (c) => {
      const tone: Tone = { bg: '#f3f4f6', card: '#ffffff', ink: '#111827', muted: '#6b7280', line: '#e5e7eb', font: SANS, head: SANS, radius: 12 };
      const steps = [['Day 1', 'You reply, we hop on a 15-minute call'], ['Day 2-10', 'We build your site and app with your photos'], ['Day 14', `${c.name} is live, ready for customers`]];
      const mock = browserBar(c) + `<tr><td style="background:#ffffff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="44%" valign="top">${img(c.photo(0), 180)}</td>
<td width="56%" valign="middle" style="padding:16px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:${nameSize(c.name, 22)}px;font-weight:800;color:#111827;line-height:1.15;">${esc(c.name)}</p>
<p style="margin:0 0 12px;font-family:${SANS};font-size:12.5px;color:#4b5563;line-height:1.5;">${esc(c.tagline)}</p>${btn(c.t.cta, c.accent)}</td></tr></table></td></tr>`;
      const timeline = `<tr><td style="padding:16px 32px 2px;"><p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${c.deep};">Live in about 14 days</p>
${steps.map(([d, s]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr>
<td width="76" valign="top"><span style="display:inline-block;background:${c.soft};color:${c.deep};font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;">${esc(d)}</span></td>
<td style="font-size:14px;line-height:1.5;color:#111827;">${esc(s)}</td></tr></table>`).join('')}</td></tr>`;
      return doc(c, tone, top(c, tone) + intro(c, tone) + mockWrap(mock, '#e5e7eb', 10) + timeline + bullets(c, tone) + price(c, tone) + close(c, tone));
    },
  },
];
