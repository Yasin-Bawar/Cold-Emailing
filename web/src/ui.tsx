import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X, CheckCircle2, AlertCircle, Circle, Clock, Send, MessageCircle, Star, Trophy, MinusCircle, BellOff, AlertTriangle, PencilLine, PauseCircle, PlayCircle } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode };
export const Button = ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...p }: BtnProps) => (
  <button
    {...p}
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
      size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-brand-600 text-white shadow-[0_1px_2px_rgba(73,67,193,.25)] hover:bg-brand-700',
      variant === 'secondary' && 'bg-white text-ink border border-line hover:border-gray-300 hover:bg-soft',
      variant === 'ghost' && 'text-muted hover:bg-brand-50 hover:text-brand-700',
      variant === 'danger' && 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
      className,
    )}
  >
    {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
    {children}
  </button>
);

export const Card = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cx('rounded-2xl border border-line bg-white shadow-[0_1px_3px_rgba(29,32,51,.04)]', className)}>{children}</div>
);

export const CardHeader = ({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
    <div className="min-w-0">
      <h3 className="text-[15px] font-bold text-ink">{title}</h3>
      {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
    </div>
    {right}
  </div>
);

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx('h-10 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100', className)} />
);

export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx('w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-gray-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100', className)} />
);

export const Select = ({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx('h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100', className)}>{children}</select>
);

export const Label = ({ children, hint }: { children: ReactNode; hint?: ReactNode }) => (
  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">
    {children}
    {hint && <span className="ml-1 font-normal text-muted">{hint}</span>}
  </label>
);

export const Checkbox = ({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label?: string }) => (
  <input
    type="checkbox"
    aria-label={label}
    ref={(el) => { if (el) el.indeterminate = !!indeterminate && !checked; }}
    checked={checked}
    onChange={(e) => onChange(e.target.checked)}
    onClick={(e) => e.stopPropagation()}
    className="size-4 cursor-pointer rounded border-gray-300 accent-brand-600"
  />
);

// One meaning per color, everywhere: grey = not started, blue = waiting, indigo = sent, green = good news,
// amber = needs a look, red = problem. Every status also has its own icon and word, so color is never the only cue.
type Tone = 'grey' | 'violet' | 'blue' | 'indigo' | 'green' | 'teal' | 'amber' | 'red';
export const TONE: Record<Tone, string> = {
  grey: 'bg-gray-100 text-gray-600 ring-gray-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};
const S = (tone: Tone, Icon: typeof Circle, label?: string) => ({ tone, Icon, label });
export const STATUS = {
  new: S('grey', Circle, 'New'),
  queued: S('blue', Clock, 'Queued'),
  sent: S('indigo', Send, 'Sent'),
  replied: S('green', MessageCircle, 'Replied'),
  interested: S('teal', Star, 'Interested'),
  won: S('green', Trophy, 'Won'),
  lost: S('grey', MinusCircle, 'Lost'),
  unsubscribed: S('amber', BellOff, 'Unsubscribed'),
  bounced: S('red', AlertTriangle, 'Bounced'),
  draft: S('violet', PencilLine, 'Draft'),
  approved: S('blue', Clock, 'Queued'),
  sending: S('indigo', Send, 'Sending'),
  failed: S('red', AlertTriangle, 'Failed'),
  cancelled: S('grey', MinusCircle, 'Cancelled'),
  skipped: S('grey', MinusCircle, 'Skipped'),
  active: S('green', PlayCircle, 'Active'),
  paused: S('amber', PauseCircle, 'Paused'),
  done: S('green', CheckCircle2, 'Done'),
  error: S('red', AlertTriangle, 'Error'),
  complete: S('green', CheckCircle2, 'Complete'),
} as Record<string, { tone: Tone; Icon: typeof Circle; label?: string }>;
export const StatusChip = ({ status, label }: { status: string; label?: string }) => {
  const st = STATUS[status] || { tone: 'grey' as Tone, Icon: Circle };
  return (
    <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', TONE[st.tone])}>
      <st.Icon className="size-3" strokeWidth={2.4} />
      {label || st.label || status}
    </span>
  );
};

export const Delta = ({ cur, prev }: { cur: number; prev: number }) => {
  if (!prev && !cur) return <span className="text-xs text-muted">—</span>;
  const pct = prev ? Math.round(((cur - prev) / prev) * 100) : 100;
  const up = pct >= 0;
  return <span className={cx('rounded-full px-1.5 py-0.5 text-[11px] font-semibold', up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>{up ? '+' : ''}{pct}%</span>;
};

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-muted', className)} />;

export const Empty = ({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: ReactNode; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
    <p className="text-[15px] font-bold text-ink">{title}</p>
    {sub && <p className="mt-1 max-w-sm text-sm text-muted">{sub}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Modal = ({ open, onClose, title, sub, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) => {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={cx('w-full rounded-2xl bg-white shadow-xl', wide ? 'max-w-2xl' : 'max-w-lg')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-gray-100" aria-label="Close"><X className="size-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
};

export const Drawer = ({ open, onClose, children, width = 'max-w-xl' }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) => {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/30" onMouseDown={onClose}>
      <aside className={cx('scroll-thin h-full w-full overflow-y-auto bg-white shadow-2xl', width)} onMouseDown={(e) => e.stopPropagation()}>{children}</aside>
    </div>
  );
};

export const Pagination = ({ offset, limit, total, onChange, onLimit }: { offset: number; limit: number; total: number; onChange: (o: number) => void; onLimit?: (l: number) => void }) => {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <div className="flex items-center gap-2">
        {onLimit && (
          <Select value={limit} onChange={(e) => onLimit(Number(e.target.value))} className="h-8 text-[13px]" aria-label="Rows per page">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </Select>
        )}
        <span>{total.toLocaleString()} total</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))} icon={<ChevronLeft className="size-4" />}>Previous</Button>
        <span className="px-1 text-ink">Page {page} of {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next <ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
};

// ---------- toasts ----------
type Toast = { id: number; kind: 'ok' | 'error'; text: string };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-lg">
            {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

// Data loading with reload.
export const useLoad = <T,>(fn: () => Promise<T>, deps: unknown[]) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => { if (live) { setData(d); setError(null); } }).catch((e) => live && setError(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
};

export const PageHeader = ({ title, sub, right, icon, tint }: { title: string; sub?: ReactNode; right?: ReactNode; icon?: ReactNode; tint?: string }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3.5">
      {icon && <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', tint || 'bg-white text-brand-600 ring-1 ring-line')}>{icon}</span>}
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
    </div>
    {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
  </div>
);

export const Avatar = ({ name, className }: { name: string; className?: string }) => {
  const initials = (name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const hues = ['bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-teal-100 text-teal-800', 'bg-indigo-100 text-indigo-800', 'bg-orange-100 text-orange-800'];
  const h = hues[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  return <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold', h, className)}>{initials}</span>;
};
