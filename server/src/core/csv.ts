// Small RFC 4180 CSV reader/writer (quotes, commas and newlines inside quotes).
export const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const s = input.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

const ALIASES: Record<string, string[]> = {
  email: ['email', 'e-mail', 'email address', 'mail', 'to'],
  business_name: ['business_name', 'business', 'company', 'company name', 'name', 'business name', 'organization'],
  contact_name: ['contact_name', 'contact', 'first name', 'owner', 'full name', 'contact name'],
  category: ['category', 'industry', 'type', 'cat'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province', 'region'],
  timezone: ['timezone', 'tz', 'time zone'],
  phone: ['phone', 'phone number', 'tel'],
  address: ['address', 'street', 'addr'],
  website: ['website', 'site', 'url', 'domain'],
  source_url: ['source_url', 'source', 'email source', 'emailsource', 'facebook'],
  score: ['score'],
  notes: ['notes', 'note', 'comments'],
};

// Maps a CSV with a header row to lead objects. Rows without a valid-looking email are returned separately.
export const csvToLeads = (input: string) => {
  const rows = parseCsv(input);
  if (!rows.length) return { leads: [], bad: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.some((h) => ALIASES.email.includes(h));
  const idx: Record<string, number> = {};
  if (hasHeader) for (const [k, names] of Object.entries(ALIASES)) { const i = header.findIndex((h) => names.includes(h)); if (i >= 0) idx[k] = i; }
  const body = hasHeader ? rows.slice(1) : rows;
  const leads: Record<string, string>[] = [];
  let bad = 0;
  for (const r of body) {
    let email = hasHeader ? r[idx.email] : r.find((c) => /@/.test(c));
    email = email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { bad++; continue; }
    const o: Record<string, string> = { email };
    if (hasHeader) for (const [k, i] of Object.entries(idx)) if (k !== 'email' && r[i]?.trim()) o[k] = r[i].trim();
    leads.push(o);
  }
  return { leads, bad };
};

export const toCsv = (rows: Record<string, unknown>[], cols: string[]) => {
  const cell = (v: unknown) => {
    const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
};

// Pull email addresses out of pasted text (one per line, or anything with commas/spaces).
export const extractEmails = (text: string) => [...new Set((text.match(/[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) => e.toLowerCase()))];
