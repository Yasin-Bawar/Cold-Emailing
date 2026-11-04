import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, CheckCheck, Pause, Play, Pencil, SkipForward, Undo2, Upload, Trash2, Search, Monitor, Smartphone, Users, Mail, ExternalLink, Wand2 } from 'lucide-react';
import { api, fmtDate, qs, type Campaign, type EmailRow } from '../api.ts';
import { Avatar, Button, Card, Empty, Input, Modal, Pagination, Spinner, StatusChip, Textarea, cx, useLoad, useToast } from '../ui.tsx';
import { BulkModal } from './BulkModal.tsx';

const TABS = [
  { id: '', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'approved,sending', label: 'Queued' },
  { id: 'sent', label: 'Sent' },
  { id: 'failed,cancelled,skipped', label: 'Other' },
];

export const CampaignDetail = () => {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const campaign = useLoad(() => api<Campaign>(`/campaigns/${id}`), [id]);
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const emails = useLoad(() => api<{ rows: EmailRow[]; total: number }>(`/emails${qs({ campaign_id: id, status: tab, q, limit, offset })}`), [id, tab, q, offset]);
  const [current, setCurrent] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [edit, setEdit] = useState<any>(null);
  const [bulk, setBulk] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [gen, setGen] = useState<{ open: boolean; followup: boolean; result?: any }>({ open: false, followup: true });
  const [busy, setBusy] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  const rows = emails.data?.rows || [];
  const sel = useMemo(() => rows.find((r) => r.id === current) || null, [rows, current]);

  useEffect(() => { if (rows.length && !rows.some((r) => r.id === current)) setCurrent(rows[0].id); }, [rows, current]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      const i = rows.findIndex((r) => r.id === current);
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); if (rows[i + 1]) setCurrent(rows[i + 1].id); }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); if (rows[i - 1]) setCurrent(rows[i - 1].id); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [rows, current]);

  const refresh = () => { emails.reload(); campaign.reload(); };
  const act = async (label: string, path: string, body: unknown, msg: string, advance = false) => {
    setBusy(label);
    try {
      await api(path, { body });
      toast(msg);
      if (advance) {
        const i = rows.findIndex((r) => r.id === current);
        if (rows[i + 1]) setCurrent(rows[i + 1].id);
      }
      refresh();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };

  const openEdit = async () => { if (sel) setEdit(await api(`/emails/${sel.id}`)); };
  const saveEdit = async () => {
    setBusy('save');
    try {
      await api(`/emails/${edit.id}`, { method: 'PATCH', body: { subject: edit.subject, html: edit.html || null, text: edit.text || null } });
      toast('Email saved.'); setEdit(null); setFrameKey((k) => k + 1); refresh();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };

  const c = campaign.data;
  if (!c) return <div className="grid h-64 place-items-center"><Spinner /></div>;
  const stats = [
    ['Leads', c.leads], ['Drafts', c.drafts], ['Queued', c.queued], ['Sent', c.sent], ['Replied', c.replied], ['Bounced', c.bounced], ['Unsubscribed', c.unsubscribed],
  ] as const;

  const total = c.leads || 0;
  const pct = (n: number) => (total ? Math.min(100, Math.round((n / total) * 100)) : 0);
  const localTime = (tz: string | null) => {
    if (!tz) return null;
    try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'short' }).format(new Date()); } catch { return null; }
  };
  const canEdit = sel && ['draft', 'approved', 'failed'].includes(sel.status);

  return (
    <div>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Campaigns</Link>

      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-500 text-sm font-bold text-white shadow-sm">{c.name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{c.name}</h1><StatusChip status={c.status} /></div>
              <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted">{c.notes || 'No notes'}</p>
              <p className="mt-1 text-xs text-gray-400">Created {fmtDate(c.created_at)}{c.last_sent_at ? ` · last sent ${fmtDate(c.last_sent_at, true)}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Add leads</Button>
            <Button icon={<Users className="size-4" />} onClick={() => nav(`/leads?campaign_id=${c.id}`)}>View leads</Button>
            <Button icon={<Wand2 className="size-4" />} onClick={() => setGen({ open: true, followup: true })}>Generate</Button>
            {c.status === 'paused'
              ? <Button icon={<Play className="size-4" />} loading={busy === 'resume'} onClick={() => api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status: 'active' } }).then(() => { toast('Campaign resumed.'); campaign.reload(); })}>Resume</Button>
              : <Button icon={<Pause className="size-4" />} onClick={() => api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status: 'paused' } }).then(() => { toast('Campaign paused. Nothing in it will be sent.'); campaign.reload(); })}>Pause</Button>}
            <Button variant="primary" icon={<CheckCheck className="size-4" />} disabled={!c.drafts} onClick={() => setConfirmAll(true)}>Approve drafts ({c.drafts})</Button>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-line sm:grid-cols-4 lg:grid-cols-7">
          {stats.map(([l, v], k) => (
            <div key={l} className={cx('border-line px-5 py-3.5', k > 0 && 'border-l', k >= 3 && 'max-sm:border-t', k >= 4 && 'max-lg:border-t')}>
              <p className="text-xs font-medium text-muted">{l}</p>
              <p className={cx('mt-0.5 text-xl font-semibold tabular-nums', l === 'Replied' && v ? 'text-emerald-600' : l === 'Bounced' && v ? 'text-red-600' : '')}>{v}</p>
            </div>
          ))}
        </div>
        {total > 0 && (
          <div className="border-t border-line px-5 py-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
              <span className="bg-brand-600" style={{ width: `${pct(c.sent)}%` }} />
              <span className="bg-brand-300" style={{ width: `${pct(c.queued)}%` }} />
              <span className="bg-gray-300" style={{ width: `${pct(c.drafts)}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-brand-600" />Sent {pct(c.sent)}%</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-brand-300" />Queued {pct(c.queued)}%</span>
              <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-gray-300" />Drafts {pct(c.drafts)}%</span>
            </div>
          </div>
        )}
      </Card>

      {/* The list and the preview fill the screen and stay in place while the page scrolls; the list scrolls inside */}
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <Card className="flex h-[70vh] min-h-[480px] flex-col overflow-hidden xl:sticky xl:top-0 xl:h-[calc(100vh-7rem)]">
          <div className="space-y-2 border-b border-line p-3">
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
              {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setOffset(0); }} className={cx('flex-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap transition', tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>{t.label}</button>)}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search business, email or subject" className="h-9 pl-8 text-[13px]" />
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {emails.loading && !emails.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : rows.length === 0 ? (
              <Empty icon={<Mail className="size-5" />} title="No emails here" sub="Ask Claude to write emails for this campaign's leads with add_email." />
            ) : rows.map((r) => {
              const on = r.id === current;
              return (
                <button key={r.id} ref={(el) => { if (on && el) el.scrollIntoView({ block: 'nearest' }); }} onClick={() => setCurrent(r.id)}
                  className={cx('relative flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition', on ? 'bg-brand-50/80' : 'hover:bg-gray-50')}>
                  {on && <span className="absolute inset-y-0 left-0 w-[3px] bg-brand-600" />}
                  <span className="relative"><Avatar name={r.business_name || r.lead_email} className="size-9" />
                    <span className="absolute -right-1.5 -bottom-1 rounded bg-white px-1 text-[9px] font-bold text-gray-500 shadow-sm ring-1 ring-line">{r.step === 0 ? '1st' : `F${r.step}`}</span></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className={cx('truncate text-sm', on ? 'font-semibold text-ink' : 'font-medium')}>{r.business_name || r.lead_email}</span><StatusChip status={r.status} /></span>
                    <span className="mt-0.5 block truncate text-[13px] text-gray-600">{r.subject}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{[r.city, r.state].filter(Boolean).join(', ')}{r.sent_at ? ` · sent ${fmtDate(r.sent_at)}` : ''}{r.error ? ` · ${r.error}` : ''}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {emails.data && emails.data.total > limit && <Pagination offset={offset} limit={limit} total={emails.data.total} onChange={setOffset} />}
        </Card>

        <Card className="flex h-[80vh] min-h-[520px] flex-col overflow-hidden xl:sticky xl:top-0 xl:h-[calc(100vh-7rem)]">
          {!sel ? <Empty title="Choose an email" sub="Select an email on the left to preview it." /> : (
            <>
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={sel.business_name || sel.lead_email} className="size-10" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><p className="truncate font-semibold">{sel.business_name || sel.lead_email}</p><StatusChip status={sel.status} /></div>
                      <p className="mt-0.5 truncate text-sm text-gray-600">{sel.subject}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-line p-0.5">
                      <button aria-label="Desktop preview" onClick={() => setDevice('desktop')} className={cx('rounded-md p-1.5', device === 'desktop' ? 'bg-gray-100 text-ink' : 'text-muted')}><Monitor className="size-4" /></button>
                      <button aria-label="Mobile preview" onClick={() => setDevice('mobile')} className={cx('rounded-md p-1.5', device === 'mobile' ? 'bg-gray-100 text-ink' : 'text-muted')}><Smartphone className="size-4" /></button>
                    </div>
                    <a href={`/api/emails/${sel.id}/preview`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line px-2.5 text-muted hover:bg-gray-50" aria-label="Open in new tab"><ExternalLink className="size-4" /></a>
                    {canEdit && <Button icon={<Pencil className="size-4" />} onClick={openEdit}>Edit</Button>}
                    {['approved', 'skipped', 'failed', 'cancelled'].includes(sel.status) && <Button icon={<Undo2 className="size-4" />} loading={busy === 'draft'} onClick={() => act('draft', '/emails/unapprove', { ids: [sel.id] }, 'Moved back to drafts.')}>Back to draft</Button>}
                    {canEdit && <Button icon={<SkipForward className="size-4" />} loading={busy === 'skip'} onClick={() => act('skip', '/emails/skip', { ids: [sel.id] }, 'Skipped. It will not be sent.', true)}>Skip</Button>}
                    {['draft', 'failed'].includes(sel.status) && <Button variant="primary" icon={<Check className="size-4" />} loading={busy === 'approve'} onClick={() => act('approve', '/emails/approve', { ids: [sel.id] }, 'Approved for sending.', true)}>Approve</Button>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-gray-700"><Mail className="size-3.5" />{sel.lead_email}</span>
                  <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">{sel.step === 0 ? 'First email' : `Follow-up ${sel.step} · ${sel.delay_days} days later`}</span>
                  {[sel.city, sel.state].some(Boolean) && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">{[sel.city, sel.state].filter(Boolean).join(', ')}</span>}
                  {localTime(sel.timezone) && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">Their time: {localTime(sel.timezone)}</span>}
                  {sel.account_email && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">From {sel.account_email}</span>}
                  {sel.sent_at && <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">Sent {fmtDate(sel.sent_at, true)}</span>}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 justify-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-gray-50 [background-size:16px_16px] p-4">
                <iframe
                  key={`${sel.id}-${frameKey}`}
                  title="Email preview"
                  src={`/api/emails/${sel.id}/preview`}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className={cx('h-full rounded-xl border border-line bg-white shadow-md transition-all', device === 'mobile' ? 'w-[390px] rounded-[28px] border-[6px] border-gray-800' : 'w-full max-w-[820px]')}
                />
              </div>
              <p className="flex items-center gap-1.5 border-t border-line px-5 py-2 text-xs text-muted">
                <kbd className="rounded border border-line bg-white px-1.5 font-sans">↑</kbd><kbd className="rounded border border-line bg-white px-1.5 font-sans">↓</kbd> move between emails · the postal address and unsubscribe link are added at send time
              </p>
            </>
          )}
        </Card>
      </div>

      <Modal open={confirmAll} onClose={() => setConfirmAll(false)} title={`Approve ${c.drafts} drafts?`} sub="They'll be sent by your connected inboxes, weekdays 8am–5pm in each lead's time zone, within each inbox's daily limit."
        footer={<><Button onClick={() => setConfirmAll(false)}>Cancel</Button><Button variant="primary" loading={busy === 'all'} onClick={async () => { await act('all', `/campaigns/${c.id}/approve`, {}, `${c.drafts} emails approved.`); setConfirmAll(false); }}>Approve and queue</Button></>}>
        <p className="text-sm text-gray-600">You can pause the campaign or all sending at any time. Leads who reply, bounce or unsubscribe are never emailed again.</p>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title="Edit email" sub="Tokens: {{postal_address}}, {{unsubscribe_url}}, {{image_url}}"
        footer={<><Button variant="danger" icon={<Trash2 className="size-4" />} className="mr-auto" onClick={() => act('skip', '/emails/skip', { ids: [edit.id] }, 'Skipped.').then(() => setEdit(null))}>Skip this email</Button><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" loading={busy === 'save'} onClick={saveEdit}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <div><label className="mb-1.5 block text-[13px] font-medium">Subject</label><Input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></div>
            <div><label className="mb-1.5 block text-[13px] font-medium">Plain text</label><Textarea rows={8} value={edit.text || ''} onChange={(e) => setEdit({ ...edit, text: e.target.value })} /></div>
            <div><label className="mb-1.5 block text-[13px] font-medium">HTML <span className="font-normal text-muted">({Math.round((edit.html || '').length / 1024)} KB)</span></label><Textarea rows={8} value={edit.html || ''} onChange={(e) => setEdit({ ...edit, html: e.target.value })} className="font-mono text-xs" /></div>
          </div>
        )}
      </Modal>
      <BulkModal open={bulk} onClose={() => setBulk(false)} onDone={refresh} defaultCampaign={c.id} />
      <Modal open={gen.open} onClose={() => setGen({ open: false, followup: true })} title="Generate emails from designs"
        sub="Every lead in this campaign without an email gets one of the 10 designs for its business type, filled with its own name, city and details."
        footer={gen.result ? <Button variant="primary" onClick={() => setGen({ open: false, followup: true })}>Done</Button> : <><Button onClick={() => setGen({ open: false, followup: true })}>Cancel</Button>
          <Button variant="primary" icon={<Wand2 className="size-4" />} loading={busy === 'gen'} onClick={async () => {
            setBusy('gen');
            try { const r = await api<any>(`/campaigns/${c.id}/generate`, { body: { followup: gen.followup } }); setGen({ ...gen, result: r }); refresh(); }
            catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
          }}>Generate drafts</Button></>}>
        {gen.result ? (
          <div className="space-y-2 text-sm">
            <p><b>{gen.result.created}</b> emails drafted{gen.result.followups ? <>, plus <b>{gen.result.followups}</b> follow-ups</> : null}. Review them, then approve.</p>
            {Object.keys(gen.result.by_type || {}).length > 0 && <p className="text-muted">{Object.entries(gen.result.by_type).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
            {gen.result.skipped?.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                <p className="mb-1 font-medium">{gen.result.skipped.length} skipped</p>
                <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs">{gen.result.skipped.slice(0, 50).map((s: any) => <li key={s.email}>{s.email}: {s.reason}</li>)}</ul>
              </div>
            )}
          </div>
        ) : (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-brand-600" checked={gen.followup} onChange={(e) => setGen({ ...gen, followup: e.target.checked })} />
            <span>Also draft a short follow-up, sent 4 days later in the same thread (cancelled automatically if they reply).</span>
          </label>
        )}
      </Modal>
    </div>
  );
};
