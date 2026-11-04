import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Mail, Plus, Trash2, Pause, Play, PlugZap, CheckCircle2, XCircle, KeyRound, Copy, Terminal, ShieldCheck, Sparkles, Info } from 'lucide-react';
import { api, fmtDate, timeAgo } from '../api.ts';
import { Button, Card, CardHeader, Empty, Input, Label, Modal, PageHeader, Spinner, StatusChip, Textarea, cx, useLoad, useToast } from '../ui.tsx';
import { copy } from './util.ts';

// ---------- Sending accounts ----------
const ProviderBadge = ({ p }: { p: string }) => (
  <span className={cx('grid size-10 place-items-center rounded-xl text-sm font-bold', p === 'resend' ? 'bg-gray-900 text-white' : 'bg-red-50 text-red-600')}>{p === 'resend' ? 'R' : 'G'}</span>
);

export const Accounts = () => {
  const toast = useToast();
  const accounts = useLoad(() => api<any[]>('/accounts'), []);
  const meta = useLoad(() => api<{ google: boolean; google_redirect_uri: string }>('/meta'), []);
  const [params, setParams] = useSearchParams();
  const [add, setAdd] = useState<'gmail' | 'resend' | null>(null);
  const [googleHelp, setGoogleHelp] = useState(false);
  useEffect(() => {
    const ok = params.get('connected');
    const err = params.get('error');
    if (ok) toast(`${ok} connected. You can test it below.`);
    if (err) toast(err, 'error');
    if (ok || err) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const connectGoogle = () => { if (meta.data?.google) window.location.href = '/oauth/google/start'; else setGoogleHelp(true); };
  const [form, setForm] = useState({ email: '', from_name: '', secret: '', daily_cap: 40 });
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState<Record<string, { ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }>>({});

  const save = async () => {
    setBusy('add');
    try {
      const a = await api<any>('/accounts', { body: { provider: add, ...form, from_name: form.from_name || null } });
      toast('Account connected. Testing it now…');
      setAdd(null); setForm({ email: '', from_name: '', secret: '', daily_cap: 40 });
      accounts.reload();
      test(a.id);
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };
  const test = async (id: string) => {
    setBusy(`test-${id}`);
    try { const r = await api<any>(`/accounts/${id}/test`, { body: {} }); setTests((t) => ({ ...t, [id]: r })); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(''); }
  };

  return (
    <div>
      <PageHeader title="Sending accounts" sub="Inboxes the worker sends from. New inboxes warm up: 10 a day in week 1, 20 in week 2, 30 in week 3, then their daily limit."
        right={<><Button icon={<Plus className="size-4" />} onClick={() => setAdd('resend')}>Add Resend</Button><Button icon={<Plus className="size-4" />} onClick={() => setAdd('gmail')}>Gmail with App Password</Button><Button variant="primary" icon={<Plus className="size-4" />} onClick={connectGoogle}>Connect Gmail</Button></>} />
      {!accounts.data ? <Spinner /> : accounts.data.length === 0 ? (
        <Card><Empty icon={<Mail className="size-5" />} title="No sending accounts yet" sub="Connect a Gmail inbox by signing in with Google. Replies to it are read automatically." action={<Button variant="primary" onClick={connectGoogle}>Connect Gmail</Button>} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.data.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start gap-3">
                <ProviderBadge p={a.provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{a.email}</p><StatusChip status={a.status} /></div>
                  <p className="text-sm text-muted">{a.provider === 'gmail_api' ? 'Gmail · Google sign-in' : a.provider === 'gmail' ? 'Gmail · App Password (SMTP + IMAP)' : 'Resend API'} · {a.from_name || 'default name'} · since {fmtDate(a.created_at)}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-sm"><span className="text-muted">Sent today</span><span className="font-medium tabular-nums">{a.sent_today} / {a.cap_today}</span></div>
                <div className="h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.min(100, (a.sent_today / Math.max(1, a.cap_today)) * 100)}%` }} /></div>
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>{a.sent_total} sent in total · limit {a.daily_cap}/day</span>
                  <span>{a.provider !== 'resend' ? `Inbox checked ${timeAgo(a.imap_checked_at)}` : ''}</span>
                </div>
              </div>
              {a.last_error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{a.last_error}</p>}
              {tests[a.id] && (
                <div className="mt-3 space-y-1.5 rounded-lg bg-gray-50 p-3">
                  {tests[a.id].checks.map((c) => (
                    <p key={c.name} className="flex items-start gap-2 text-xs">{c.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <XCircle className="size-4 shrink-0 text-red-600" />}<span><b>{c.name}:</b> {c.detail}</span></p>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" icon={<PlugZap className="size-4" />} loading={busy === `test-${a.id}`} onClick={() => test(a.id)}>Test connection</Button>
                {a.status === 'active'
                  ? <Button size="sm" icon={<Pause className="size-4" />} onClick={async () => { await api(`/accounts/${a.id}`, { method: 'PATCH', body: { status: 'paused' } }); accounts.reload(); }}>Pause</Button>
                  : <Button size="sm" icon={<Play className="size-4" />} onClick={async () => { await api(`/accounts/${a.id}`, { method: 'PATCH', body: { status: 'active' } }); accounts.reload(); }}>Resume</Button>}
                <Button size="sm" onClick={async () => { const v = prompt('Daily limit after warm-up (Gmail: keep it at 40 or below)', String(a.daily_cap)); if (v && Number(v) > 0) { await api(`/accounts/${a.id}`, { method: 'PATCH', body: { daily_cap: Number(v) } }); accounts.reload(); } }}>Daily limit</Button>
                {a.provider === 'gmail_api' && a.status === 'error' && <Button size="sm" onClick={connectGoogle}>Reconnect</Button>}
                <Button size="sm" variant="danger" className="ml-auto" icon={<Trash2 className="size-4" />} onClick={async () => { if (confirm(`Remove ${a.email}?`)) { await api(`/accounts/${a.id}`, { method: 'DELETE' }); accounts.reload(); } }}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={googleHelp} onClose={() => setGoogleHelp(false)} title="Turn on Connect Gmail" wide sub="One-time setup in Google Cloud (free). Then every inbox connects with one click.">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>Open <a className="font-medium text-brand-600 underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud</a> and create a project (e.g. "Mavan Outreach").</li>
          <li>Enable the <a className="font-medium text-brand-600 underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a>.</li>
          <li>Google Auth Platform → Branding/Audience: user type <b>External</b>, then <b>Publish app</b> (so the connection doesn't expire after 7 days).</li>
          <li>Clients → Create client → <b>Web application</b>. Authorized redirect URI:<code className="mt-1 block rounded-md bg-gray-100 px-2 py-1 text-xs break-all">{meta.data?.google_redirect_uri || '…/oauth/google/callback'}</code></li>
          <li>Put the Client ID and Client secret into Railway as <code className="rounded bg-gray-100 px-1">GOOGLE_CLIENT_ID</code> and <code className="rounded bg-gray-100 px-1">GOOGLE_CLIENT_SECRET</code> (on both services), then press Connect Gmail again.</li>
        </ol>
        <p className="mt-4 text-xs text-muted">Google will show "Google hasn't verified this app". That's expected for your own app: choose Advanced → Go to Mavan Outreach.</p>
      </Modal>

      <Modal open={!!add} onClose={() => setAdd(null)} title={add === 'gmail' ? 'Connect a Gmail inbox' : 'Connect Resend'} wide
        footer={<><Button onClick={() => setAdd(null)}>Cancel</Button><Button variant="primary" loading={busy === 'add'} disabled={!form.email || form.secret.length < 8} onClick={save}>Connect</Button></>}>
        {add === 'gmail' ? (
          <div className="mb-5 rounded-xl bg-brand-50/60 p-4 text-sm text-gray-700">
            <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">App Passwords send over SMTP, which Railway blocks on its Trial and Hobby plans. On Railway, use <b>Connect Gmail</b> instead.</p>
            <p className="mb-2 font-semibold text-ink">Get an App Password (2 minutes)</p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Turn on 2-Step Verification in the Google Account for this inbox.</li>
              <li>Open <a className="font-medium text-brand-600 underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords</a>, name it "Mavan Outreach" and create it.</li>
              <li>Paste the 16-letter password below. It is stored encrypted and only used to send and to read replies.</li>
            </ol>
          </div>
        ) : (
          <div className="mb-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
            <p className="mb-1 font-semibold text-ink">Resend</p>
            <p>The From address must be on a domain verified in Resend. Replies go to your first Gmail inbox (or the reply-to in Settings) so they're tracked. Resend's free plan allows 100 emails a day, and its terms don't allow purchased or scraped lists.</p>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>{add === 'gmail' ? 'Gmail address' : 'From address'}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={add === 'gmail' ? 'you@gmail.com' : 'hello@yourdomain.com'} /></div>
          <div><Label hint="(optional)">From name</Label><Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} placeholder="Amin from Mavan" /></div>
          <div><Label>{add === 'gmail' ? 'App Password' : 'API key'}</Label><Input type="password" autoComplete="off" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={add === 'gmail' ? 'xxxx xxxx xxxx xxxx' : 're_…'} /></div>
          <div><Label hint="after warm-up">Daily limit</Label><Input type="number" min={1} max={500} value={form.daily_cap} onChange={(e) => setForm({ ...form, daily_cap: Number(e.target.value) })} /></div>
        </div>
      </Modal>
    </div>
  );
};

// ---------- Settings ----------
export const SettingsPage = () => {
  const toast = useToast();
  const s = useLoad(() => api<any>('/settings'), []);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s.data) setForm(s.data); }, [s.data]);
  if (!form) return <Spinner />;
  const save = async (patch?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const body = patch || { postal_address: form.postal_address, from_name: form.from_name, reply_to: form.reply_to || '', default_daily_cap: Number(form.default_daily_cap) };
      s.setData(await api('/settings', { method: 'PATCH', body }));
      toast('Settings saved.');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />
      <Card className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="font-semibold">Sending</p>
            <p className="text-sm text-muted">{form.paused ? 'Paused: the worker sends nothing until you resume.' : 'Running: approved emails go out within limits and business hours.'}</p>
          </div>
          {form.paused
            ? <Button variant="primary" icon={<Play className="size-4" />} loading={busy} onClick={() => save({ paused: false })}>Resume sending</Button>
            : <Button variant="danger" icon={<Pause className="size-4" />} loading={busy} onClick={() => save({ paused: true })}>Pause all sending</Button>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Sender details" sub="Used in every email." />
        <div className="space-y-4 px-5 pb-5">
          <div>
            <Label hint="(required by CAN-SPAM, shown in every footer)">Postal address</Label>
            <Textarea rows={2} value={form.postal_address} onChange={(e) => setForm({ ...form, postal_address: e.target.value })} placeholder="Street, suite, city, province, postal code" />
            {!form.postal_address.trim() && <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700"><Info className="size-3.5" />Nothing is sent until this is filled in.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Default from name</Label><Input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} /></div>
            <div><Label hint="(optional)">Reply-to address</Label><Input type="email" value={form.reply_to || ''} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} placeholder="Defaults to the sending Gmail" /></div>
          </div>
          <div className="flex justify-end"><Button variant="primary" loading={busy} onClick={() => save()}>Save changes</Button></div>
        </div>
      </Card>
    </div>
  );
};

// ---------- API & MCP ----------
export const McpPage = () => {
  const toast = useToast();
  const tokens = useLoad(() => api<any[]>('/tokens'), []);
  const [name, setName] = useState('Claude Code');
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = window.location.origin;
  const cmd = `claude mcp add --scope user --transport http mavan ${origin}/mcp --header "Authorization: Bearer ${fresh || 'YOUR_TOKEN'}"`;
  const create = async () => {
    try { const t = await api<any>('/tokens', { body: { name } }); setFresh(t.token); tokens.reload(); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const Copyable = ({ text, mono = true }: { text: string; mono?: boolean }) => (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-gray-950 p-3">
      <code className={cx('flex-1 text-[12.5px] break-all text-gray-100', mono && 'font-mono')}>{text}</code>
      <button aria-label="Copy" onClick={async () => toast((await copy(text)) ? 'Copied.' : 'Copy failed. Select the text instead.', 'ok')} className="rounded-md p-1 text-gray-400 hover:bg-white/10 hover:text-white"><Copy className="size-4" /></button>
    </div>
  );
  return (
    <div className="max-w-4xl">
      <PageHeader title="API & MCP" sub="Connect Claude so it can create campaigns, add leads, write a custom email for each one, and read replies." />
      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><Sparkles className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">1. Create a token</p>
              <p className="text-sm text-muted">It's shown once. Paste it only into your own Claude config, never into a chat.</p>
              <div className="mt-3 flex flex-wrap gap-2"><Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" /><Button variant="primary" icon={<KeyRound className="size-4" />} disabled={!name.trim()} onClick={create}>Create token</Button></div>
              {fresh && <div className="mt-3"><p className="mb-1.5 text-xs font-medium text-amber-700">Copy it now. It won't be shown again.</p><Copyable text={fresh} /></div>}
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gray-900 text-white"><Terminal className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">2. Add it to Claude Code</p>
              <p className="mb-3 text-sm text-muted">Run this in your terminal (on your computer):</p>
              <Copyable text={cmd} />
              <p className="mt-4 mb-2 text-sm font-medium">3. Then ask Claude, for example:</p>
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">“Create a campaign called <i>Phoenix barbers</i>, add these 20 leads, and write each one a unique HTML email with a website concept image. Keep them as drafts so I can review.”</div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Tokens" sub="Revoke a token to cut off that client immediately." />
          {!tokens.data ? <Spinner className="m-5" /> : tokens.data.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">No tokens yet.</p> : (
            <div className="divide-y divide-line border-t border-line">
              {tokens.data.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <ShieldCheck className={cx('size-4', t.revoked_at ? 'text-gray-300' : 'text-emerald-600')} />
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted">created {fmtDate(t.created_at)} · {t.last_used_at ? `used ${timeAgo(t.last_used_at)}` : 'never used'}</span>
                  {t.revoked_at ? <StatusChip status="cancelled" label="revoked" /> : <Button size="sm" variant="danger" className="ml-auto" onClick={async () => { if (confirm(`Revoke "${t.name}"?`)) { await api(`/tokens/${t.id}`, { method: 'DELETE' }); tokens.reload(); } }}>Revoke</Button>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <p className="mb-2 font-semibold">What Claude can do</p>
          <div className="grid gap-x-6 gap-y-1.5 text-sm text-gray-700 sm:grid-cols-2">
            {[
              ['create_campaign / list_campaigns', 'make and list campaigns'],
              ['add_leads', 'up to 1000 at a time, duplicates skipped'],
              ['generate_emails', 'fill the 140 designs for a whole campaign'],
              ['add_email / add_followup', 'custom HTML + image, saved as drafts'],
              ['approve_emails', 'queue drafts (asks you above 100)'],
              ['list_leads / get_lead / update_lead', 'find and update leads'],
              ['list_replies / stats / queue_status', 'see results'],
              ['pause_sending / resume_sending', 'stop everything at once'],
              ['suppress_email', 'never email an address'],
            ].map(([t, d]) => <p key={t}><code className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">{t}</code> <span className="text-muted">{d}</span></p>)}
          </div>
        </Card>
      </div>
    </div>
  );
};
