import type { NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../core/env.ts';
import { db } from '../core/db.ts';
import { newToken, safeEqual, sha256 } from '../core/crypto.ts';

const COOKIE = 'mvn_session';
const key = () => new TextEncoder().encode(env.jwtSecret);

export const cookies = (req: Request): Record<string, string> =>
  Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length >= 2).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));

// Simple brute-force guard: 10 wrong passwords per IP per 15 minutes.
const attempts = new Map<string, { n: number; until: number }>();

export const login = async (req: Request, res: Response) => {
  const ip = req.ip || 'x';
  const a = attempts.get(ip);
  if (a && a.n >= 10 && a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  const password = String(req.body?.password || '');
  if (!password || !safeEqual(password, env.adminPassword)) {
    attempts.set(ip, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60_000 });
    return res.status(401).json({ error: 'Wrong password.' });
  }
  attempts.delete(ip);
  const jwt = await new SignJWT({ sub: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(key());
  const secure = env.publicUrl.startsWith('https://');
  res.setHeader('Set-Cookie', `${COOKIE}=${jwt}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure ? '; Secure' : ''}`);
  res.json({ ok: true });
};

export const logout = (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
};

export const checkToken = async (token: string) => {
  if (!token) return null;
  const sql = db();
  const [t] = await sql`update api_tokens set last_used_at = now() where token_hash = ${sha256(token)} and revoked_at is null returning id, name`;
  return t ?? null;
};

const bearer = (req: Request) => (/^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1] || '').trim();

// Dashboard session cookie, or an API token (Authorization: Bearer ...).
export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const c = cookies(req)[COOKIE];
  if (c) {
    try { await jwtVerify(c, key()); return next(); } catch { /* fall through */ }
  }
  const t = bearer(req);
  if (t && (await checkToken(t))) return next();
  res.status(401).json({ error: 'Sign in first.' });
};

export const requireToken = async (req: Request, res: Response, next: NextFunction) => {
  const t = await checkToken(bearer(req));
  if (t) { (req as any).tokenName = t.name; return next(); }
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing or invalid API token. Create one in the dashboard under API & MCP.' }, id: null });
};

export const createToken = async (name: string): Promise<Record<string, any> & { token: string }> => {
  const sql = db();
  const token = newToken();
  const [row] = await sql`insert into api_tokens (name, token_hash) values (${name.trim() || 'token'}, ${sha256(token)}) returning id, name, created_at`;
  return { ...row, token };
};
export const listTokens = async () => { const sql = db(); return sql`select id, name, last_used_at, revoked_at, created_at from api_tokens order by created_at desc`; };
export const revokeToken = async (id: string) => { const sql = db(); await sql`update api_tokens set revoked_at = now() where id = ${id} and revoked_at is null`; };
