import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ChevronDown, Download, ListPlus, Search, X, Users, Mail, Globe, Phone, Save, Ban, Tag, Filter as FilterIcon, Upload, MapPin } from 'lucide-react';
import { api, qs, type Lead, type Campaign } from '../api.ts';
import { Avatar, Button, Card, Checkbox, Drawer, Empty, Input, Modal, PageHeader, Pagination, Select, Spinner, STATUS, StatusChip, TONE, cx, useLoad, useToast } from '../ui.tsx';
import { LeadDrawer } from './LeadDrawer.tsx';
import { BulkModal } from './BulkModal.tsx';

const STATUSES = ['new', 'queued', 'sent', 'replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced'];
type Facets = Record<'status' | 'city' | 'state' | 'category', { value: string; count: number }[]>;
type Filters = { q: string; status: string[]; city: string[]; state: string[]; category: string[]; campaign_id: string; list_id: string; replied: string };
const EMPTY: Filters = { q: '', status: [], city: [], state: [], category: [], campaign_id: '', list_id: '', replied: '' };

const Section = ({ title, count, children, open: initial = false }: { title: string; count?: number; children: ReactNode; open?: boolean }) => {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border-b border-line py-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-sm font-bold">
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
            <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 capitalize">
              {v}<button onClick={() => onChange(value.filter((x) => x !== v))} aria-label={`Remove ${v}`}><X className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 text-[13px]" />
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

// The status row at the top: one tap shows only that group. Same colors and icons as the status chips.
const QUICK = ['new', 'sent', 'replied', 'interested', 'won', 'bounced', 'unsubscribed', 'lost'];

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
  // Filters besides the status row and the search box
  const extraCount = f.city.length + f.state.length + f.category.length + (f.campaign_id ? 1 : 0) + (f.list_id ? 1 : 0) + (f.replied ? 1 : 0);
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const count = (s: string) => facets.data?.status.find((x) => x.value === s)?.count || 0;
  const everyone = (facets.data?.status || []).reduce((n, x) => n + x.count, 0);
  const campaignName = (id: string) => campaigns.data?.find((c) => c.id === id)?.name || 'Campaign';
  const listName = (id: string) => lists.data?.find((l) => l.id === id)?.name || 'List';

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
      leads.reload(); facets.reload();
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  // Active filters as removable chips, so it's always clear why the list looks the way it does
  const chips: { label: string; clear: () => void }[] = [
    ...(f.campaign_id ? [{ label: `Campaign: ${campaignName(f.campaign_id)}`, clear: () => set({ campaign_id: '' }) }] : []),
    ...(f.list_id ? [{ label: `List: ${listName(f.list_id)}`, clear: () => set({ list_id: '' }) }] : []),
    ...(f.replied ? [{ label: f.replied === 'true' ? 'Replied' : 'No reply yet', clear: () => set({ replied: '' }) }] : []),
    ...f.city.map((c) => ({ label: c, clear: () => set({ city: f.city.filter((x) => x !== c) }) })),
    ...f.state.map((c) => ({ label: c, clear: () => set({ state: f.state.filter((x) => x !== c) }) })),
    ...f.category.map((c) => ({ label: c, clear: () => set({ category: f.category.filter((x) => x !== c) }) })),
    ...(f.status.length > 1 ? f.status.map((c) => ({ label: STATUS[c]?.label || c, clear: () => set({ status: f.status.filter((x) => x !== c) }) })) : []),
  ];

  const filterPanel = (
    <div className="px-6 pb-6">
      <Section title="Campaign" count={f.campaign_id ? 1 : 0} open>
        <Select value={f.campaign_id} onChange={(e) => set({ campaign_id: e.target.value })} className="w-full">
          <option value="">All campaigns</option>
          {campaigns.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Section>
      <Section title="Replies" count={f.replied ? 1 : 0} open>
        <div className="grid grid-cols-3 gap-1.5">
          {[['', 'Any'], ['true', 'Replied'], ['false', 'No reply']].map(([v, l]) => (
            <button key={v} onClick={() => set({ replied: v })} className={cx('rounded-xl border px-2 py-2 text-[13px] font-semibold transition', f.replied === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-gray-600 hover:bg-soft')}>{l}</button>
          ))}
        </div>
      </Section>
      <Section title="Location" count={f.city.length + f.state.length} open>
        <p className="mb-1.5 text-xs font-semibold text-muted">City</p>
        <TagPicker options={facets.data?.city || []} value={f.city} onChange={(city) => set({ city })} placeholder="Type a city" />
        <p className="mt-4 mb-1.5 text-xs font-semibold text-muted">State</p>
        <TagPicker options={facets.data?.state || []} value={f.state} onChange={(state) => set({ state })} placeholder="Type a state" />
      </Section>
      <Section title="Business type" count={f.category.length}>
        <TagPicker options={facets.data?.category || []} value={f.category} onChange={(category) => set({ category })} placeholder="Type a business type" />
      </Section>
      <Section title="List" count={f.list_id ? 1 : 0}>
        <Select value={f.list_id} onChange={(e) => set({ list_id: e.target.value })} className="w-full">
          <option value="">All lists</option>
          {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </Section>
      <div className="pt-4">
        <p className="mb-2 text-sm font-bold">Saved searches</p>
        {views.length === 0 && <p className="mb-2 text-xs text-muted">Save the filters you use often.</p>}
        {views.map((v) => (
          <div key={v.name} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] hover:bg-soft">
            <button className="flex-1 truncate text-left font-medium" onClick={() => { set(v.filters); setShowFilters(false); }}>{v.name}</button>
            <button aria-label="Delete saved search" onClick={() => { const n = views.filter((x) => x.name !== v.name); setViews(n); try { localStorage.setItem('mvn.views', JSON.stringify(n)); } catch { /* ignore */ } }}><X className="size-3.5 text-muted" /></button>
          </div>
        ))}
        <Button className="mt-2 w-full" icon={<Save className="size-4" />} onClick={saveView}>Save this search</Button>
      </div>
    </div>
  );

  return (
    <div className="pb-24">
      <PageHeader
        icon={<Users className="size-5" />}
        tint="bg-sky-100 text-sky-700"
        title="People"
        sub={leads.data ? <><b className="font-semibold text-ink">{leads.data.total.toLocaleString()}</b> {leads.data.total === 1 ? 'lead' : 'leads'}{f.q || f.status.length || extraCount ? ' match your filters' : ' in total'}</> : 'Everyone you can email'}
        right={<>
          <Button variant="ghost" icon={<Download className="size-4" />} onClick={() => { window.location.href = `/api/leads/export.csv${qs(f)}`; }}>Export</Button>
          <Button icon={<Ban className="size-4" />} onClick={() => setBulk(true)}>Include / exclude</Button>
          <Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Add leads</Button>
        </>}
      />

      <div className="scroll-thin -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <button onClick={() => set({ status: [] })} className={cx('inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition', !f.status.length ? 'bg-ink text-white ring-ink' : 'bg-white text-gray-700 ring-line hover:ring-gray-300')}>
          Everyone <span className={cx('rounded-md px-1.5 text-xs tabular-nums', !f.status.length ? 'bg-white/20' : 'bg-gray-100 text-gray-600')}>{everyone.toLocaleString()}</span>
        </button>
        {QUICK.filter((s) => ['new', 'sent', 'replied', 'interested'].includes(s) || count(s) > 0 || f.status.includes(s)).map((s) => {
          const st = STATUS[s];
          const on = f.status.length === 1 && f.status[0] === s;
          const n = count(s);
          return (
            <button key={s} onClick={() => set({ status: on ? [] : [s] })} className={cx('inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 ring-inset transition', on ? TONE[st.tone] : cx('bg-white ring-line hover:ring-gray-300', n ? 'text-gray-700' : 'text-gray-400'))}>
              <st.Icon className="size-4" strokeWidth={2.2} />{st.label}<span className={cx('rounded-md px-1.5 text-xs tabular-nums', on ? 'bg-white/70' : 'bg-gray-100 text-gray-600')}>{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gray-400" />
            <Input value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search by business, email or city" className="border-transparent bg-canvas pl-10 focus:bg-white" />
          </div>
          <Button icon={<FilterIcon className="size-4" />} onClick={() => setShowFilters(true)}>
            Filters{extraCount ? <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-brand-600 text-[11px] text-white">{extraCount}</span> : null}
          </Button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-soft px-4 py-2.5">
            <span className="mr-1 text-xs font-semibold text-muted">Showing only:</span>
            {chips.map((c) => (
              <span key={c.label} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 capitalize ring-1 ring-line">
                {c.label}<button onClick={c.clear} aria-label={`Remove ${c.label}`} className="rounded text-gray-400 hover:text-ink"><X className="size-3.5" /></button>
              </span>
            ))}
            <button onClick={() => set({ ...EMPTY, q: f.q, status: f.status.length === 1 ? f.status : [] })} className="ml-1 text-xs font-semibold text-brand-600 hover:underline">Clear all</button>
          </div>
        )}

        {leads.loading && !leads.data ? (
          <div className="grid h-64 place-items-center"><Spinner /></div>
        ) : rows.length === 0 ? (
          <Empty icon={<Users className="size-5" />} title="No one here yet" sub={extraCount || f.q || f.status.length ? 'Nobody matches these filters. Try removing one.' : 'Import a CSV, paste emails, or let Claude add leads through MCP.'} action={extraCount || f.q || f.status.length ? <Button onClick={() => set(EMPTY)}>Clear filters</Button> : <Button variant="primary" onClick={() => setBulk(true)}>Add leads</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="text-left text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                <tr className="border-b border-line">
                  <th className="w-12 py-3 pl-5"><Checkbox label="Select all" checked={allOnPage} indeterminate={sel.size > 0} onChange={(v) => setSel(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
                  <th className="px-3 py-3">Business</th>
                  <th className="px-3 py-3">Where</th>
                  <th className="px-3 py-3">Campaign</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="py-3 pr-5 text-right">Contact</th>
                </tr>
              </thead>
              <tbody className={cx(leads.loading && 'opacity-60')}>
                {rows.map((l) => {
                  const picked = sel.has(l.id);
                  return (
                    <tr key={l.id} onClick={() => setOpen(l.id)} className={cx('group cursor-pointer border-b border-line/70 transition last:border-0', picked ? 'bg-brand-50/60' : 'hover:bg-soft')}>
                      <td className="py-3.5 pl-5"><Checkbox label={`Select ${l.business_name}`} checked={picked} onChange={(v) => { const n = new Set(sel); if (v) n.add(l.id); else n.delete(l.id); setSel(n); }} /></td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={l.business_name || l.email} />
                          <div className="min-w-0">
                            <div className="max-w-[260px] truncate font-semibold text-ink">{l.business_name || l.email.split('@')[0]}</div>
                            <div className="max-w-[260px] truncate text-[13px] text-muted">{l.contact_name ? `${l.contact_name} · ` : ''}{l.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap text-gray-700">{l.city || l.state ? <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 text-gray-400" />{[l.city, l.state].filter(Boolean).join(', ')}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3.5">{l.campaign_name ? <span className="inline-block max-w-[170px] truncate rounded-lg bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800">{l.campaign_name}</span> : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3.5 text-gray-700 capitalize">{l.category || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-3.5"><StatusChip status={l.status} /></td>
                      <td className="py-3.5 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          <span title={l.email} className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-600"><Mail className="size-3.5" /></span>
                          <span title={l.phone || 'No phone'} className={cx('grid size-7 place-items-center rounded-lg', l.phone ? 'bg-emerald-50 text-emerald-600' : 'text-gray-300')}><Phone className="size-3.5" /></span>
                          <span title={l.website || l.source_url || 'No link'} className={cx('grid size-7 place-items-center rounded-lg', l.website || l.source_url ? 'bg-violet-50 text-violet-600' : 'text-gray-300')}><Globe className="size-3.5" /></span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {leads.data && leads.data.total > 0 && <Pagination offset={offset} limit={limit} total={leads.data.total} onChange={(o) => { setOffset(o); setSel(new Set()); }} onLimit={(l) => { setLimit(l); setOffset(0); }} />}
      </Card>

      {/* Bulk actions only appear when something is selected, at the bottom where they're easy to find */}
      {sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4 lg:pl-[256px]">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ink py-2 pr-2 pl-4 text-white shadow-[0_10px_30px_rgba(29,32,51,.3)]">
            <span className="mr-2 text-sm font-semibold">{sel.size} selected</span>
            <button onClick={() => setListModal(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"><ListPlus className="size-4" />Add to list</button>
            <button onClick={() => setStatusModal(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20"><Tag className="size-4" />Set status</button>
            <button onClick={async () => {
              const emails = rows.filter((r) => sel.has(r.id)).map((r) => r.email);
              if (!confirm(`Never email these ${emails.length} addresses?`)) return;
              await api('/suppression', { body: { emails, reason: 'manual' } });
              toast(`${emails.length} added to the never-email list.`); setSel(new Set()); leads.reload(); facets.reload();
            }} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-red-500/80"><Ban className="size-4" />Never email</button>
            <button onClick={() => setSel(new Set())} aria-label="Clear selection" className="grid size-9 place-items-center rounded-xl hover:bg-white/10"><X className="size-4" /></button>
          </div>
        </div>
      )}

      <Drawer open={showFilters} onClose={() => setShowFilters(false)} width="max-w-sm">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-6 py-4">
          <div><p className="text-lg font-extrabold">Filters</p><p className="text-xs text-muted">{leads.data ? `${leads.data.total.toLocaleString()} leads match` : ''}</p></div>
          <div className="flex items-center gap-2">
            {extraCount > 0 && <button onClick={() => set({ ...EMPTY, q: f.q, status: f.status })} className="text-xs font-semibold text-brand-600">Clear</button>}
            <Button size="sm" variant="primary" onClick={() => setShowFilters(false)}>Done</Button>
          </div>
        </div>
        {filterPanel}
      </Drawer>

      <LeadDrawer id={open} onClose={() => setOpen(null)} onChanged={() => { leads.reload(); facets.reload(); }} />
      <BulkModal open={bulk} onClose={() => setBulk(false)} onDone={() => { leads.reload(); facets.reload(); }} />
      <AddToListModal open={listModal} onClose={() => setListModal(false)} ids={[...sel]} lists={lists.data || []} onDone={() => { setSel(new Set()); lists.reload(); }} />
      <Modal open={statusModal} onClose={() => setStatusModal(false)} title={`Set status for ${sel.size} leads`} sub="Replied, interested, won, lost, unsubscribed and bounced stop their unsent emails.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATUSES.map((s) => {
            const st = STATUS[s];
            return <button key={s} onClick={() => { setStatusModal(false); bulkUpdate({ status: s }, `${sel.size} leads set to ${st.label}.`); }} className={cx('inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-inset transition hover:brightness-95', TONE[st.tone])}><st.Icon className="size-4" />{st.label}</button>;
          })}
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
