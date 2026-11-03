import { Link, useNavigate } from 'react-router';
import { Send, MessageSquareReply, Clock, MoreHorizontal, AlertTriangle, Mail, Eye } from 'lucide-react';
import { api, fmtDate, type Campaign } from '../api.ts';
import { Card, CardHeader, Delta, Empty, PageHeader, Spinner, StatusChip, useLoad, Button } from '../ui.tsx';

type Stats = {
  totals: Record<string, number>;
  period: { days: number; current: Record<string, number>; previous: Record<string, number> };
  daily: { day: string; sent: number; replied: number }[];
  byCategory: { value: string; count: number; replied: number }[];
  byStatus: { value: string; count: number }[];
};
type Queue = { paused: boolean; postal_address_set: boolean; queue: Record<string, number>; capacity_today: number; accounts: { email: string; sent_today: number; cap_today: number; status: string }[] };

const Metric = ({ label, value, cur, prev }: { label: string; value: number; cur: number; prev: number }) => (
  <div className="flex items-center justify-between py-2.5">
    <span className="text-sm text-muted">{label}</span>
    <span className="flex items-center gap-2"><span className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</span><Delta cur={cur} prev={prev} /></span>
  </div>
);

const campaignStatus = (c: Campaign) => (c.status === 'done' || (c.emails > 0 && c.sent + c.failed >= c.emails && c.queued === 0 && c.drafts === 0) ? 'complete' : c.status);

