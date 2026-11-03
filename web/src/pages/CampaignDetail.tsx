import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Check, CheckCheck, Pause, Play, Pencil, SkipForward, Undo2, Upload, Trash2, Search, Monitor, Smartphone, Users, Mail, ExternalLink } from 'lucide-react';
import { api, fmtDate, qs, type Campaign, type EmailRow } from '../api.ts';
import { Button, Card, Empty, Input, Modal, Pagination, Spinner, StatusChip, Textarea, cx, useLoad, useToast } from '../ui.tsx';
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

  return (
    <div>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />Campaigns</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{c.name}</h1><StatusChip status={c.status} /></div>
          <p className="mt-1 text-sm text-muted">{c.notes || `Created ${fmtDate(c.created_at)}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Add leads</Button>
          <Button icon={<Users className="size-4" />} onClick={() => nav(`/leads?campaign_id=${c.id}`)}>View leads</Button>
          {c.status === 'paused'
            ? <Button icon={<Play className="size-4" />} loading={busy === 'resume'} onClick={() => api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status: 'active' } }).then(() => { toast('Campaign resumed.'); campaign.reload(); })}>Resume</Button>
            : <Button icon={<Pause className="size-4" />} onClick={() => api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status: 'paused' } }).then(() => { toast('Campaign paused. Nothing in it will be sent.'); campaign.reload(); })}>Pause</Button>}
          <Button variant="primary" icon={<CheckCheck className="size-4" />} disabled={!c.drafts} onClick={() => setConfirmAll(true)}>Approve all drafts ({c.drafts})</Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map(([l, v]) => (
          <Card key={l} className="px-4 py-3"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-xl font-semibold tabular-nums">{v}</p></Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="flex min-h-[560px] flex-col">
          <div className="border-b border-line p-3">
            <div className="mb-2 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
              {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setOffset(0); }} className={cx('flex-1 rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap', tab === t.id ? 'bg-white shadow-sm' : 'text-muted hover:text-ink')}>{t.label}</button>)}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} placeholder="Search business, email or subject" className="h-8 pl-8 text-[13px]" />
            </div>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto">
            {emails.loading && !emails.data ? <div className="grid h-40 place-items-center"><Spinner /></div> : rows.length === 0 ? (
              <Empty icon={<Mail className="size-5" />} title="No emails here" sub="Ask Claude to write emails for this campaign's leads with add_email." />
            ) : rows.map((r) => (
              <button key={r.id} onClick={() => setCurrent(r.id)} className={cx('flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition', r.id === current ? 'bg-brand-50/70' : 'hover:bg-gray-50')}>
                <span className={cx('mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-[11px] font-semibold', r.id === current ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600')}>{r.step === 0 ? '1st' : `F${r.step}`}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{r.business_name || r.lead_email}</span><StatusChip status={r.status} /></span>
                  <span className="mt-0.5 block truncate text-[13px] text-gray-600">{r.subject}</span>
                  <span className="block truncate text-xs text-muted">{[r.city, r.state].filter(Boolean).join(', ')}{r.sent_at ? ` · sent ${fmtDate(r.sent_at)}` : ''}{r.error ? ` · ${r.error}` : ''}</span>
                </span>
              </button>
            ))}
          </div>
          {emails.data && emails.data.total > limit && <Pagination offset={offset} limit={limit} total={emails.data.total} onChange={setOffset} />}
        </Card>

        <Card className="flex min-h-[560px] flex-col overflow-hidden">
          {!sel ? <Empty title="Choose an email" sub="Select an email on the left to preview it." /> : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{sel.subject}</p>
                  <p className="mt-0.5 truncate text-sm text-muted">To {sel.lead_email} · {sel.step === 0 ? 'First email' : `Follow-up ${sel.step}, ${sel.delay_days} days after the previous email`}{sel.timezone ? ` · ${sel.timezone.replace('America/', '').replace('_', ' ')} time` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex rounded-lg border border-line p-0.5">
                    <button aria-label="Desktop preview" onClick={() => setDevice('desktop')} className={cx('rounded-md p-1.5', device === 'desktop' ? 'bg-gray-100' : 'text-muted')}><Monitor className="size-4" /></button>
                    <button aria-label="Mobile preview" onClick={() => setDevice('mobile')} className={cx('rounded-md p-1.5', device === 'mobile' ? 'bg-gray-100' : 'text-muted')}><Smartphone className="size-4" /></button>
                  </div>
                  <a href={`/api/emails/${sel.id}/preview`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line px-2.5 text-muted hover:bg-gray-50" aria-label="Open in new tab"><ExternalLink className="size-4" /></a>
                  {['draft', 'approved', 'failed'].includes(sel.status) && <Button icon={<Pencil className="size-4" />} onClick={openEdit}>Edit</Button>}
                  {['approved', 'skipped', 'failed', 'cancelled'].includes(sel.status) && <Button icon={<Undo2 className="size-4" />} loading={busy === 'draft'} onClick={() => act('draft', '/emails/unapprove', { ids: [sel.id] }, 'Moved back to drafts.')}>Back to draft</Button>}
                  {['draft', 'approved', 'failed'].includes(sel.status) && <Button icon={<SkipForward className="size-4" />} loading={busy === 'skip'} onClick={() => act('skip', '/emails/skip', { ids: [sel.id] }, 'Skipped. It will not be sent.', true)}>Skip</Button>}
                  {['draft', 'failed'].includes(sel.status) && <Button variant="primary" icon={<Check className="size-4" />} loading={busy === 'approve'} onClick={() => act('approve', '/emails/approve', { ids: [sel.id] }, 'Approved for sending.', true)}>Approve</Button>}
                </div>
              </div>
              <div className="flex flex-1 justify-center bg-gray-100/70 p-4">
                <iframe
                  key={`${sel.id}-${frameKey}`}
                  title="Email preview"
                  src={`/api/emails/${sel.id}/preview`}
                  sandbox="allow-popups allow-popups-to-escape-sandbox"
                  className={cx('h-[640px] rounded-lg border border-line bg-white shadow-sm transition-all', device === 'mobile' ? 'w-[390px]' : 'w-full max-w-[820px]')}
                />
              </div>
              <p className="border-t border-line px-5 py-2 text-xs text-muted">Use ↑ ↓ to move between emails. The postal address and unsubscribe link are added at send time.</p>
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
    </div>
  );
};
