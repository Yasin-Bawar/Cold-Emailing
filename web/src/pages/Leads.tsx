import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronDown, Download, ListPlus, Search, X, Users, Mail, Globe, Phone, Save, Ban, Tag, Filter as FilterIcon, Upload } from 'lucide-react';
import { api, qs, type Lead, type Campaign } from '../api.ts';
import { Avatar, Button, Card, Checkbox, Empty, Input, Modal, PageHeader, Pagination, Select, Spinner, StatusChip, cx, useLoad, useToast } from '../ui.tsx';
import { LeadDrawer } from './LeadDrawer.tsx';
import { BulkModal } from './BulkModal.tsx';

const STATUSES = ['new', 'queued', 'sent', 'replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced'];
type Facets = Record<'status' | 'city' | 'state' | 'category', { value: string; count: number }[]>;
type Filters = { q: string; status: string[]; city: string[]; state: string[]; category: string[]; campaign_id: string; list_id: string; replied: string };
const EMPTY: Filters = { q: '', status: [], city: [], state: [], category: [], campaign_id: '', list_id: '', replied: '' };

const Section = ({ title, count, children, open: initial = false }: { title: string; count?: number; children: ReactNode; open?: boolean }) => {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border-b border-line py-3">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2">{title}{count ? <span className="rounded-full bg-brand-50 px-1.5 text-[11px] font-semibold text-brand-700">{count}</span> : null}</span>
        <ChevronDown className={cx('size-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
};

const TagPicker = ({ options, value, onChange, placeholder }: { options: { value: string; count: number }[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) => {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !value.includes(o.value) && o.value.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
              {v}<button onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-8 text-[13px]" />
      <div className="mt-1.5 max-h-40 overflow-y-auto">
        {shown.map((o) => (
          <button key={o.value} onClick={() => { onChange([...value, o.value]); setQ(''); }} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-gray-50">
            <span className="truncate capitalize">{o.value}</span><span className="text-xs text-muted">{o.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const fromParams = (p: URLSearchParams): Filters => ({
  q: p.get('q') || '',
  status: p.get('status')?.split(',').filter(Boolean) || [],
  city: p.get('city')?.split(',').filter(Boolean) || [],
  state: p.get('state')?.split(',').filter(Boolean) || [],
  category: p.get('category')?.split(',').filter(Boolean) || [],
  campaign_id: p.get('campaign_id') || '',
  list_id: p.get('list_id') || '',
  replied: p.get('replied') || '',
});

const loadViews = (): { name: string; filters: Filters }[] => { try { return JSON.parse(localStorage.getItem('mvn.views') || '[]'); } catch { return []; } };

export const Leads = () => {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState<Filters>(() => fromParams(params));
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [listModal, setListModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [views, setViews] = useState(loadViews);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { const n = fromParams(params); setF(n); setOffset(0); }, [params]);
  useEffect(() => {
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v && (!Array.isArray(v) || v.length)) p[k] = Array.isArray(v) ? v.join(',') : v;
    if (new URLSearchParams(p).toString() !== params.toString()) setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const query = useMemo(() => qs({ ...f, limit, offset }), [f, limit, offset]);
  const leads = useLoad(() => api<{ rows: Lead[]; total: number }>(`/leads${query}`), [query]);
  const facets = useLoad(() => api<Facets>('/leads/facets'), []);
  const campaigns = useLoad(() => api<Campaign[]>('/campaigns'), []);
  const lists = useLoad(() => api<{ id: string; name: string; leads: number }[]>('/lists'), []);
  const rows = leads.data?.rows || [];
  const set = (patch: Partial<Filters>) => { setF((x) => ({ ...x, ...patch })); setOffset(0); setSel(new Set()); };
  const activeCount = f.status.length + f.city.length + f.state.length + f.category.length + (f.campaign_id ? 1 : 0) + (f.list_id ? 1 : 0) + (f.replied ? 1 : 0);
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const saveView = () => {
    const name = prompt('Name this search');
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, filters: f }];
    setViews(next);
    try { localStorage.setItem('mvn.views', JSON.stringify(next)); } catch { /* storage unavailable */ }
    toast(`Saved "${name}".`);
  };

  const bulkUpdate = async (patch: Record<string, unknown>, msg: string) => {
    try {
      await api('/leads/bulk-update', { body: { ids: [...sel], patch } });
      toast(msg);
      setSel(new Set());
      leads.reload();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const filters = (
    <Card className="p-4">
      <div className="flex items-center justify-between pb-1">
        <p className="text-sm font-semibold">Filters</p>
        {activeCount > 0 && <button onClick={() => set({ ...EMPTY, q: f.q })} className="text-xs font-medium text-brand-600">Clear all</button>}
      </div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400" />
        <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search people" className="pl-8" />
      </div>
      <Section title="Lead status" count={f.status.length} open>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const on = f.status.includes(s);
            const n = facets.data?.status.find((x) => x.value === s)?.count || 0;
            return (
              <button key={s} onClick={() => set({ status: on ? f.status.filter((x) => x !== s) : [...f.status, s] })} className={cx('rounded-md border px-2 py-1 text-xs font-medium capitalize transition', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-gray-600 hover:bg-gray-50')}>
                {s} <span className="text-muted">{n}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Contact data" count={f.replied ? 1 : 0}>
        <Select value={f.replied} onChange={(e) => set({ replied: e.target.value })} className="w-full">
          <option value="">Any</option>
          <option value="true">Replied</option>
          <option value="false">No reply yet</option>
        </Select>
      </Section>
      <Section title="Campaign" count={f.campaign_id ? 1 : 0}>
        <Select value={f.campaign_id} onChange={(e) => set({ campaign_id: e.target.value })} className="w-full">
          <option value="">All campaigns</option>
          {campaigns.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Section>
      <Section title="List" count={f.list_id ? 1 : 0}>
        <Select value={f.list_id} onChange={(e) => set({ list_id: e.target.value })} className="w-full">
          <option value="">All lists</option>
          {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Section>
      <Section title="Location" count={f.city.length + f.state.length}>
        <p className="mb-1.5 text-xs text-muted">City</p>
        <TagPicker options={facets.data?.city || []} value={f.city} onChange={(city) => set({ city })} placeholder="Add a city" />
        <p className="mt-3 mb-1.5 text-xs text-muted">State</p>
        <TagPicker options={facets.data?.state || []} value={f.state} onChange={(state) => set({ state })} placeholder="Add a state" />
      </Section>
      <Section title="Industry" count={f.category.length}>
        <TagPicker options={facets.data?.category || []} value={f.category} onChange={(category) => set({ category })} placeholder="Add an industry" />
      </Section>
      {views.length > 0 && (
        <div className="border-b border-line py-3">
          <p className="mb-2 text-sm font-medium">Saved searches</p>
          {views.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-gray-50">
              <button className="flex-1 truncate text-left" onClick={() => set(v.filters)}>{v.name}</button>
              <button aria-label="Delete saved search" onClick={() => { const n = views.filter((x) => x.name !== v.name); setViews(n); try { localStorage.setItem('mvn.views', JSON.stringify(n)); } catch { /* ignore */ } }}><X className="size-3.5 text-muted" /></button>
            </div>
          ))}
        </div>
      )}
      <Button className="mt-4 w-full" icon={<Save className="size-4" />} onClick={saveView}>Save search</Button>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title="People"
        sub={leads.data ? `${leads.data.total.toLocaleString()} leads match` : 'Your leads'}
        right={<Button icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Include/exclude in bulk</Button>}
      />
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="lg:hidden"><Button icon={<FilterIcon className="size-4" />} onClick={() => setShowFilters((v) => !v)}>Filters {activeCount ? `(${activeCount})` : ''}</Button></div>
        <div className={cx('w-full shrink-0 lg:block lg:w-72', showFilters ? 'block' : 'hidden')}>{filters}</div>

        <Card className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <span className="mr-auto text-sm text-muted">{sel.size ? <b className="text-ink">{sel.size} selected</b> : 'Select leads for bulk actions'}</span>
            <Button size="sm" icon={<ListPlus className="size-4" />} disabled={!sel.size} onClick={() => setListModal(true)}>Add to list</Button>
            <Button size="sm" icon={<Tag className="size-4" />} disabled={!sel.size} onClick={() => setStatusModal(true)}>Set status</Button>
            <Button size="sm" icon={<Ban className="size-4" />} disabled={!sel.size} onClick={async () => {
              const emails = rows.filter((r) => sel.has(r.id)).map((r) => r.email);
              if (!confirm(`Never email these ${emails.length} addresses?`)) return;
              await api('/suppression', { body: { emails, reason: 'manual' } });
              toast(`${emails.length} added to the never-email list.`); setSel(new Set()); leads.reload();
            }}>Exclude</Button>
            <a href={`/api/leads/export.csv${qs(f)}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-medium shadow-[0_1px_2px_rgba(16,24,40,.05)] hover:bg-gray-50"><Download className="size-4" />Export</a>
          </div>
          {leads.loading && !leads.data ? (
            <div className="grid h-64 place-items-center"><Spinner /></div>
          ) : rows.length === 0 ? (
            <Empty icon={<Users className="size-5" />} title="No leads found" sub={activeCount || f.q ? 'Try removing some filters.' : 'Import a CSV, paste emails, or let Claude add leads through MCP.'} action={<Button variant="primary" onClick={() => setBulk(true)}>Add leads</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-gray-50/60 text-left text-xs text-muted">
                  <tr>
                    <th className="w-10 px-4 py-2.5"><Checkbox label="Select all" checked={allOnPage} indeterminate={sel.size > 0} onChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                    {['Name', 'Location', 'Company / campaign', 'Contact', 'Industry', 'Status'].map((h) => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody className={cx('divide-y divide-line', leads.loading && 'opacity-60')}>
                  {rows.map((l) => (
                    <tr key={l.id} onClick={() => setOpen(l.id)} className={cx('cursor-pointer hover:bg-gray-50/70', sel.has(l.id) && 'bg-brand-50/40')}>
                      <td className="px-4 py-3"><Checkbox label={`Select ${l.business_name}`} checked={sel.has(l.id)} onChange={(v) => { const n = new Set(sel); if (v) n.add(l.id); else n.delete(l.id); setSel(n); }} /></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={l.business_name || l.email} />
                          <div className="min-w-0">
                            <div className="max-w-[220px] truncate font-medium">{l.business_name || l.email.split('@')[0]}</div>
                            <div className="max-w-[220px] truncate text-xs text-muted">{l.contact_name || l.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{[l.city, l.state].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-md border border-line bg-white text-[10px] font-bold text-gray-500">{(l.campaign_name || '—').slice(0, 2).toUpperCase()}</span>
                          <span className="max-w-[140px] truncate text-gray-700">{l.campaign_name || 'No campaign'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <span title={l.email} className="grid size-7 place-items-center rounded-md bg-brand-50 text-brand-600"><Mail className="size-3.5" /></span>
                          <span title={l.phone || 'No phone'} className={cx('grid size-7 place-items-center rounded-md', l.phone ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50')}><Phone className="size-3.5" /></span>
                          <span title={l.website || l.source_url || 'No link'} className={cx('grid size-7 place-items-center rounded-md', l.website || l.source_url ? 'bg-violet-50 text-violet-600' : 'bg-gray-50')}><Globe className="size-3.5" /></span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-gray-600 capitalize">{l.category || '—'}</td>
                      <td className="px-3 py-3"><StatusChip status={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {leads.data && leads.data.total > 0 && <Pagination offset={offset} limit={limit} total={leads.data.total} onChange={(o) => { setOffset(o); setSel(new Set()); }} onLimit={(l) => { setLimit(l); setOffset(0); }} />}
        </Card>
      </div>

      <LeadDrawer id={open} onClose={() => setOpen(null)} onChanged={leads.reload} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} onDone={() => { leads.reload(); facets.reload(); }} />
      <AddToListModal open={listModal} onClose={() => setListModal(false)} ids={[...sel]} lists={lists.data || []} onDone={() => { setSel(new Set()); lists.reload(); }} />
      <Modal open={statusModal} onClose={() => setStatusModal(false)} title={`Set status for ${sel.size} leads`} sub="Replied, interested, won, lost, unsubscribed and bounced stop their unsent emails.">
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => <button key={s} onClick={() => { setStatusModal(false); bulkUpdate({ status: s }, `${sel.size} leads set to ${s}.`); }} className="rounded-lg border border-line px-3 py-2 text-sm capitalize hover:border-brand-500 hover:bg-brand-50">{s}</button>)}
        </div>
      </Modal>
    </div>
  );
};

const AddToListModal = ({ open, onClose, ids, lists, onDone }: { open: boolean; onClose: () => void; ids: string[]; lists: { id: string; name: string }[]; onDone: () => void }) => {
  const toast = useToast();
  const [list, setList] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const id = list || (await api<{ id: string }>('/lists', { body: { name } })).id;
      const r = await api<{ added: number }>(`/lists/${id}/leads`, { body: { ids } });
      toast(`${r.added} leads added to the list.`);
      onDone(); onClose(); setName(''); setList('');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Add ${ids.length} leads to a list`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!list && !name.trim()} onClick={go}>Add to list</Button></>}>
      <Select value={list} onChange={(e) => setList(e.target.value)} className="w-full">
        <option value="">Create a new list…</option>
        {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </Select>
      {!list && <Input className="mt-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name, e.g. Tulsa barbers" />}
    </Modal>
  );
};
