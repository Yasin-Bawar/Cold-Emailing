import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Plus, Upload, Download, Filter, Search, Building2, Columns3, MoreHorizontal, ExternalLink, Pause, Play, Trash2 } from 'lucide-react';
import { api, fmtDate, type Campaign } from '../api.ts';
import { Button, Card, Empty, Input, Modal, PageHeader, Spinner, StatusChip, Textarea, cx, useLoad, useToast } from '../ui.tsx';
import { BulkModal } from './BulkModal.tsx';
import { toCsvDownload } from './util.ts';

const VIEWS = [
  { id: 'all', label: 'All campaigns' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Drafts' },
  { id: 'done', label: 'Paused & done' },
];
const COLS = [
  { id: 'leads', label: 'Leads' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'queued', label: 'Queued' },
  { id: 'sent', label: 'Sent' },
  { id: 'replied', label: 'Replied' },
  { id: 'bounced', label: 'Bounced' },
  { id: 'created', label: 'Created at' },
];

export const NewCampaignModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const c = await api<Campaign>('/campaigns', { body: { name, notes: notes || null } });
      toast(`Campaign "${c.name}" created.`);
      onClose();
      setName(''); setNotes('');
      nav(`/campaigns/${c.id}`);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Create campaign" sub="Then add leads, and ask Claude to write each email with MCP." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={go}>Create campaign</Button></>}>
      <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Name</label>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Phoenix barbers, November" onKeyDown={(e) => e.key === 'Enter' && name.trim() && go()} />
      <label className="mt-4 mb-1.5 block text-[13px] font-medium text-gray-700">Notes <span className="font-normal text-muted">(optional, Claude can read these)</span></label>
      <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Offer, tone, who it's for…" />
    </Modal>
  );
};

// The ⋯ menu on a campaign row. It opens in a fixed layer so the table's scroll box can't cut it off, and its clicks
// never reach the row (which opens the campaign).
const RowMenu = ({ c, onOpen, onToggle, onDelete }: { c: Campaign; onOpen: () => void; onToggle: () => void; onDelete: () => void }) => {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    // Close when the page scrolls, but not for the small scroll the browser makes when the button takes focus
    const y = window.scrollY;
    const scroll = () => Math.abs(window.scrollY - y) > 8 && close();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', scroll);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', scroll); window.removeEventListener('resize', close); window.removeEventListener('keydown', key); };
  }, [pos]);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 160;
    setPos({ top: below ? r.bottom + 4 : r.top - 4 - 132, right: window.innerWidth - r.right });
  };
  const item = (icon: React.ReactNode, label: string, fn: () => void, danger = false) => (
    <button role="menuitem" onClick={(e) => { e.stopPropagation(); setPos(null); fn(); }} className={cx('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm', danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-gray-50')}>{icon}{label}</button>
  );
  const paused = c.status === 'paused';
  return (
    <>
      <button ref={btn} aria-label={`Actions for ${c.name}`} aria-haspopup="menu" aria-expanded={!!pos} onMouseDown={(e) => e.stopPropagation()} onClick={open} className="ml-auto grid size-8 place-items-center rounded-lg text-muted hover:bg-gray-100 hover:text-ink"><MoreHorizontal className="size-4" /></button>
      {pos && (
        <div role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }} className="z-40 w-48 rounded-xl border border-line bg-white p-1.5 text-left shadow-lg" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          {item(<ExternalLink className="size-4" />, 'Open', onOpen)}
          {item(paused ? <Play className="size-4" /> : <Pause className="size-4" />, paused ? 'Resume' : 'Pause', onToggle)}
          <div className="my-1 border-t border-line" />
          {item(<Trash2 className="size-4" />, 'Delete campaign', onDelete, true)}
        </div>
      )}
    </>
  );
};

