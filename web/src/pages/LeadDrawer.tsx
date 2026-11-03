import { useEffect, useState } from 'react';
import { X, Mail, Phone, Globe, MapPin, ExternalLink, MessageSquareReply, Clock } from 'lucide-react';
import { api, fmtDate, timeAgo } from '../api.ts';
import { Avatar, Button, Drawer, Select, Spinner, StatusChip, Textarea, useLoad, useToast } from '../ui.tsx';

const STATUSES = ['new', 'queued', 'sent', 'replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced'];
const EVENT_LABEL: Record<string, string> = {
  sent: 'Email sent', replied: 'Replied', bounced: 'Bounced', unsubscribed: 'Unsubscribed', suppressed: 'Excluded', auto_reply: 'Auto-reply received',
  email_added: 'Email drafted', email_replaced: 'Email redrafted', email_edited: 'Email edited', lead_updated: 'Lead updated', send_failed: 'Send failed',
};

export const LeadDrawer = ({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) => {
  const toast = useToast();
  const lead = useLoad(() => (id ? api<any>(`/leads/${id}`) : Promise.resolve(null)), [id]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setNotes(lead.data?.notes || ''); }, [lead.data]);
  const l = lead.data;

  const patch = async (body: Record<string, unknown>, msg: string) => {
    setSaving(true);
    try {
      lead.setData(await api(`/leads/${id}`, { method: 'PATCH', body }));
      toast(msg);
      onChanged?.();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setSaving(false); }
  };

  return (
    <Drawer open={!!id} onClose={onClose}>
      {!l ? (
        <div className="grid h-full place-items-center"><Spinner /></div>
      ) : (
        <div>
          <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-line bg-white px-6 py-5">
            <Avatar name={l.business_name || l.email} className="size-11 text-sm" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{l.business_name || l.email}</h2>
              <p className="truncate text-sm text-muted">{[l.category, l.campaign_name].filter(Boolean).join(' · ') || 'Lead'}</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-gray-100" aria-label="Close"><X className="size-5" /></button>
          </div>

          <div className="space-y-6 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={l.status} />
              <Select value={l.status} disabled={saving} onChange={(e) => patch({ status: e.target.value }, `Status set to ${e.target.value}.`)} className="h-8 text-[13px]" aria-label="Status">
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              {l.lists?.map((x: any) => <span key={x.id} className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">{x.name}</span>)}
            </div>

            <div className="grid gap-2.5 text-sm">
              <a href={`mailto:${l.email}`} className="flex items-center gap-2.5 text-gray-700 hover:text-brand-600"><Mail className="size-4 text-muted" />{l.email}</a>
              {l.phone && <a href={`tel:${l.phone}`} className="flex items-center gap-2.5 text-gray-700"><Phone className="size-4 text-muted" />{l.phone}</a>}
              {(l.city || l.state) && <span className="flex items-center gap-2.5 text-gray-700"><MapPin className="size-4 text-muted" />{[l.address, l.city, l.state].filter(Boolean).join(', ')} <span className="text-xs text-muted">({l.timezone})</span></span>}
              {l.website && <a href={l.website} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-gray-700 hover:text-brand-600"><Globe className="size-4 text-muted" />{l.website}</a>}
              {l.source_url && <a href={l.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-gray-700 hover:text-brand-600"><ExternalLink className="size-4 text-muted" />Where the email was found</a>}
            </div>

            {l.last_reply && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-800"><MessageSquareReply className="size-3.5" />Reply · {timeAgo(l.last_reply_at)}</p>
                <p className="text-sm whitespace-pre-wrap text-gray-800">{l.last_reply}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => patch({ status: 'interested' }, 'Marked interested.')}>Interested</Button>
                  <Button size="sm" onClick={() => patch({ status: 'won' }, 'Marked won.')}>Won</Button>
                  <Button size="sm" onClick={() => patch({ status: 'lost' }, 'Marked lost.')}>Lost</Button>
                  <a className="ml-auto inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-[13px] font-medium text-white" href={`mailto:${l.email}?subject=${encodeURIComponent('Re: ' + (l.emails?.[0]?.subject || ''))}`}>Reply</a>
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Emails</p>
              {l.emails?.length ? (
                <div className="divide-y divide-line rounded-xl border border-line">
                  {l.emails.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">{e.step === 0 ? '1st' : `F${e.step}`}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{e.subject}</p>
                        <p className="text-xs text-muted">{e.sent_at ? `Sent ${fmtDate(e.sent_at, true)}${e.account_email ? ` from ${e.account_email}` : ''}` : e.step ? `${e.delay_days} days after the previous email` : 'Not sent yet'}{e.error ? ` · ${e.error}` : ''}</p>
                      </div>
                      <StatusChip status={e.status} />
                      <a href={`/api/emails/${e.id}/preview`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-600 hover:underline">View</a>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted">No email written yet. Ask Claude to write one with add_email.</p>}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Notes</p>
              <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Call notes, what they want, next step…" />
              <div className="mt-2 flex justify-end"><Button size="sm" variant="primary" disabled={notes === (l.notes || '')} loading={saving} onClick={() => patch({ notes }, 'Notes saved.')}>Save notes</Button></div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold">Activity</p>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {l.events?.map((ev: any) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-white bg-brand-500 ring-1 ring-brand-200" />
                    <p className="text-sm font-medium">{EVENT_LABEL[ev.type] || ev.type.replace(/_/g, ' ')}</p>
                    <p className="flex items-center gap-1 text-xs text-muted"><Clock className="size-3" />{fmtDate(ev.created_at, true)}{ev.detail?.subject ? ` · ${ev.detail.subject}` : ''}{ev.detail?.error ? ` · ${ev.detail.error}` : ''}</p>
                  </li>
                ))}
                <li className="relative"><span className="absolute top-1 -left-[25px] size-2.5 rounded-full border-2 border-white bg-gray-300" /><p className="text-sm">Lead added</p><p className="text-xs text-muted">{fmtDate(l.created_at, true)}</p></li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
};
