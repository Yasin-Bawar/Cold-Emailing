import { Router } from 'express';
import express from 'express';
import { readUnsubToken } from '../core/crypto.ts';
import { db } from '../core/db.ts';
import { suppress } from '../core/repo.ts';
import { esc } from '../core/compose.ts';

// GET shows a confirm button (so link scanners can't unsubscribe people by accident).
// POST unsubscribes: the button, and mail apps' one-click (RFC 8058, "List-Unsubscribe=One-Click").
export const unsub = Router();

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>body{margin:0;font-family:Inter,system-ui,-apple-system,Segoe UI,Arial,sans-serif;background:#f5f7fb;color:#0f172a;display:grid;place-items:center;min-height:100vh}
.card{background:#fff;border:1px solid #e5e9f2;border-radius:16px;padding:32px;max-width:420px;margin:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
h1{font-size:20px;margin:0 0 8px}p{color:#475467;line-height:1.6;margin:0 0 20px}button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:600;font-size:15px;cursor:pointer}</style></head>
<body><div class="card">${body}</div></body></html>`;

const leadFor = async (token: string) => {
  const id = readUnsubToken(token);
  if (!id) return null;
  const sql = db();
  const [l] = await sql`select id, email from leads where id = ${id}`;
  return l ?? null;
};

unsub.get('/u/:token', async (req, res) => {
  const lead = await leadFor(req.params.token);
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
  if (!lead) return res.status(404).send(page('Link not valid', '<h1>This link is not valid</h1><p>Reply to the email with "unsubscribe" and we will remove you.</p>'));
  res.send(page('Unsubscribe', `<h1>Unsubscribe</h1><p>Stop all emails to <b>${esc(lead.email)}</b>?</p>
<form method="post"><button type="submit">Unsubscribe</button></form>`));
});

unsub.post('/u/:token', express.urlencoded({ extended: false, limit: '4kb' }), async (req, res) => {
  const lead = await leadFor(req.params.token);
  if (!lead) return res.status(404).send(page('Link not valid', '<h1>This link is not valid</h1>'));
  await suppress(lead.email, 'unsubscribe', 'public');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  res.send(page('Unsubscribed', `<h1>You're unsubscribed</h1><p>We won't email <b>${esc(lead.email)}</b> again.</p>`));
});