export const Home = () => {
  const nav = useNavigate();
  const stats = useLoad(() => api<Stats>('/stats?days=14'), []);
  const queue = useLoad(() => api<Queue>('/queue'), []);
  const campaigns = useLoad(() => api<Campaign[]>('/campaigns'), []);
  if (!stats.data || !queue.data) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const { totals, period, daily, byCategory } = stats.data;
  const q = queue.data;
  const maxDay = Math.max(1, ...daily.map((d) => d.sent));
  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));
  const replyRate = totals.sent ? Math.round((totals.replied / totals.sent) * 1000) / 10 : 0;

  return (
    <div>
      <PageHeader title="Welcome back" sub="Here's how your outreach is doing over the last 14 days." />

      {(!q.postal_address_set || q.paused || !q.accounts.length) && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            {!q.accounts.length ? 'Connect a Gmail or Resend account so emails can go out.' : !q.postal_address_set ? 'Add your postal address in Settings. Nothing is sent without it (CAN-SPAM).' : 'Sending is paused.'}
          </span>
          <Link to={!q.accounts.length ? '/accounts' : '/settings'} className="font-semibold underline">Fix it</Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Emails delivered" sub="Last 14 days vs the 14 before" right={<span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-600"><Send className="size-4" /></span>} />
          <div className="px-5 pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{period.current.sent.toLocaleString()}</span>
              <Delta cur={period.current.sent} prev={period.previous.sent} />
            </div>
            <div className="mt-3 divide-y divide-line">
              <Metric label="Replies" value={period.current.replied} cur={period.current.replied} prev={period.previous.replied} />
              <Metric label="Bounced" value={period.current.bounced} cur={period.current.bounced} prev={period.previous.bounced} />
              <Metric label="Unsubscribed" value={period.current.unsubscribed} cur={period.current.unsubscribed} prev={period.previous.unsubscribed} />
              <Metric label="New leads" value={period.current.leads} cur={period.current.leads} prev={period.previous.leads} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Sending queue" sub={q.paused ? 'Paused' : 'Weekdays 8am–5pm in each lead’s time zone'} right={<span className="grid size-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Clock className="size-4" /></span>} />
          <div className="px-5 pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{q.queue.approved.toLocaleString()}</span>
              <span className="text-sm text-muted">approved, waiting</span>
            </div>
            <div className="mt-3 divide-y divide-line">
              <div className="flex justify-between py-2.5 text-sm"><span className="text-muted">Drafts to review</span><span className="font-semibold tabular-nums">{q.queue.drafts}</span></div>
              <div className="flex justify-between py-2.5 text-sm"><span className="text-muted">Follow-ups queued</span><span className="font-semibold tabular-nums">{q.queue.followups}</span></div>
              <div className="flex justify-between py-2.5 text-sm"><span className="text-muted">Can still send today</span><span className="font-semibold tabular-nums">{q.capacity_today}</span></div>
              <div className="py-2.5">
                {q.accounts.slice(0, 3).map((a) => (
                  <div key={a.email} className="mb-2 last:mb-0">
                    <div className="mb-1 flex justify-between text-xs"><span className="truncate text-muted">{a.email}</span><span className="tabular-nums">{a.sent_today}/{a.cap_today}</span></div>
                    <div className="h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (a.sent_today / Math.max(1, a.cap_today)) * 100)}%` }} /></div>
                  </div>
                ))}
                {!q.accounts.length && <Link to="/accounts" className="text-sm font-medium text-brand-600">Connect an inbox →</Link>}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Replies" sub={`${replyRate}% reply rate overall`} right={<span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><MessageSquareReply className="size-4" /></span>} />
          <div className="px-5 pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{totals.replied.toLocaleString()}</span>
              <span className="text-sm text-muted">leads replied</span>
            </div>
            <div className="mt-3 divide-y divide-line">
              {[['Interested', totals.interested], ['Won', totals.won], ['Total sent', totals.sent], ['Never-email list', totals.suppressed]].map(([l, v]) => (
                <div key={l as string} className="flex justify-between py-2.5 text-sm"><span className="text-muted">{l}</span><span className="font-semibold tabular-nums">{(v as number).toLocaleString()}</span></div>
              ))}
            </div>
            <Button size="sm" className="mt-2 w-full" onClick={() => nav('/replies')}>Open replies</Button>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Emails sent per day" sub="Last 14 days" right={<span className="flex items-center gap-3 text-xs text-muted"><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-brand-600" />Sent</span><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" />Replies</span></span>} />
          <div className="px-5 pb-5">
            <div className="relative flex h-52 items-end gap-1.5 border-b border-line sm:gap-2">
              {[0.25, 0.5, 0.75, 1].map((f) => <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-100" style={{ bottom: `${f * 100}%` }} />)}
              {daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center gap-0.5">
                  <div className="w-full max-w-5 rounded-t-[4px] bg-brand-600 transition group-hover:bg-brand-700" style={{ height: `${(d.sent / maxDay) * 100}%`, minHeight: d.sent ? 3 : 0 }} />
                  <div className="w-full max-w-5 rounded-t-[4px] bg-emerald-500" style={{ height: `${(d.replied / maxDay) * 100}%`, minHeight: d.replied ? 3 : 0 }} />
                  <div className="pointer-events-none absolute bottom-full mb-1 hidden rounded-md bg-gray-900 px-2 py-1 text-[11px] whitespace-nowrap text-white group-hover:block">{fmtDate(d.day)}: {d.sent} sent, {d.replied} replies</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 sm:gap-2">
              {daily.map((d, i) => <span key={d.day} className="flex-1 text-center text-[10px] text-muted">{i % 2 === 0 ? new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>)}
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Leads by category" sub="And how many replied" />
          <div className="space-y-3.5 px-5 pb-5">
            {byCategory.length === 0 && <p className="py-8 text-center text-sm text-muted">No leads yet.</p>}
            {byCategory.map((c) => (
              <div key={c.value}>
                <div className="mb-1 flex justify-between text-sm"><span className="truncate capitalize">{c.value}</span><span className="text-muted tabular-nums">{c.count}{c.replied ? ` · ${c.replied} replied` : ''}</span></div>
                <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand-500" style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent campaigns" right={<Link to="/campaigns" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>} />
        {campaigns.data && campaigns.data.length === 0 ? (
          <Empty icon={<Mail className="size-5" />} title="No campaigns yet" sub="Create one, or ask Claude to create it through MCP." action={<Button variant="primary" onClick={() => nav('/campaigns?new=1')}>New campaign</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y border-line bg-gray-50/60 text-left text-xs font-medium text-muted">
                <tr>{['Campaign title', 'Recipients', 'Total sent', 'Replies', 'Bounced', 'Unsubscribed', 'Status', ''].map((h) => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {campaigns.data?.slice(0, 6).map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-gray-50/60" onClick={() => nav(`/campaigns/${c.id}`)}>
                    <td className="px-5 py-3"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">Created {fmtDate(c.created_at)}</div></td>
                    <td className="px-5 py-3 tabular-nums">{c.leads}</td>
                    <td className="px-5 py-3 tabular-nums">{c.sent}</td>
                    <td className="px-5 py-3 tabular-nums">{c.replied} <span className="text-xs text-muted">{c.sent ? `(${Math.round((c.replied / c.sent) * 100)}%)` : ''}</span></td>
                    <td className="px-5 py-3 tabular-nums">{c.bounced}</td>
                    <td className="px-5 py-3 tabular-nums">{c.unsubscribed}</td>
                    <td className="px-5 py-3"><StatusChip status={campaignStatus(c)} /></td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex gap-1 text-muted"><Eye className="size-4" /><MoreHorizontal className="size-4" /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
