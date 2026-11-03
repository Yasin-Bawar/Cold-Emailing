import postgres from 'postgres';
import { env } from './env.ts';

let client: postgres.Sql | undefined;

// One shared pool, created on first use. prepare:false keeps it compatible with Supabase's transaction pooler (port 6543).
export const db = (): postgres.Sql =>
  (client ??= postgres(env.databaseUrl, {
    max: Number(process.env.DB_POOL_MAX || 5),
    prepare: false,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(env.databaseUrl) ? false : 'require',
    onnotice: () => {},
    transform: { undefined: null },
  }));

export const closeDb = async () => {
  await client?.end({ timeout: 5 });
  client = undefined;
};
