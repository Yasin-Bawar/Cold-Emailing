import { useState } from 'react';
import { api } from '../api.ts';
import { Button, Input } from '../ui.tsx';

export const Login = ({ onDone }: { onDone: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('/login', { body: { password } }); onDone(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-full place-items-center bg-canvas px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-white p-8 shadow-sm">
        <span className="mb-6 grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
          <svg viewBox="0 0 32 32" className="size-6"><path d="M8 22V10l8 7 8-7v12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <h1 className="text-xl font-semibold">Sign in to Mavan Outreach</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Use the ADMIN_PASSWORD set on your server.</p>
        <label className="mb-1.5 block text-[13px] font-medium text-gray-700" htmlFor="pw">Password</label>
        <Input id="pw" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <Button type="submit" variant="primary" className="mt-5 w-full" loading={busy} disabled={!password}>Sign in</Button>
      </form>
    </div>
  );
};
