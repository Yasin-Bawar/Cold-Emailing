// Turns a stored email into what is actually sent: postal address, unsubscribe link and inline image filled in.

// Placeholder used by the zips built in Zip-Tech-Agency/outreach (see add-address.cjs there).
export const LEGACY_PLACEHOLDER = '[Mavan postal address in Toronto, Canada — add it in content-us.cjs before sending]';
const RED = '<span style="color:#b91c1c;font-weight:700;">';

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Tokens Claude (or anyone) can put in an email:
//   {{postal_address}}  the address from Settings (required by CAN-SPAM; sending stops if it is empty)
//   {{unsubscribe_url}} the one-click unsubscribe link for this lead (added at the bottom if missing)
//   {{image_url}}       the email's image (sent inline as cid:concept)
export const TOKENS = ['{{postal_address}}', '{{unsubscribe_url}}', '{{image_url}}'] as const;

export type ComposeInput = { html: string | null; text: string | null; address: string; unsubscribeUrl: string; imageSrc?: string };

export const insertAddress = (html: string, text: string, address: string) => {
  const a = address.trim();
  return {
    html: html
      .split(`${RED}${esc(LEGACY_PLACEHOLDER)}`).join(`<span>${esc(a)}`)
      .split(esc(LEGACY_PLACEHOLDER)).join(esc(a))
      .split('{{postal_address}}').join(esc(a)),
    text: text.split(LEGACY_PLACEHOLDER).join(a).split('{{postal_address}}').join(a),
  };
};

export const htmlToText = (html: string) =>
  html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, t) => (/^mailto:/i.test(href) || t.includes(href) ? t : `${t} (${href})`))
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export const hasAddressSlot = (html: string | null, text: string | null) =>
  [html || '', text || ''].some((s) => s.includes('{{postal_address}}') || s.includes(LEGACY_PLACEHOLDER) || s.includes(esc(LEGACY_PLACEHOLDER)));

export const compose = ({ html, text, address, unsubscribeUrl, imageSrc }: ComposeInput) => {
  if (!address.trim()) throw new Error('Postal address is empty. Add it in Settings before sending.');
  let h = html || '';
  let t = text || (h ? htmlToText(h) : '');
  ({ html: h, text: t } = insertAddress(h, t, address));
  // Emails without an address slot still get the address in the footer.
  const needsAddress = !h.includes(esc(address.trim())) && !!h;
  if (imageSrc) h = h.split('{{image_url}}').join(imageSrc);
  const unsubHtml = `<a href="${esc(unsubscribeUrl)}" style="color:#8f8b85;text-decoration:underline;">Unsubscribe</a>`;
  if (h.includes('{{unsubscribe_url}}')) h = h.split('{{unsubscribe_url}}').join(esc(unsubscribeUrl));
  else if (h) {
    const foot = `<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8f8b85;text-align:center;padding:14px 12px;">${needsAddress ? `${esc(address.trim())} · ` : ''}${unsubHtml}</div>`;
    h = /<\/body>/i.test(h) ? h.replace(/<\/body>/i, `${foot}</body>`) : h + foot;
  }
  if (t.includes('{{unsubscribe_url}}')) t = t.split('{{unsubscribe_url}}').join(unsubscribeUrl);
  else t = `${t}${t.includes(address.trim()) ? '' : `\n${address.trim()}`}\nUnsubscribe: ${unsubscribeUrl}`;
  t = t.split('{{image_url}}').join('');
  return { html: h || null, text: t };
};

// Text files from the outreach zips start with "To:" and "Subject:" lines; strip them.
export const stripTextHeaders = (txt: string) => {
  const lines = txt.split('\n');
  return /^To:/i.test(lines[0] || '') && /^Subject:/i.test(lines[1] || '') ? lines.slice(3).join('\n').trim() : txt.trim();
};