const DeleteCampaignModal = ({ c, onClose, onDone }: { c: Campaign | null; onClose: () => void; onDone: () => void }) => {
  const toast = useToast();
  const [withLeads, setWithLeads] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWithLeads(true); }, [c?.id]);
  if (!c) return null;
  const go = async () => {
    setBusy(true);
    try {
      const r = await api<{ leads_deleted: number; leads_kept: number }>(`/campaigns/${c.id}${withLeads ? '?leads=1' : ''}`, { method: 'DELETE' });
      toast(withLeads ? `Deleted "${c.name}" and ${r.leads_deleted} leads${r.leads_kept ? ` (${r.leads_kept} already emailed were kept)` : ''}.` : `Deleted "${c.name}". Its leads are still under People.`);
      onClose(); onDone();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Delete "${c.name}"?`} sub="This can't be undone. Its unsent emails are deleted; emails already sent stay in each lead's history."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} icon={<Trash2 className="size-4" />} onClick={go}>Delete campaign</Button></>}>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm hover:bg-gray-50">
        <input type="checkbox" className="mt-0.5 accent-brand-600" checked={withLeads} onChange={(e) => setWithLeads(e.target.checked)} />
        <span><b className="font-medium text-ink">Also delete its {c.leads} leads</b><br /><span className="text-muted">Leads that were already emailed are kept, so nobody gets a second first email.</span></span>
      </label>
    </Modal>
  );
};

export const Campaigns = () => {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const campaigns = useLoad(() => api<Campaign[]>('/campaigns'), []);
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [bulk, setBulk] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [minSent, setMinSent] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [colsOpen, setColsOpen] = useState(false);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const toast = useToast();
  const toggle = async (c: Campaign) => {
    const status = c.status === 'paused' ? 'active' : 'paused';
    try { await api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status } }); toast(status === 'paused' ? `Paused "${c.name}". Nothing in it will be sent.` : `Resumed "${c.name}".`); campaigns.reload(); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
  const creating = params.get('new') === '1';
  useEffect(() => { if (creating) campaigns.reload(); /* refresh list when modal opens */ }, [creating]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (campaigns.data || []).filter((c) =>
    (view === 'all' || (view === 'done' ? ['paused', 'done'].includes(c.status) : c.status === view)) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase())) &&
    (!minSent || c.sent >= Number(minSent))), [campaigns.data, view, q, minSent]);
  const show = (id: string) => !hidden.has(id);

  return (
    <div>
      <PageHeader
        icon={<Building2 className="size-5" />}
        tint="bg-orange-100 text-orange-700"
        title="Campaigns"
        sub="Each campaign holds leads and one custom email per lead (plus follow-ups)."
        right={
          <>
            <div className="relative">
              <Button icon={<Columns3 className="size-4" />} onClick={() => setColsOpen((v) => !v)}>Edit columns</Button>
              {colsOpen && (
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-line bg-white p-2 shadow-lg" onMouseLeave={() => setColsOpen(false)}>
                  {COLS.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50">
                      <input type="checkbox" className="accent-brand-600" checked={show(c.id)} onChange={() => { const n = new Set(hidden); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); setHidden(n); }} />{c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <Button icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Import</Button>
            <Button icon={<Download className="size-4" />} onClick={() => toCsvDownload('campaigns.csv', rows as any, ['name', 'status', 'leads', 'emails', 'drafts', 'queued', 'sent', 'replied', 'bounced', 'unsubscribed', 'created_at'])}>Export</Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setParams({ new: '1' })}>Create campaign</Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {VIEWS.map((v) => (
              <button key={v.id} onClick={() => setView(v.id)} className={cx('rounded-md px-3 py-1.5 text-[13px] font-medium transition', view === v.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>{v.label}</button>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="h-8 pl-8 text-[13px]" />
          </div>
          <Button size="sm" icon={<Filter className="size-4" />} onClick={() => setShowFilter((v) => !v)}>Filters</Button>
        </div>
        {showFilter && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-gray-50/60 px-4 py-3 text-sm">
            <span className="text-muted">At least</span>
            <Input type="number" min={0} value={minSent} onChange={(e) => setMinSent(e.target.value)} className="h-8 w-24" />
            <span className="text-muted">emails sent</span>
            {minSent && <button className="text-xs font-medium text-brand-600" onClick={() => setMinSent('')}>Clear</button>}
          </div>
        )}
        {!campaigns.data ? (
          <div className="grid h-64 place-items-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <Empty icon={<Building2 className="size-5" />} title={campaigns.data.length ? 'No campaigns match' : 'No campaigns yet'} sub="Create a campaign, or ask Claude: “create a campaign for Phoenix barbers and write an email for each lead”." action={<Button variant="primary" onClick={() => setParams({ new: '1' })}>Create campaign</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-gray-50/60 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  {COLS.filter((c) => show(c.id)).map((c) => <th key={c.id} className="px-4 py-2.5 font-medium">{c.label}</th>)}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-gray-50/70" onClick={() => nav(`/campaigns/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">{c.name.slice(0, 2).toUpperCase()}</span>
                        <div><div className="font-medium">{c.name}</div>{c.notes && <div className="max-w-xs truncate text-xs text-muted">{c.notes}</div>}</div>
                      </div>
                    </td>
                    {show('leads') && <td className="px-4 py-3 tabular-nums">{c.leads}</td>}
                    {show('drafts') && <td className="px-4 py-3 tabular-nums">{c.drafts}</td>}
                    {show('queued') && <td className="px-4 py-3 tabular-nums">{c.queued}</td>}
                    {show('sent') && <td className="px-4 py-3 tabular-nums">{c.sent}</td>}
                    {show('replied') && <td className="px-4 py-3 tabular-nums">{c.replied}</td>}
                    {show('bounced') && <td className="px-4 py-3 tabular-nums">{c.bounced}</td>}
                    {show('created') && <td className="px-4 py-3 text-gray-600">{fmtDate(c.created_at)}</td>}
                    <td className="px-4 py-3"><StatusChip status={c.status} /></td>
                    <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}><RowMenu c={c} onOpen={() => nav(`/campaigns/${c.id}`)} onToggle={() => toggle(c)} onDelete={() => setDeleting(c)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <NewCampaignModal open={creating} onClose={() => { setParams({}); campaigns.reload(); }} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} onDone={campaigns.reload} />
      <DeleteCampaignModal c={deleting} onClose={() => setDeleting(null)} onDone={campaigns.reload} />
    </div>
  );
};
