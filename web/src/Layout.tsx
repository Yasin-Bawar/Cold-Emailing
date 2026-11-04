import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router';
import { Home, Users, Building2, ListChecks, Mail, Inbox, Activity, Ban, Settings, KeyRound, Search, Plus, Menu, X, Sparkles, LogOut, Upload, LayoutTemplate } from 'lucide-react';
import { api } from './api.ts';
import { cx, Button } from './ui.tsx';
import { BulkModal } from './pages/BulkModal.tsx';

// Each section has its own soft color, so the menu can be scanned by color as well as by word
type Item = { to: string; label: string; icon: ReactNode; tint: string; end?: boolean };
const NAV: { section?: string; items: Item[] }[] = [
  { items: [{ to: '/', label: 'Home', icon: <Home className="size-[18px]" />, tint: 'bg-indigo-100 text-indigo-700', end: true }] },
  { section: 'Leads', items: [
    { to: '/leads', label: 'People', icon: <Users className="size-[18px]" />, tint: 'bg-sky-100 text-sky-700' },
    { to: '/lists', label: 'Lists', icon: <ListChecks className="size-[18px]" />, tint: 'bg-violet-100 text-violet-700' },
    { to: '/replies', label: 'Replies', icon: <Inbox className="size-[18px]" />, tint: 'bg-emerald-100 text-emerald-700' },
  ] },
  { section: 'Outreach', items: [
    { to: '/campaigns', label: 'Campaigns', icon: <Building2 className="size-[18px]" />, tint: 'bg-orange-100 text-orange-700' },
    { to: '/designs', label: 'Designs', icon: <LayoutTemplate className="size-[18px]" />, tint: 'bg-pink-100 text-pink-700' },
    { to: '/activity', label: 'Activity', icon: <Activity className="size-[18px]" />, tint: 'bg-amber-100 text-amber-700' },
  ] },
  { section: 'Setup', items: [
    { to: '/accounts', label: 'Sending accounts', icon: <Mail className="size-[18px]" />, tint: 'bg-teal-100 text-teal-700' },
    { to: '/suppression', label: 'Suppression', icon: <Ban className="size-[18px]" />, tint: 'bg-rose-100 text-rose-700' },
    { to: '/settings', label: 'Settings', icon: <Settings className="size-[18px]" />, tint: 'bg-slate-100 text-slate-700' },
    { to: '/connect', label: 'API & MCP', icon: <KeyRound className="size-[18px]" />, tint: 'bg-purple-100 text-purple-700' },
  ] },
];

const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => (
  <div className="flex h-full flex-col">
    <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pt-5 pb-6">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white shadow-[0_2px_6px_rgba(73,67,193,.35)]">
        <svg viewBox="0 0 32 32" className="size-5"><path d="M8 22V10l8 7 8-7v12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">mavan<span className="text-brand-600">.</span>outreach</span>
    </Link>
    <nav className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3">
      {NAV.map((g, i) => (
        <div key={i}>
          {g.section && <p className="mb-2 px-3 text-[11px] font-bold tracking-wider text-gray-400 uppercase">{g.section}</p>}
          <div className="space-y-1">
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={onNavigate}
                className={({ isActive }) => cx('group flex items-center gap-3 rounded-xl px-2 py-1.5 text-[14px] font-semibold transition', isActive ? 'bg-white text-ink shadow-[0_1px_3px_rgba(29,32,51,.08)] ring-1 ring-line' : 'text-gray-600 hover:bg-white/70 hover:text-ink')}
              >
                {({ isActive }) => (
                  <>
                    <span className={cx('grid size-8 place-items-center rounded-lg transition', isActive ? it.tint : it.tint.split(' ')[1])}>{it.icon}</span>
                    {it.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
    <div className="p-3">
      <Link to="/connect" onClick={onNavigate} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/50">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600"><Sparkles className="size-4" /></span>
        <span className="min-w-0"><b className="block text-[13px] font-bold">Connect Claude</b><span className="block truncate text-xs text-muted">Write emails with MCP</span></span>
      </Link>
    </div>
  </div>
);

export const Layout = ({ onLogout }: { onLogout: () => void }) => {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [profile, setProfile] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <div className="flex h-full">
      <aside className="hidden w-[256px] shrink-0 border-r border-line bg-soft lg:block"><Sidebar /></aside>
      {menu && (
        <div className="fixed inset-0 z-40 bg-gray-900/30 lg:hidden" onClick={() => setMenu(false)}>
          <aside className="h-full w-[268px] bg-soft shadow-xl" onClick={(e) => e.stopPropagation()}><Sidebar onNavigate={() => setMenu(false)} /></aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white/80 px-4 backdrop-blur sm:px-8">
          <button className="rounded-lg p-2 text-muted hover:bg-gray-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Menu">{menu ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          <form className="relative max-w-md min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); nav(`/leads?q=${encodeURIComponent(q)}`); }}>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anything" className="h-10 w-full rounded-xl border border-transparent bg-canvas pr-14 pl-9 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100" />
            <kbd className="absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11px] font-medium text-muted sm:block">⌘F</kbd>
          </form>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:block"><Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setBulk(true)}>Import</Button></span>
            <Button variant="primary" aria-label="New campaign" icon={<Plus className="size-4" />} onClick={() => nav('/campaigns?new=1')}><span className="hidden sm:inline">New campaign</span></Button>
            <div className="relative">
              <button onClick={() => setProfile((v) => !v)} className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-500 text-sm font-semibold text-white" aria-label="Account">M</button>
              {profile && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-line bg-white p-1 shadow-lg" onMouseLeave={() => setProfile(false)}>
                  <Link to="/settings" onClick={() => setProfile(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-gray-50"><Settings className="size-4" />Settings</Link>
                  <button onClick={async () => { await api('/logout', { body: {} }); onLogout(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><LogOut className="size-4" />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="scroll-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-7 sm:px-8"><Outlet /></div>
        </main>
      </div>
      <BulkModal open={bulk} onClose={() => setBulk(false)} />
    </div>
  );
};
