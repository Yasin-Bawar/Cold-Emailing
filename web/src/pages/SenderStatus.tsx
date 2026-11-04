import { useEffect } from 'react';
import { api, fmtDate } from '../api.ts';
import { cx, useLoad } from '../ui.tsx';

type Q = { paused: boolean; postal_address_set: boolean; queue: Record<string, number>; sender?: { running: boolean; last_check_at: string | null; note: string | null } };

const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : fmtDate(d, true);
};

// Whether the sending loop is alive: green while it checks in, red when it hasn't for 10 minutes
export const SenderStatus = ({ className }: { className?: string }) => {
  const q = useLoad(() => api<Q>('/queue'), []);
  useEffect(() => { const t = setInterval(() => q.reload(), 60_000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const d = q.data;
  if (!d) return null;
  const s = d.sender;
  const [tone, title, sub] = d.paused
    ? ['amber', 'Sending is paused', 'Resume it in Settings to send again.']
    : !d.postal_address_set
      ? ['amber', 'Add your postal address', 'Nothing is sent until it is set in Settings.']
      : s?.running
        ? ['green', `Sender is running · checked ${ago(s.last_check_at!)}`, s.note || '']
        : ['red', 'Sender is not running', s?.last_check_at ? `Last check ${ago(s.last_check_at)}. Redeploy the services on Railway.` : 'It has never checked in. Redeploy the services on Railway.'];
  return (
    <div title={sub} className={cx('flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-sm', {
      green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      amber: 'border-amber-200 bg-amber-50 text-amber-900',
      red: 'border-red-200 bg-red-50 text-red-900',
    }[tone], className)}>
      <span className="relative flex size-2.5 shrink-0">
        {tone === 'green' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cx('relative inline-flex size-2.5 rounded-full', { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone])} />
      </span>
      <span className="min-w-0"><b className="font-semibold">{title}</b>{sub && <span className="block truncate text-xs opacity-75">{sub}</span>}</span>
    </div>
  );
};
