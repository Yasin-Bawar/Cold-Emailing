import { useRef, useState } from 'react';
import { UploadCloud, FileText, ClipboardList, ListChecks } from 'lucide-react';
import { api, type Campaign } from '../api.ts';
import { Button, Modal, Select, Textarea, cx, useLoad, useToast } from '../ui.tsx';

// "Include/exclude in bulk": paste emails or upload a CSV, then add them as leads or put them on the never-email list.
export const BulkModal = ({ open, onClose, onDone, defaultCampaign }: { open: boolean; onClose: () => void; onDone?: () => void; defaultCampaign?: string }) => {
  const toast = useToast();
  const [tab, setTab] = useState<'paste' | 'csv' | 'list'>('paste');
  const [text, setText] = useState('');
  const [csv, setCsv] = useState<{ name: string; body: string } | null>(null);
  const [campaign, setCampaign] = useState(defaultCampaign || '');
  const [list, setList] = useState('');
  const [busy, setBusy] = useState<'' | 'include' | 'exclude'>('');
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const campaigns = useLoad(() => (open ? api<Campaign[]>('/campaigns') : Promise.resolve([])), [open]);
  const lists = useLoad(() => (open ? api<{ id: string; name: string; leads: number }[]>('/lists') : Promise.resolve([])), [open]);
  const lines = text.split(/\n/).filter((l) => l.trim()).length;

  const readFile = async (f?: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast('CSV is over 10 MB.', 'error');
    setCsv({ name: f.name, body: await f.text() });
  };

  const run = async (action: 'include' | 'exclude') => {
    setBusy(action);
    try {
      const body: Record<string, unknown> = { action, campaign_id: campaign || undefined, list_id: list || undefined };
      if (tab === 'paste') body.text = text;
      if (tab === 'csv') body.csv = csv?.body;
      if (tab === 'list') {
        if (!list) throw new Error('Choose a list.');
        if (action === 'exclude') {
          const r = await api<{ rows: { email: string }[] }>(`/leads?list_id=${list}&limit=500`);
          body.text = r.rows.map((x) => x.email).join('\n');
        } else throw new Error('Leads in a list are already in the platform. Use People to add them to a campaign.');
      }
      const r = await api<any>('/leads/bulk', { body });
      if (action === 'exclude') toast(`${r.excluded} addresses added to the never-email list.`);
      else toast(`${r.created.length} new leads added, ${r.existing.length} already existed, ${r.skipped.length + (r.invalid_rows || 0)} skipped.`);
      setText(''); setCsv(null);
      onDone?.();
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const empty = tab === 'paste' ? !text.trim() : tab === 'csv' ? !csv : !list;
  const tabs = [
    { id: 'paste' as const, label: 'Paste a list', icon: <ClipboardList className="size-4" /> },
    { id: 'csv' as const, label: 'Upload CSV', icon: <UploadCloud className="size-4" /> },
    { id: 'list' as const, label: 'Choose a list', icon: <ListChecks className="size-4" /> },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Include/exclude leads in bulk"
      sub="Add businesses as leads, or exclude addresses so they are never emailed."
      footer={
        <>
          <Button variant="danger" loading={busy === 'exclude'} disabled={empty || !!busy} onClick={() => run('exclude')}>Exclude these leads</Button>
          <Button variant="primary" loading={busy === 'include'} disabled={empty || !!busy || tab === 'list'} onClick={() => run('include')}>Include these leads</Button>
        </>
      }
    >
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition', tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            {t.icon}<span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'paste' && (
        <div>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value.slice(0, 400_000))} placeholder={'owner@tacoshop.com\nhello@freshcuts.com\n…one email per line'} className="font-mono text-[13px]" />
          <p className={cx('mt-1.5 text-right text-xs', lines > 5000 ? 'text-red-600' : 'text-muted')}>{lines}/5000</p>
        </div>
      )}

      {tab === 'csv' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
          onClick={() => file.current?.click()}
          className={cx('flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition', drag ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-gray-50')}
        >
          <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          {csv ? (
            <>
              <FileText className="mb-2 size-8 text-brand-600" />
              <p className="font-medium">{csv.name}</p>
              <p className="text-sm text-muted">{csv.body.split('\n').length - 1} rows · click to choose another</p>
            </>
          ) : (
            <>
              <div className="mb-3 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600"><UploadCloud className="size-5" /></div>
              <p className="text-sm"><span className="font-semibold text-brand-600">Click to upload</span> or drag and drop</p>
              <p className="mt-1 text-xs text-muted">CSV with a header row: email, company, city, state, category, website, source…</p>
            </>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div>
          <Select value={list} onChange={(e) => setList(e.target.value)} className="w-full">
            <option value="">Choose a list…</option>
            {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.leads})</option>)}
          </Select>
          <p className="mt-2 text-xs text-muted">Excluding a list puts every address in it on the never-email list.</p>
        </div>
      )}

      {tab !== 'list' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-gray-700">Add to campaign <span className="font-normal text-muted">(include only)</span></p>
            <Select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="w-full">
              <option value="">No campaign</option>
              {campaigns.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-gray-700">Add to list <span className="font-normal text-muted">(include only)</span></p>
            <Select value={list} onChange={(e) => setList(e.target.value)} className="w-full">
              <option value="">No list</option>
              {lists.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>
        </div>
      )}
    </Modal>
  );
};
