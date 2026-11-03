// Sending windows and time zones, ported from outreach/us/send-resend.cjs (local) and build.cjs (ZONES).
export const ZONES: Record<string, string> = {
  TX: 'America/Chicago', OK: 'America/Chicago', LA: 'America/Chicago', AR: 'America/Chicago', MS: 'America/Chicago',
  AL: 'America/Chicago', TN: 'America/Chicago', KS: 'America/Chicago', MO: 'America/Chicago', IA: 'America/Chicago',
  MN: 'America/Chicago', WI: 'America/Chicago', IL: 'America/Chicago', NE: 'America/Chicago',
  NM: 'America/Denver', CO: 'America/Denver', UT: 'America/Denver', MT: 'America/Denver', WY: 'America/Denver', ID: 'America/Boise',
  AZ: 'America/Phoenix',
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York',
  NC: 'America/New_York', SC: 'America/New_York', VA: 'America/New_York', OH: 'America/New_York', MI: 'America/Detroit',
  MA: 'America/New_York', MD: 'America/New_York', CT: 'America/New_York', DC: 'America/New_York',
  ON: 'America/Toronto', QC: 'America/Toronto', BC: 'America/Vancouver', AB: 'America/Edmonton',
};

export const DEFAULT_TZ = 'America/Chicago';

export const zoneFor = (state?: string | null, city?: string | null): string => {
  if (city && /^el paso$/i.test(city.trim())) return 'America/Denver';
  return (state && ZONES[state.trim().toUpperCase()]) || DEFAULT_TZ;
};

export const validZone = (tz?: string | null): string | null => {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
};

export type LocalTime = { open: boolean; weekday: string; hour: number; label: string };

// A business is "open for email" on weekdays from 8:00 to 16:59 its own time.
export const localTime = (tz: string, now = new Date(), startHour = 8, endHour = 17): LocalTime => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const hour = Number(parts.hour) % 24;
  const weekday = String(parts.weekday);
  const open = !['Sat', 'Sun'].includes(weekday) && hour >= startHour && hour < endHour;
  return { open, weekday, hour, label: `${weekday} ${String(hour).padStart(2, '0')}:${parts.minute}` };
};
