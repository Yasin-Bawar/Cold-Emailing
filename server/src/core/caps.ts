// Daily send limits per inbox. New inboxes warm up: 10 a day in week 1, 20 in week 2, 30 in week 3, then daily_cap.
export const warmupCap = (dailyCap: number, warmupStart: Date | string, now = new Date()): number => {
  const start = new Date(warmupStart);
  const days = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / 86_400_000);
  const ramp = days < 7 ? 10 : days < 14 ? 20 : days < 21 ? 30 : Infinity;
  return Math.max(0, Math.min(dailyCap, ramp));
};

// Random gap between two sends from the same inbox: 1 to 4 minutes.
export const nextGapMs = (rand = Math.random) => Math.round(60_000 + rand() * 180_000);

// Start of "today" for counting sends. Uses the sender's day in Toronto (where Mavan is).
export const dayStart = (now = new Date(), tz = 'America/Toronto'): Date => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
};
