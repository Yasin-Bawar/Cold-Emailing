import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env.ts';

// Email images live in a private Supabase Storage bucket (default "campaign-assets"). They are attached to each email
// inline at send time and served to the dashboard through the API, so the bucket never needs to be public.
// Without Supabase settings (local development and tests) files go to STORAGE_DIR on disk.
let sb: SupabaseClient | undefined;
let bucketReady = false;

const supabase = () => {
  if (!env.supabaseUrl || !env.supabaseServiceKey) return undefined;
  return (sb ??= createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
};

const ensureBucket = async (c: SupabaseClient) => {
  if (bucketReady) return;
  const { data } = await c.storage.getBucket(env.storageBucket);
  if (!data) {
    const { error } = await c.storage.createBucket(env.storageBucket, { public: false });
    if (error && !/already exists/i.test(error.message)) throw new Error(`Storage bucket: ${error.message}`);
  }
  bucketReady = true;
};

const safe = (p: string) => {
  const clean = p.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.split('/').some((s) => s === '..' || s === '')) throw new Error(`Bad storage path: ${p}`);
  return clean;
};

export const storageKind = () => (supabase() ? 'supabase' : 'local');

export const putFile = async (p: string, bytes: Buffer, contentType: string): Promise<string> => {
  const key = safe(p);
  const c = supabase();
  if (c) {
    await ensureBucket(c);
    const { error } = await c.storage.from(env.storageBucket).upload(key, bytes, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  } else {
    const full = path.resolve(env.storageDir, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
  }
  return key;
};

export const getFile = async (p: string): Promise<Buffer> => {
  const key = safe(p);
  const c = supabase();
  if (c) {
    const { data, error } = await c.storage.from(env.storageBucket).download(key);
    if (error || !data) throw new Error(`Download failed: ${error?.message || 'not found'}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(path.resolve(env.storageDir, key));
};

export const removeFile = async (p: string) => {
  const key = safe(p);
  const c = supabase();
  if (c) await c.storage.from(env.storageBucket).remove([key]);
  else await rm(path.resolve(env.storageDir, key), { force: true });
};

export const contentTypeFor = (p: string) =>
  /\.png$/i.test(p) ? 'image/png' : /\.gif$/i.test(p) ? 'image/gif' : /\.webp$/i.test(p) ? 'image/webp' : 'image/jpeg';
