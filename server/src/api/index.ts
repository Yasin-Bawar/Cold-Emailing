import { buildApp } from './app.ts';
import { env } from '../core/env.ts';
import { migrate } from '../scripts/migrate.ts';
import { startLoops } from '../worker/loops.ts';

// Check required settings up front so a misconfigured deploy fails loudly.
void env.databaseUrl; void env.encryptionKey; void env.adminPassword;
if (process.env.AUTO_MIGRATE !== 'false') await migrate((m) => console.log(`[migrate] ${m}`));
buildApp().listen(env.port, () => console.log(`API listening on :${env.port} (${env.publicUrl})`));
// The API sends too (unless RUN_SENDER=false), so emails still go out when the worker service isn't running.
// The sender lease makes sure only one process sends at a time.
if (process.env.RUN_SENDER !== 'false') {
  const stop = startLoops('api');
  const quit = async () => { await stop(); process.exit(0); };
  process.on('SIGTERM', quit);
  process.on('SIGINT', quit);
}
