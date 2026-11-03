// Applies supabase/migrations/*.sql in order, once each. Usage: pnpm migrate (needs DATABASE_URL).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, closeDb } from '../core/db.ts';

export const migrate = async (log = console.log) => {
  const sql = db();
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  // One transaction with an advisory lock, so the API and the worker starting together can't both apply a migration.
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727274001)`;
    await tx`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`;
    await tx`alter table _migrations enable row level security`;
    const done = new Set((await tx`select name from _migrations`).map((r) => r.name as string));
    for (const f of files) {
      if (done.has(f)) continue;
      await tx.unsafe(await readFile(path.join(dir, f), 'utf8'));
      await tx`insert into _migrations (name) values (${f})`;
      log(`applied ${f}`);
    }
  });
  log('database is up to date');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(closeDb).catch(async (e) => { console.error(e.message); await closeDb(); process.exit(1); });
}
