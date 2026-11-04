import { useState } from 'react';
import { LayoutTemplate, ExternalLink } from 'lucide-react';
import { api } from '../api.ts';
import { Card, PageHeader, Spinner, cx, useLoad } from '../ui.tsx';

type BType = { key: string; label: string; plural: string; keywords: string[]; photos: number };
type Design = { key: string; type: string; type_label: string; index: number; layout: string };

// Gallery of the 140 template designs (14 business types x 10 layouts), shown with sample details.
export const Designs = () => {
  const types = useLoad(() => api<BType[]>('/business-types'), []);
  const [type, setType] = useState('barbershop');
  const designs = useLoad(() => api<Design[]>(`/designs?type=${type}`), [type]);
  const current = types.data?.find((t) => t.key === type);
  return (
    <div>
      <PageHeader
        title="Designs"
        sub="10 designs for each business type. When emails are generated, only the words change: business name, city, a personal line, rating."
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {types.data?.map((t) => (
          <button key={t.key} onClick={() => setType(t.key)} className={cx('rounded-full border px-3 py-1.5 text-[13px] font-medium', type === t.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white text-gray-600 hover:bg-gray-50')}>{t.label}</button>
        ))}
      </div>
      {current && (
        <p className="mb-4 text-sm text-muted">
          Leads become <b className="text-ink">{current.label}</b> when their category mentions: {current.keywords.slice(0, 8).join(', ')}{current.keywords.length > 8 ? '…' : ''}
        </p>
      )}
      {!designs.data ? <div className="grid h-64 place-items-center"><Spinner /></div> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {designs.data.map((d) => (
            <Card key={d.key} className="overflow-hidden">
              <div className="relative h-[420px] overflow-hidden bg-gray-100">
                <iframe
                  title={d.key}
                  src={`/api/designs/${d.key}/preview`}
                  loading="lazy"
                  sandbox="allow-popups"
                  scrolling="no"
                  className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
                  style={{ width: 640, height: 1100, transform: 'scale(0.5)' }}
                />
              </div>
              <div className="flex items-center justify-between border-t border-line px-4 py-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold"><LayoutTemplate className="size-4 text-brand-600" />Design {d.index + 1}: {d.layout}</p>
                  <p className="text-xs text-muted">{d.key}</p>
                </div>
                <a href={`/api/designs/${d.key}/preview`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">Open <ExternalLink className="size-3.5" /></a>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
