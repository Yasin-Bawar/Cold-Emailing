import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { Send, MessageSquareReply, AlertTriangle, Mail, Home as HomeIcon, ChevronRight, CheckCircle2, PauseCircle, PencilLine, Users } from 'lucide-react';
import { api, fmtDate, type Campaign } from '../api.ts';
import { SenderStatus } from './SenderStatus.tsx';
import { Card, CardHeader, Delta, Empty, PageHeader, Spinner, StatusChip, cx, useLoad, Button } from '../ui.tsx';

type Stats = {
  totals: Record<string, number>;
  period: { days: number; current: Record<string, number>; previous: Record<string, number> };
  daily: { day: string; sent: number; replied: number }[];
  byCategory: { value: string; count: number; replied: number }[];
  byStatus: { value: string; count: number }[];
};
type Queue = { paused: boolean; postal_address_set: boolean; queue: Record<string, number>; capacity_today: number; sender?: { running: boolean; last_check_at: string | null; note: string | null }; accounts: { email: string; sent_today: number; cap_today: number; status: string; next_send_at: string | null }[] };

const campaignStatus = (c: Campaign) => (c.status === 'done' || (c.emails > 0 && c.sent + c.failed >= c.emails && c.queued === 0 && c.drafts === 0) ? 'complete' : c.status);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// A ring that fills as today's sending capacity is used
const Ring = ({ value, max }: { value: number; max: number }) => {
  const r = 46, c = 2 * Math.PI * r, f = max ? Math.min(1, value / max) : 0;
  return (
    <svg viewBox="0 0 110 110" className="size-32 shrink-0 -rotate-90">
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="11" className="text-brand-100" />
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)} className="text-brand-600 transition-[stroke-dashoffset] duration-700" />
    </svg>
  );
};

// One thing that needs attention, as a big tap target with its own color
const Todo = ({ to, n, title, sub, tone, icon }: { to: string; n?: number; title: string; sub: string; tone: string; icon: React.ReactNode }) => (
  <Link to={to} className="group flex items-center gap-3.5 rounded-2xl border border-line bg-white p-3.5 transition hover:border-gray-300 hover:shadow-[0_2px_8px_rgba(29,32,51,.06)]">
    <span className={cx('grid size-11 shrink-0 place-items-center rounded-xl', tone)}>{icon}</span>
    <span className="min-w-0 flex-1"><b className="block text-[15px] font-bold">{n !== undefined && <span className="tabular-nums">{n.toLocaleString()} </span>}{title}</b><span className="block truncate text-[13px] text-muted">{sub}</span></span>
    <ChevronRight className="size-5 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
  </Link>
);

const Kpi = ({ label, value, cur, prev, icon, tone, hint }: { label: string; value: string | number; cur: number; prev: number; icon: React.ReactNode; tone: string; hint?: string }) => (
  <Card className="p-5">
    <div className="flex items-center justify-between"><span className={cx('grid size-10 place-items-center rounded-xl', tone)}>{icon}</span><Delta cur={cur} prev={prev} /></div>
    <p className="mt-4 text-3xl font-extrabold tracking-tight tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
    <p className="mt-0.5 text-sm font-semibold text-gray-700">{label}</p>
    {hint && <p className="text-xs text-muted">{hint}</p>}
  </Card>
);

