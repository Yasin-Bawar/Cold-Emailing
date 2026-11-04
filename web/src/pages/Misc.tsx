import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ListChecks, Plus, Trash2, Inbox, MessageSquareReply, Activity as ActivityIcon, Ban, Search, Send, AlertTriangle, MailX, UserX, Pencil, CheckCircle2 } from 'lucide-react';
import { api, fmtDate, qs, timeAgo } from '../api.ts';
import { Avatar, Button, Card, Empty, Input, Modal, PageHeader, Pagination, Spinner, STATUS, StatusChip, TONE, Textarea, cx, useLoad, useToast } from '../ui.tsx';
import { LeadDrawer } from './LeadDrawer.tsx';

// ---------- Lists ----------
export const Lists = () => {
  const nav = useNavigate();
  const toast = useToast();
  const lists = useLoad(() => api<{ id: string; name: string; leads: number; created_at: string }[]>('/lists'), []);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const create = async () => {
    try { await api('/lists', { body: { name } }); toast('List created.'); setName(''); setOpen(false); lists.reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div>
      <PageHeader icon={<ListChecks className="size-5" />} tint="bg-violet-100 text-violet-700" title="Lists" sub="Group leads any way you like. Select leads on People and choose Add to list." right={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New list</Button>} />
      {!lists.data ? <Spinner /> : lists.data.length === 0 ? (
        <Card><Empty icon={<ListChecks className="size-5" />} title="No lists yet" sub="Lists help you pick who gets which campaign." action={<Button variant="primary" onClick={() => setOpen(true)}>New list</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lists.data.map((l) => (
            <Card key={l.id} className="group p-5">
              <div className="flex items-start justify-between">
                <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-600"><ListChecks className="size-5" /></span>
                <button aria-label="Delete list" className="rounded-md p-1.5 text-muted opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600" onClick={async () => { if (confirm(`Delete "${l.name}"? Leads stay.`)) { await api(`/lists/${l.id}`, { method: 'DELETE' }); lists.reload(); } }}><Trash2 className="size-4" /></button>
              </div>
              <p className="mt-4 font-semibold">{l.name}</p>
              <p className="text-sm text-muted">{l.leads} leads · created {fmtDate(l.created_at)}</p>
              <Button size="sm" className="mt-4" onClick={() => nav(`/leads?list_id=${l.id}`)}>Open leads</Button>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New list" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={create}>Create</Button></>}>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hot leads" onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
      </Modal>
    </div>
  );
};

// ---------- Replies ----------
export const Replies = () => {
  const replies = useLoad(() => api<any[]>('/replies?limit=200'), []);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const rows = (replies.data || []).filter((r) => !filter || r.status === filter);
  return (
    <div>
      <PageHeader icon={<Inbox className="size-5" />} tint="bg-emerald-100 text-emerald-700" title="Replies" sub="Every lead who wrote back. Their follow-ups were cancelled automatically." />
      <div className="mb-4 flex flex-wrap gap-2">
        {['', 'replied', 'interested', 'won', 'lost', 'unsubscribed'].map((s) => {
          const st = STATUS[s];
          const n = s ? (replies.data || []).filter((r) => r.status === s).length : (replies.data || []).length;
          const on = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)} className={cx('inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition', on ? (s ? TONE[st.tone] : 'bg-ink text-white ring-ink') : 'bg-white text-gray-700 ring-line hover:ring-gray-300')}>
              {st && <st.Icon className="size-4" />}{s === 'replied' ? 'To answer' : st?.label || 'All replies'}<span className={cx('rounded-md px-1.5 text-xs tabular-nums', on ? 'bg-white/30' : 'bg-gray-100 text-gray-600')}>{n}</span>
            </button>
          );
        })}
      </div>
      <Card>
        {!replies.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : rows.length === 0 ? (
          <Empty icon={<Inbox className="size-5" />} title="No replies yet" sub="Replies land in your connected Gmail inbox and are picked up every 10 minutes." />
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <button key={r.id} onClick={() => setOpen(r.id)} className={cx('relative flex w-full items-start gap-3.5 px-5 py-4 text-left transition hover:bg-soft', r.status === 'replied' && 'bg-emerald-50/40')}>
                {r.status === 'replied' && <span className="absolute inset-y-3 left-0 w-1 rounded-r bg-emerald-500" title="Not answered yet" />}
                <Avatar name={r.business_name || r.email} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{r.business_name || r.email}</span><StatusChip status={r.status} /><span className="ml-auto text-xs text-muted">{timeAgo(r.last_reply_at)}</span></div>
                  <p className="text-xs text-muted">{r.email}{r.city ? ` · ${r.city}, ${r.state}` : ''}{r.campaign_name ? ` · ${r.campaign_name}` : ''}</p>
                  <p className="mt-2 line-clamp-2 rounded-xl bg-white px-3 py-2 text-sm leading-relaxed text-gray-700 ring-1 ring-line"><MessageSquareReply className="mr-1.5 inline size-3.5 text-emerald-600" />{r.last_reply}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      <LeadDrawer id={open} onClose={() => setOpen(null)} onChanged={replies.reload} />
    </div>
  );
};

// ---------- Activity ----------
const ACT: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  sent: { label: 'Email sent', icon: <Send className="size-3.5" />, tone: 'bg-brand-50 text-brand-600' },
  replied: { label: 'Reply received', icon: <MessageSquareReply className="size-3.5" />, tone: 'bg-emerald-50 text-emerald-600' },
  bounced: { label: 'Bounced', icon: <MailX className="size-3.5" />, tone: 'bg-red-50 text-red-600' },
  unsubscribed: { label: 'Unsubscribed', icon: <UserX className="size-3.5" />, tone: 'bg-amber-50 text-amber-700' },
  send_failed: { label: 'Send failed', icon: <AlertTriangle className="size-3.5" />, tone: 'bg-red-50 text-red-600' },
  emails_approved: { label: 'Emails approved', icon: <CheckCircle2 className="size-3.5" />, tone: 'bg-indigo-50 text-indigo-600' },
  email_added: { label: 'Email drafted', icon: <Pencil className="size-3.5" />, tone: 'bg-gray-100 text-gray-600' },
};
export const Activity = () => {
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const act = useLoad(() => api<any[]>(`/activity${qs({ type, limit: 50, offset })}`), [type, offset]);
  return (
    <div>
      <PageHeader icon={<ActivityIcon className="size-5" />} tint="bg-amber-100 text-amber-700" title="Activity" sub="Everything the platform, the worker and Claude did." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[['', 'All'], ['sent', 'Sent'], ['replied', 'Replies'], ['bounced', 'Bounces'], ['unsubscribed', 'Unsubscribes'], ['send_failed', 'Failures'], ['email_added,email_replaced', 'Drafts'], ['emails_approved', 'Approvals']].map(([v, l]) => (
          <button key={v} onClick={() => { setType(v); setOffset(0); }} className={cx('rounded-full border px-3 py-1 text-[13px] font-medium', type === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50')}>{l}</button>
        ))}
      </div>
      <Card>
        {!act.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : act.data.length === 0 ? <Empty icon={<ActivityIcon className="size-5" />} title="Nothing yet" /> : (
          <div className="divide-y divide-line">
            {act.data.map((e) => {
              const a = ACT[e.type] || { label: e.type.replace(/_/g, ' '), icon: <ActivityIcon className="size-3.5" />, tone: 'bg-gray-100 text-gray-600' };
              return (
                <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-full', a.tone)}>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm"><span className="font-medium capitalize">{a.label}</span>{e.business_name ? <> · {e.business_name}</> : null}{e.detail?.actor === 'mcp' ? <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">Claude</span> : null}</p>
                    <p className="truncate text-xs text-muted">{e.detail?.subject || e.detail?.error || e.detail?.snippet || (e.detail?.count != null ? `${e.detail.count} items` : e.lead_email || '')}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{timeAgo(e.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
        <Pagination offset={offset} limit={50} total={offset + (act.data?.length || 0) + (act.data?.length === 50 ? 1 : 0)} onChange={setOffset} />
      </Card>
    </div>
  );
};

// ---------- Suppression ----------
export const Suppression = () => {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const list = useLoad(() => api<{ rows: any[]; total: number }>(`/suppression${qs({ q, limit: 50, offset })}`), [q, offset]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const add = async () => {
    const emails = text.split(/[\s,;]+/).filter((x) => x.includes('@'));
    try { const r = await api<{ added: number }>('/suppression', { body: { emails, reason: 'manual' } }); toast(`${r.added} added.`); setText(''); setOpen(false); list.reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <div>
      <PageHeader icon={<Ban className="size-5" />} tint="bg-rose-100 text-rose-700" title="Suppression" sub="Addresses that are never emailed: unsubscribes, bounces and manual excludes. Checked before every send." right={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add addresses</Button>} />
      <Card>
        <div className="border-b border-line p-3"><div className="relative max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search addresses" className="h-8 pl-8 text-[13px]" /></div></div>
        {!list.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : list.data.rows.length === 0 ? <Empty icon={<Ban className="size-5" />} title="The list is empty" /> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50/60 text-left text-xs text-muted"><tr><th className="px-5 py-2.5 font-medium">Email</th><th className="px-5 py-2.5 font-medium">Reason</th><th className="px-5 py-2.5 font-medium">Added</th><th /></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-5 py-3 font-medium">{r.email}</td>
                  <td className="px-5 py-3"><StatusChip status={r.reason === 'bounce' ? 'bounced' : r.reason === 'unsubscribe' ? 'unsubscribed' : 'lost'} label={r.reason} /></td>
                  <td className="px-5 py-3 text-muted">{fmtDate(r.created_at)}</td>
                  <td className="px-5 py-3 text-right"><button className="text-xs font-medium text-muted hover:text-red-600" onClick={async () => { if (confirm(`Allow emailing ${r.email} again?`)) { await api('/suppression/remove', { body: { email: r.email } }); list.reload(); } }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {list.data && list.data.total > 0 && <Pagination offset={offset} limit={50} total={list.data.total} onChange={setOffset} />}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Never email these addresses" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!text.includes('@')} onClick={add}>Add</Button></>}>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="one@example.com&#10;two@example.com" className="font-mono text-[13px]" />
      </Modal>
    </div>
  );
};
