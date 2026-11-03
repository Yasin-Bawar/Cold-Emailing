import { buildApp } from './app.ts';
import { env } from '../core/env.ts';
import { migrate } from '../scripts/migrate.ts';

// Check required settings up front so a misconfigured deploy fails loudly.
void env.databaseUrl; void env.encryptionKey; void env.adminPassword;
if (process.env.AUTO_MIGRATE !== 'false') await migrate((m) => console.log(`[migrate] ${m}`));
buildApp().listen(env.port, () => console.log(`API listening on :${env.port} (${env.publicUrl})`));
