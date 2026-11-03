// Tiny fetch wrapper for the platform API. The session is an HttpOnly cookie set by /api/login.
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export const api = async <T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && path !== '/login') onUnauthorized();
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, (data as any)?.error || `Request failed (${res.status})`);
  return data as T;
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export type Lead = {
  id: string; email: string; business_name: string; contact_name: string | null; category: string | null; city: string | null;
  state: string | null; timezone: string | null; phone: string | null; website: string | null; source_url: string | null; score: number | null;
  status: string; notes: string | null; campaign_id: string | null; campaign_name?: string | null; last_reply: string | null;
  last_reply_at: string | null; created_at: string; sent_count?: number; first_email_status?: string | null;
};

export type Campaign = {
  id: string; name: string; notes: string | null; status: string; created_at: string; leads: number; emails: number; drafts: number;
  queued: number; sent: number; failed: number; replied: number; bounced: number; unsubscribed: number; last_sent_at: string | null;
};

export type EmailRow = {
  id: string; lead_id: string; campaign_id: string | null; step: number; delay_days: number; subject: string; status: string;
  send_after: string | null; sent_at: string | null; error: string | null; image_path: string | null; created_at: string;
  lead_email: string; business_name: string; city: string | null; state: string | null; timezone: string | null; lead_status: string; account_email: string | null;
};

export const fmtDate = (d?: string | null, withTime = false) => {
  if (!d) return '—';
  const x = new Date(d);
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
};

export const timeAgo = (d?: string | null) => {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
};
