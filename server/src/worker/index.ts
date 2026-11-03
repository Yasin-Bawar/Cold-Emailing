// Background worker: sends approved emails every SEND_TICK_SECONDS and checks Gmail inboxes every IMAP_TICK_SECONDS.
import { env } from '../core/env.ts';
import { inboxTick, sendTick } from '../core/engine.ts';
import { closeDb } from '../core/db.ts';

void env.databaseUrl; void env.encryptionKey;
let stopping = false;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const loop = (name: string, everySec: number, fn: () => Promise<unknown>) => {
  let running = false;
  const run = async () => {
    if (running || stopping) return;
    running = true;
    try {
      const r = await fn();
      log(name, JSON.stringify(r));
    } catch (e) {
      log(name, 'error:', (e as Error).message);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(run, everySec * 1000);
};

const timers = [
  loop('send', env.sendTick, async () => {
    const r = await sendTick();
    return r.skipped ? { skipped: r.skipped } : r.results.filter((x) => !x.held || x.held !== 'nothing to send');
  }),
  loop('inbox', env.imapTick, () => inboxTick()),
];
log(`worker started: send every ${env.sendTick}s, inbox every ${env.imapTick}s`);

const stop = async () => {
  stopping = true;
  timers.forEach(clearInterval);
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
