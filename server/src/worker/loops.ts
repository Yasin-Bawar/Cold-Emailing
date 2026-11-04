// The sending and inbox loops. They run in the worker (ROLE=worker) and also in the API, so a missing or crashed
// worker never stops sending. Only the process holding the sender lease in settings works each tick, so two
// processes never send at the same time; if the holder stops, another takes over when the lease runs out.
import { randomUUID } from 'node:crypto';
import { env } from '../core/env.ts';
import { db } from '../core/db.ts';
import { inboxTick, sendTick, type SendOutcome } from '../core/engine.ts';

const LEASE_SECONDS = 300;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// Take or renew the lease. True when this process may work this tick.
export const holdLease = async (me: string, now = new Date()) => {
  const sql = db();
  const until = new Date(now.getTime() + LEASE_SECONDS * 1000);
  const r = await sql`update settings set sender_holder = ${me}, sender_lease_until = ${until}
    where id = 1 and (sender_lease_until is null or sender_lease_until < ${now} or sender_holder = ${me}) returning id`;
  return r.length > 0;
};

export const summarize = (r: { skipped?: string; results: SendOutcome[] }) => {
  if (r.skipped) return r.skipped;
  const sent = r.results.filter((x) => x.ok).length;
  const errors = r.results.filter((x) => x.error).map((x) => `${x.account}: ${x.error}`);
  const held = [...new Set(r.results.filter((x) => x.held).map((x) => `${x.account}: ${x.held}`))];
  return [sent ? `Sent ${sent}` : '', ...errors, ...held].filter(Boolean).join(' · ').slice(0, 900) || 'Nothing to send';
};

export const startLoops = (role: string) => {
  const me = `${role}-${randomUUID().slice(0, 8)}`;
  let stopping = false;
  const loop = (name: string, everySec: number, fn: () => Promise<unknown>) => {
    let running = false;
    const run = async () => {
      if (running || stopping) return;
      running = true;
      try {
        if (!(await holdLease(me))) return;
        const r = await fn();
        if (r !== undefined) log(name, JSON.stringify(r));
      } catch (e) {
        log(name, 'error:', (e as Error).message);
        if (name === 'send') await db()`update settings set sender_seen_at = now(), sender_note = ${'Error: ' + (e as Error).message} where id = 1`.catch(() => {});
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
      await db()`update settings set sender_seen_at = now(), sender_note = ${`${summarize(r)} (${me})`} where id = 1`;
      return r.skipped ? { skipped: r.skipped } : r.results.filter((x) => x.held !== 'nothing to send');
    }),
    loop('inbox', env.imapTick, () => inboxTick()),
  ];
  log(`sender loops started in ${role} (${me}): send every ${env.sendTick}s, inbox every ${env.imapTick}s`);
  return async () => {
    stopping = true;
    timers.forEach(clearInterval);
    // Hand the lease over straight away
    await db()`update settings set sender_lease_until = null where id = 1 and sender_holder = ${me}`.catch(() => {});
  };
};