export const Home = () => {
  const nav = useNavigate();
  const stats = useLoad(() => api<Stats>('/stats?days=14'), []);
  const queue = useLoad(() => api<Queue>('/queue'), []);
  const campaigns = useLoad(() => api<Campaign[]>('/campaigns'), []);
  useEffect(() => { const t = setInterval(() => queue.reload(), 60_000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stats.data || !queue.data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const { totals, period, daily, byCategory, byStatus } = stats.data;
  const q = queue.data;
  const maxDay = Math.max(1, ...daily.map((d) => d.sent));
  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));
  const replyRate = period.current.sent ? Math.round((period.current.replied / period.current.sent) * 1000) / 10 : 0;
  const sentToday = q.accounts.reduce((n, a) => n + a.sent_today, 0);
  const capToday = q.accounts.filter((a) => a.status === 'active').reduce((n, a) => n + a.cap_today, 0);
  const toAnswer = byStatus.find((s) => s.value === 'replied')?.count || 0;
  const nextSend = q.accounts.map((a) => a.next_send_at).filter(Boolean).sort()[0];
  const mins = nextSend ? Math.max(0, Math.round((new Date(nextSend).getTime() - Date.now()) / 60_000)) : null;
  const senderDown = q.sender && !q.sender.running;
  const todos = [
    !q.accounts.length && { to: '/accounts', title: 'Connect an inbox', sub: 'Nothing can be sent without one', tone: 'bg-red-100 text-red-700', icon: <AlertTriangle className="size-5" /> },
    !q.postal_address_set && { to: '/settings', title: 'Add your postal address', sub: 'Required in every email (CAN-SPAM)', tone: 'bg-red-100 text-red-700', icon: <AlertTriangle className="size-5" /> },
    senderDown && { to: '/accounts', title: 'Sender is not running', sub: 'Redeploy the services on Railway', tone: 'bg-red-100 text-red-700', icon: <AlertTriangle className="size-5" /> },
    q.paused && { to: '/settings', title: 'Sending is paused', sub: 'Resume it in Settings', tone: 'bg-amber-100 text-amber-800', icon: <PauseCircle className="size-5" /> },
    toAnswer > 0 && { to: '/replies', n: toAnswer, title: toAnswer === 1 ? 'reply to answer' : 'replies to answer', sub: 'Mark them interested, won or lost', tone: 'bg-emerald-100 text-emerald-700', icon: <MessageSquareReply className="size-5" /> },
    q.queue.drafts > 0 && { to: '/campaigns', n: q.queue.drafts, title: q.queue.drafts === 1 ? 'draft to review' : 'drafts to review', sub: 'Approve them to start sending', tone: 'bg-violet-100 text-violet-700', icon: <PencilLine className="size-5" /> },
  ].filter(Boolean) as { to: string; n?: number; title: string; sub: string; tone: string; icon: React.ReactNode }[];

  return (
    <div>
      <PageHeader icon={<HomeIcon className="size-5" />} tint="bg-indigo-100 text-indigo-700" title={greeting()} sub={`${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · here’s what needs you today`} />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[15px] font-bold">Today</p><p className="text-[13px] text-muted">Weekdays 8am–5pm in each lead’s time zone</p></div>
            <Link to="/accounts" className="text-[13px] font-semibold text-brand-600 hover:underline">Inboxes</Link>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <div className="relative">
              <Ring value={sentToday} max={capToday} />
              <div className="absolute inset-0 grid place-items-center text-center"><span><b className="block text-3xl font-extrabold tabular-nums">{sentToday}</b><span className="text-xs font-semibold text-muted">of {capToday} sent</span></span></div>
            </div>
            <div className="min-w-[220px] flex-1 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-sky-50 p-3"><p className="text-2xl font-extrabold text-sky-800 tabular-nums">{q.queue.approved.toLocaleString()}</p><p className="text-xs font-semibold text-sky-700">waiting to send</p></div>
                <div className="rounded-xl bg-brand-50 p-3"><p className="text-2xl font-extrabold text-brand-700 tabular-nums">{mins === null ? (q.queue.approved && q.sender?.running ? 'soon' : '—') : mins < 1 ? 'now' : `${mins} min`}</p><p className="text-xs font-semibold text-brand-600">until the next email</p></div>
              </div>
              {q.accounts.map((a) => (
                <div key={a.email}>
                  <div className="mb-1 flex justify-between text-xs"><span className="truncate font-medium text-gray-600">{a.email}</span><span className="font-semibold tabular-nums">{a.sent_today}/{a.cap_today}</span></div>
                  <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(100, (a.sent_today / Math.max(1, a.cap_today)) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
          <SenderStatus className="mt-5" />
        </Card>

        <div className="lg:col-span-2">
          <p className="mb-3 text-[15px] font-bold">Needs you</p>
          <div className="space-y-2.5">
            {todos.length ? todos.map((t) => <Todo key={t.title} {...t} />) : (
              <div className="flex items-center gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <span className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 className="size-5" /></span>
                <span><b className="block text-[15px] font-bold text-emerald-900">All caught up</b><span className="text-[13px] text-emerald-800">Nothing needs you right now. Emails keep going out on their own.</span></span>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 mb-3 text-[15px] font-bold">Last 14 days <span className="font-medium text-muted">vs the 14 before</span></p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Emails sent" value={period.current.sent} cur={period.current.sent} prev={period.previous.sent} icon={<Send className="size-5" />} tone="bg-brand-100 text-brand-700" />
        <Kpi label="Replies" value={period.current.replied} cur={period.current.replied} prev={period.previous.replied} icon={<MessageSquareReply className="size-5" />} tone="bg-emerald-100 text-emerald-700" hint={`${replyRate}% reply rate`} />
        <Kpi label="Bounced" value={period.current.bounced} cur={period.current.bounced} prev={period.previous.bounced} icon={<AlertTriangle className="size-5" />} tone="bg-red-100 text-red-700" hint={`${period.current.unsubscribed} unsubscribed`} />
        <Kpi label="New leads" value={period.current.leads} cur={period.current.leads} prev={period.previous.leads} icon={<Users className="size-5" />} tone="bg-sky-100 text-sky-700" hint={`${totals.interested} interested · ${totals.won} won`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Emails sent per day" sub="Hover a day to see its numbers" right={<span className="flex items-center gap-3 text-xs font-medium text-muted"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-500" />Sent</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-500" />Replies</span></span>} />
          <div className="px-5 pb-5">
            <div className="relative flex h-52 items-end gap-1.5 border-b border-line sm:gap-2">
              {[0.25, 0.5, 0.75, 1].map((f) => <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-100" style={{ bottom: `${f * 100}%` }} />)}
              {daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center gap-0.5">
                  <div className="w-full max-w-5 rounded-t-md bg-brand-500 transition group-hover:bg-brand-600" style={{ height: `${(d.sent / maxDay) * 100}%`, minHeight: d.sent ? 4 : 0 }} />
                  <div className="w-full max-w-5 rounded-t-md bg-emerald-500" style={{ height: `${(d.replied / maxDay) * 100}%`, minHeight: d.replied ? 4 : 0 }} />
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded-lg bg-ink px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-white group-hover:block">{fmtDate(d.day)}: {d.sent} sent, {d.replied} replies</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 sm:gap-2">
              {daily.map((d, i) => <span key={d.day} className="flex-1 text-center text-[10px] font-medium text-muted">{i % 2 === 0 ? new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>)}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Leads by business type" sub="And how many replied" />
          <div className="scroll-thin max-h-[290px] space-y-3.5 overflow-y-auto px-5 pb-5">
            {byCategory.length === 0 && <p className="py-8 text-center text-sm text-muted">No leads yet.</p>}
            {byCategory.map((c, i) => (
              <div key={c.value}>
                <div className="mb-1 flex justify-between text-sm"><span className="truncate font-medium capitalize">{c.value}</span><span className="text-muted tabular-nums">{c.count}{c.replied ? <b className="ml-1 font-semibold text-emerald-600">· {c.replied} replied</b> : null}</span></div>
                <div className="h-2 rounded-full bg-gray-100"><div className={cx('h-2 rounded-full', ['bg-sky-400', 'bg-violet-400', 'bg-orange-400', 'bg-teal-400', 'bg-pink-400', 'bg-amber-400'][i % 6])} style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between"><p className="text-[15px] font-bold">Campaigns</p><Link to="/campaigns" className="text-[13px] font-semibold text-brand-600 hover:underline">View all</Link></div>
      {campaigns.data && campaigns.data.length === 0 ? (
        <Card><Empty icon={<Mail className="size-5" />} title="No campaigns yet" sub="Create one, or ask Claude to create it through MCP." action={<Button variant="primary" onClick={() => nav('/campaigns?new=1')}>New campaign</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.data?.slice(0, 4).map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
};

// A campaign at a glance: how far along it is and how it's doing
export const CampaignCard = ({ c }: { c: Campaign }) => {
  const total = Math.max(1, c.emails || c.leads);
  const w = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  return (
    <Link to={`/campaigns/${c.id}`} className="group block rounded-2xl border border-line bg-white p-5 transition hover:border-gray-300 hover:shadow-[0_2px_8px_rgba(29,32,51,.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-[15px] font-bold">{c.name}</p><p className="text-xs text-muted">{c.leads} leads · created {fmtDate(c.created_at)}</p></div>
        <StatusChip status={campaignStatus(c)} />
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-gray-100">
        <span className="bg-brand-600" style={{ width: w(c.sent) }} /><span className="bg-sky-300" style={{ width: w(c.queued) }} /><span className="bg-violet-200" style={{ width: w(c.drafts) }} />
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[['Sent', c.sent, 'text-brand-700'], ['Waiting', c.queued, 'text-sky-700'], ['Replies', c.replied, 'text-emerald-700'], ['Bounced', c.bounced, 'text-red-600']].map(([l, v, t]) => (
          <div key={l as string} className="rounded-xl bg-soft py-2"><p className={cx('text-lg font-extrabold tabular-nums', v ? (t as string) : 'text-gray-400')}>{v as number}</p><p className="text-[11px] font-semibold text-muted">{l}</p></div>
        ))}
      </div>
    </Link>
  );
};
