// Background worker: sends approved emails every SEND_TICK_SECONDS and checks Gmail inboxes every IMAP_TICK_SECONDS.
import { env } from '../core/env.ts';
import { closeDb } from '../core/db.ts';
import { migrate } from '../scripts/migrate.ts';
import { startLoops } from './loops.ts';

void env.databaseUrl; void env.encryptionKey;
if (process.env.AUTO_MIGRATE !== 'false') await migrate((m) => console.log(`[migrate] ${m}`));
const stopLoops = startLoops('worker');

const stop = async () => {
  await stopLoops();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
