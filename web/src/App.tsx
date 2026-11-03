import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { api, setUnauthorizedHandler } from './api.ts';
import { Layout } from './Layout.tsx';
import { Spinner, ToastProvider, Empty } from './ui.tsx';
import { Login } from './pages/Login.tsx';
import { Home } from './pages/Home.tsx';
import { Leads } from './pages/Leads.tsx';
import { Campaigns } from './pages/Campaigns.tsx';
import { CampaignDetail } from './pages/CampaignDetail.tsx';
import { Lists, Replies, Activity, Suppression } from './pages/Misc.tsx';
import { Accounts, SettingsPage, McpPage } from './pages/Setup.tsx';

export const App = () => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    setUnauthorizedHandler(() => setAuthed(false));
    api('/meta').then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);
  if (authed === null) return <div className="grid h-full place-items-center"><Spinner /></div>;
  return (
    <ToastProvider>
      {!authed ? <Login onDone={() => setAuthed(true)} /> : (
        <BrowserRouter>
          <Routes>
            <Route element={<Layout onLogout={() => setAuthed(false)} />}>
              <Route index element={<Home />} />
              <Route path="leads" element={<Leads />} />
              <Route path="lists" element={<Lists />} />
              <Route path="replies" element={<Replies />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="campaigns/:id" element={<CampaignDetail />} />
              <Route path="activity" element={<Activity />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="suppression" element={<Suppression />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="connect" element={<McpPage />} />
              <Route path="*" element={<Empty title="Page not found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      )}
    </ToastProvider>
  );
};
