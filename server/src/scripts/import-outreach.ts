// One-time import of the emails already built (Texas, USA, USA 2). Point it at the unzipped send folders
// (texas-send, usa-send, usa2-send), at a folder that contains them, or at Zip-Tech-Agency/outreach/us.
// It talks to your running platform through the API, so you only need its URL and an API token:
//   OUTREACH_URL=https://your-app.up.railway.app OUTREACH_TOKEN=mvn_... pnpm import:outreach ~/Downloads/texas-send ~/Downloads/usa-send ~/Downloads/usa2-send
// Leads and emails arrive as drafts (nothing is sent). Re-running updates drafts and creates no duplicates.
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { stripTextHeaders } from '../core/compose.ts';

const KNOWN: Record<string, { campaign: string; prospects: string }> = {
  downloads: { campaign: 'Texas', prospects: 'prospects-us.json' },
  'texas-send': { campaign: 'Texas', prospects: 'prospects-us.json' },
  'texas-emails': { campaign: 'Texas', prospects: 'prospects-us.json' },
  'downloads-usa': { campaign: 'USA', prospects: 'prospects-usa.json' },
  'usa-send': { campaign: 'USA', prospects: 'prospects-usa.json' },
  'usa-emails': { campaign: 'USA', prospects: 'prospects-usa.json' },
  'downloads-usa2': { campaign: 'USA 2', prospects: 'prospects-usa2.json' },
  'usa2-send': { campaign: 'USA 2', prospects: 'prospects-usa2.json' },
  'usa2-emails': { campaign: 'USA 2', prospects: 'prospects-usa2.json' },
  'usa2-emails-only': { campaign: 'USA 2', prospects: 'prospects-usa2.json' },
};
const isEmailFolder = (d: string, f: string) => /^\d{2,3}-/.test(f) && existsSync(path.join(d, f, 'email.html')) && existsSync(path.join(d, f, 'email.txt'));
const CATEGORY: Record<string, string> = { barber: 'Barbershop', salon: 'Hair salon', nails: 'Nail salon', food: 'Restaurant', bakery: 'Bakery', home: 'Home services', truck: 'Food truck' };

const base = (process.env.OUTREACH_URL || '').replace(/\/+$/, '');
const token = process.env.OUTREACH_TOKEN || '';
if (!base || !token) throw new Error('Set OUTREACH_URL and OUTREACH_TOKEN (create a token in the dashboard under API & MCP).');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const named = process.argv.find((a) => a.startsWith('--campaign='))?.slice(11);

// Work out which folders hold emails: a send folder itself (numbered sub-folders), or a folder containing send folders.
type Round = { dir: string; campaign: string; prospects: string };
const rounds: Round[] = [];
for (const a of args.length ? args : ['.']) {
  const dir = path.resolve(process.env.INIT_CWD || process.cwd(), a); // INIT_CWD: where you ran pnpm
  if (!existsSync(dir)) throw new Error(`Folder not found: ${dir}`);
  const entries = await readdir(dir);
  if (entries.some((f) => isEmailFolder(dir, f))) {
    const k = KNOWN[path.basename(dir)];
    rounds.push({ dir, campaign: named || k?.campaign || path.basename(dir), prospects: path.join(path.dirname(dir), k?.prospects || '-') });
    continue;
  }
  for (const f of entries) {
    const sub = path.join(dir, f);
    if (KNOWN[f] && (await readdir(sub).catch(() => [] as string[])).some((x) => isEmailFolder(sub, x)))
      rounds.push({ dir: sub, campaign: KNOWN[f].campaign, prospects: path.join(dir, KNOWN[f].prospects) });
  }
}
if (!rounds.length) throw new Error('No email folders found. Unzip texas-send.zip, usa-send.zip and usa2-send.zip, then pass those folders.');

const call = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(`${base}/api${p}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${j.error || ''}`);
  return j;
};

let total = 0, failed = 0;
for (const round of rounds) {
  const dir = round.dir;
  const prospects: any[] = existsSync(round.prospects) ? JSON.parse(await readFile(round.prospects, 'utf8')) : [];
  const byEmail = new Map(prospects.map((p) => [String(p.email || '').toLowerCase(), p]));
  const campaign = await call('POST', '/campaigns', { name: round.campaign, notes: `Imported from ${path.basename(dir)}` });
  const folders = (await readdir(dir)).filter((f) => isEmailFolder(dir, f)).sort();
  console.log(`${round.campaign}: ${folders.length} emails`);
  for (const f of folders) {
    try {
      const txt = await readFile(path.join(dir, f, 'email.txt'), 'utf8');
      const [toLine, subjectLine] = txt.split('\n');
      const email = toLine.replace(/^To:\s*/i, '').trim().toLowerCase();
      const subject = subjectLine.replace(/^Subject:\s*/i, '').trim();
      const info = existsSync(path.join(dir, f, 'info.json')) ? JSON.parse(await readFile(path.join(dir, f, 'info.json'), 'utf8')) : {};
      const p = byEmail.get(email) || {};
      let html = await readFile(path.join(dir, f, 'email.html'), 'utf8');
      const m = /src="data:(image\/[a-z]+);base64,([^"]+)"/.exec(html);
      let image_base64: string | undefined, image_type: string | undefined;
      if (m) { image_type = m[1]; image_base64 = m[2]; html = html.replace(m[0], 'src="{{image_url}}"'); }
      else if (existsSync(path.join(dir, f, 'email.jpg'))) { image_base64 = (await readFile(path.join(dir, f, 'email.jpg'))).toString('base64'); image_type = 'image/jpeg'; }
      const lead = {
        email,
        business_name: info.name || p.name || '',
        category: CATEGORY[p.cat] || p.cat || null,
        city: info.city || p.city || null,
        state: info.st || p.st || 'TX',
        timezone: info.tz || null,
        phone: p.phone || null,
        address: p.addr || null,
        source_url: p.emailSource || null,
        score: typeof p.score === 'number' ? p.score : null,
        notes: p.facts ? `Facts: ${p.facts}` : null,
      };
      const up = await call('POST', '/leads', { leads: [lead], campaign_id: campaign.id });
      if (up.skipped?.length) { console.log(`  ${f}: skipped (${up.skipped[0].reason})`); continue; }
      const id = (up.created[0] || up.existing[0]).id;
      await call('POST', '/emails', { lead_id: id, campaign_id: campaign.id, step: 0, subject, html, text: stripTextHeaders(txt), image_base64, image_type });
      total++;
      process.stdout.write('.');
    } catch (e) {
      failed++;
      console.log(`\n  ${f}: ${(e as Error).message}`);
    }
  }
  process.stdout.write('\n');
}
console.log(`Imported ${total} emails as drafts${failed ? `, ${failed} failed` : ''}. Review them under Campaigns, then approve.`);
