import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

const key = () => createHash('sha256').update(env.encryptionKey).digest();

// AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url.
export const encrypt = (plain: string): string => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), body].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
};

export const decrypt = (packed: string): string => {
  const [v, iv, tag, body] = packed.split('.');
  if (v !== 'v1' || !iv || !tag || body === undefined) throw new Error('Unreadable secret');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
};

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = (prefix = 'mvn') => `${prefix}_${randomBytes(24).toString('base64url')}`;

export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(sha256(a));
  const y = Buffer.from(sha256(b));
  return timingSafeEqual(x, y);
};

// Unsubscribe tokens: lead id + HMAC, so links can't be guessed or forged.
const mac = (id: string) => createHash('sha256').update(`unsub:${env.encryptionKey}:${id}`).digest('base64url').slice(0, 16);
export const unsubToken = (leadId: string) => `${Buffer.from(leadId.replace(/-/g, ''), 'hex').toString('base64url')}.${mac(leadId)}`;
export const readUnsubToken = (token: string): string | null => {
  const [idPart, sig] = token.split('.');
  if (!idPart || !sig) return null;
  const hex = Buffer.from(idPart, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return mac(id) === sig ? id : null;
};

// Signed, expiring links to stored images, so the sandboxed email preview (which carries no cookies) can load them.
const fileMac = (p: string, exp: number) => createHash('sha256').update(`file:${env.encryptionKey}:${p}:${exp}`).digest('base64url').slice(0, 22);
export const signedFileUrl = (p: string, ttlSec = 6 * 3600) => {
  const exp = Math.floor(Date.now() / 1000 / 3600) * 3600 + ttlSec; // rounded, so URLs stay cacheable for an hour
  return `/files/${p.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${fileMac(p, exp)}`;
};
export const checkFileSig = (p: string, exp: string, sig: string) => Number(exp) * 1000 > Date.now() && fileMac(p, Number(exp)) === sig;
