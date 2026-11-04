// All configuration comes from environment variables: Railway service variables in production, or a .env file in the
// repository root for local development (it is gitignored). Nothing secret is ever written to the repository.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const localEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.VITEST && existsSync(localEnv)) process.loadEnvFile(localEnv); // never overrides variables already set
const read = (name: string, fallback?: string): string => {
  const v = process.env[name]?.trim();
  if (v) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable ${name}. See .env.example.`);
};

export const env = {
  get databaseUrl() { return read('DATABASE_URL'); },
  // Any long random string. Encrypts stored Gmail App Passwords and Resend keys; changing it makes them unreadable.
  get encryptionKey() { return read('ENCRYPTION_KEY'); },
  // Password for the dashboard login (single user).
  get adminPassword() { return read('ADMIN_PASSWORD'); },
  // Signs dashboard sessions. Defaults to a value derived from ENCRYPTION_KEY.
  get jwtSecret() { return read('JWT_SECRET', `jwt:${read('ENCRYPTION_KEY')}`); },
  // Public base URL of the API service, used in unsubscribe links, e.g. https://mavan-outreach.up.railway.app
  get publicUrl() { return read('PUBLIC_URL', `http://localhost:${read('PORT', '8080')}`).replace(/\/+$/, ''); },
  get port() { return Number(read('PORT', '8080')); },
  // Supabase Storage. Without these, files are kept on local disk in STORAGE_DIR (fine for local development only).
  get supabaseUrl() { return process.env.SUPABASE_URL?.trim() || ''; },
  // Supabase's newer dashboard calls it the "secret" key (sb_secret_...); the older one "service_role". Either name works.
  get supabaseServiceKey() { return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(); },
  get storageBucket() { return read('STORAGE_BUCKET', 'campaign-assets'); },
  get storageDir() { return read('STORAGE_DIR', '.storage'); },
  // Worker timings, in seconds. Mostly useful for tests.
  get sendTick() { return Number(read('SEND_TICK_SECONDS', '120')); },
  get imapTick() { return Number(read('IMAP_TICK_SECONDS', '600')); },
  // Test hook: an SMTP/IMAP host override (e.g. a local fake server). Leave unset in production.
  get smtpHostOverride() { return process.env.SMTP_HOST_OVERRIDE?.trim() || ''; },
  // Google sign-in for Gmail (Gmail API over HTTPS). Create an OAuth client in Google Cloud; see README.
  get googleClientId() { return process.env.GOOGLE_CLIENT_ID?.trim() || ''; },
  get googleClientSecret() { return process.env.GOOGLE_CLIENT_SECRET?.trim() || ''; },
  get resendApiBase() { return read('RESEND_API_BASE', 'https://api.resend.com'); },
};
