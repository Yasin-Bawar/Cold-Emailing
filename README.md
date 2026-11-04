# Mavan Outreach

A free, self-hosted cold-email platform. Connect Gmail or Resend inboxes, keep every lead in one place, review a custom-designed email for each lead, and let the worker send them slowly and safely. Claude connects through **MCP**, so it can create campaigns, add leads, write each email (HTML + image) and read the replies.

- **Dashboard** (Prospeo-style): Home stats, People search with filters and bulk actions, Lists, Replies, Campaigns with a live email preview and Approve/Skip/Edit, Activity, Sending accounts, Suppression, Settings, API & MCP.
- **Sending worker**: weekdays 8am–5pm in each lead's own time zone, warm-up (10 → 20 → 30 → your daily limit per inbox; tick **Already warmed up** to skip it), a random 1–4 minute gap between sends, one-click unsubscribe headers, postal address in every footer, follow-ups in the same thread.
- **Inbox check**: reads the Gmail inbox every 10 minutes. A reply marks the lead *replied* and cancels its follow-ups. "No thanks" / "unsubscribe" replies and bounces go on the never-email list.
- **Gmail via Google sign-in** (Gmail API over HTTPS, works on Railway's cheaper plans that block SMTP), Gmail App Password (SMTP/IMAP) or Resend.
- **MCP server** at `/mcp`: 22 tools for Claude (see below). Claude can draft, queue and approve; only the worker sends, always within the limits above.
- **Cost**: $0 on Supabase free + Gmail. Railway's trial, then Hobby ($5/month) if you keep it.

```
web/        React + Vite + Tailwind dashboard (built into web/dist, served by the API)
server/     Express API, MCP server, worker, scripts (TypeScript, run with tsx)
  src/core/   database, sending engine, senders (Gmail SMTP, Resend), IMAP inbox, limits, time zones
  src/api/    REST API, login, unsubscribe page
  src/mcp/    MCP tools
  src/worker/ send + inbox loops
supabase/migrations/  database schema (applied automatically by the API on start)
```

## 1. Supabase (database + image storage)

1. Create a free project at [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string → URI**, "Session pooler". That's `DATABASE_URL` (put your database password in it).
3. **Project Settings → API**: copy the Project URL (`SUPABASE_URL`) and the `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`). The service key is server-only. Never paste it in a chat or in browser code.

Tables are created automatically when the API starts. Every table has row-level security switched on with no policies, so the public anon key can't read anything. The private bucket `campaign-assets` is created on first upload.

## 2. Gmail inboxes (free)

Railway blocks outgoing SMTP (the normal way apps send email) on its Trial and Hobby plans; only Pro ($20/month) allows it. So on Railway, connect Gmail with **Google sign-in**: it sends and reads mail through the Gmail API over HTTPS, which isn't blocked, and needs no App Password.

One-time setup in [Google Cloud](https://console.cloud.google.com) (free):

1. Create a project, e.g. "Mavan Outreach".
2. Enable the **Gmail API** (APIs & Services → Library → Gmail API → Enable).
3. **Google Auth Platform → Branding**: app name, your email. **Audience**: user type **External**, then **Publish app**. While the app is in "Testing", Google expires the connection every 7 days; once published it stays connected.
4. **Clients → Create client → Web application**. Authorized redirect URI: `https://YOUR-APP.up.railway.app/oauth/google/callback` (your `PUBLIC_URL` + `/oauth/google/callback`).
5. Copy the Client ID and Client secret into Railway as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (both services).

Then in the dashboard, **Sending accounts → Connect Gmail**, sign in with the inbox and allow both permissions (send email, read email). Google shows "Google hasn't verified this app": that's expected for your own app; choose **Advanced → Go to Mavan Outreach**. Repeat for each inbox, then press **Test connection**.

Keep each new inbox at the default 40/day limit after warm-up. More inboxes = more volume. 1000 emails is about 25 inbox-days.

**Gmail with App Password** (SMTP + IMAP) is still there for running locally or on a host that allows SMTP: turn on 2-Step Verification, create an App Password at <https://myaccount.google.com/apppasswords>, and add it under **Sending accounts → Gmail with App Password**.

Resend works too (**Add Resend**, HTTPS, fine on Railway): it needs a domain verified in Resend, and its free plan allows 100/day and 3,000/month (set the daily limit to 100; the platform counts Resend's day in UTC like Resend does, and if Resend still answers "quota exceeded" the email waits for the next day instead of failing). Its terms don't allow purchased or scraped lists, so Gmail is the main cold sender here. Replies to Resend emails go to your first Gmail inbox (or the reply-to in Settings), so they're still tracked.

## 3. Railway (backend)

One repo, **two services**:

1. New project → **Deploy from GitHub repo** → this repo. That's the **API** service.
   - Variables: `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_PASSWORD`, `PUBLIC_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and (after step 2) `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - Settings → Networking → **Generate domain**, then set `PUBLIC_URL` to it (e.g. `https://mavan-outreach.up.railway.app`).
   - Build command `pnpm build`, start command `pnpm start` (both are defaults Railway picks up from package.json).
2. **+ New → GitHub repo** → the same repo again. That's the **worker**.
   - Same variables, plus `ROLE=worker`. No domain needed.
   - The API service also runs the sending loop (set `RUN_SENDER=false` to stop that), so emails still go out if the worker is down. A lease in the database makes sure only one of them sends at a time. **Home** and each campaign show "Sender is running · checked N min ago", or a red warning when nothing has checked in for 10 minutes.

`ENCRYPTION_KEY` is any long random string (`openssl rand -base64 32`). It encrypts the stored App Passwords and API keys, so keep it the same on both services and don't lose it.

Open the API domain, sign in with `ADMIN_PASSWORD`, then:

1. **Settings**: add your postal address (required by CAN-SPAM; nothing is sent without it) and your from name.
2. **Sending accounts**: **Connect Gmail** (see step 2).
3. **API & MCP**: create a token and connect Claude.

## 4. Connect Claude (MCP)

In the dashboard, **API & MCP → Create token**, then on your computer:

```bash
claude mcp add --scope user --transport http mavan https://YOUR-APP.up.railway.app/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Paste the token only into that command, never into a chat. Then ask Claude things like:

> Create a campaign called "Phoenix barbers", add these 20 leads, and write each one a unique HTML email with a website concept image. Keep them as drafts.

| Tool | What it does |
|---|---|
| `create_campaign`, `list_campaigns` | make and list campaigns with counts |
| `add_leads` | up to 1000 at once; duplicates and suppressed addresses are skipped and reported |
| `add_email`, `add_followup` | save a draft: subject, HTML, text, optional image (base64 or https URL → Supabase Storage) |
| `list_emails`, `skip_emails` | see and skip drafts |
| `delete_leads`, `delete_campaign` | remove leads or a whole campaign (needs `confirm: true`; leads already emailed are always kept) |
| `approve_emails` | queue drafts for sending (more than 100 at once needs `confirm: true`) |
| `list_leads`, `get_lead`, `update_lead` | search leads, see a lead's emails and reply, set status/notes |
| `list_replies`, `stats`, `queue_status`, `get_settings` | results and what's waiting |
| `pause_sending`, `resume_sending` | stop or restart everything |
| `suppress_email` | never email an address |

Tokens in an email's HTML: `{{image_url}}` (the image, sent inline), `{{postal_address}}` (from Settings), `{{unsubscribe_url}}` (added automatically at the bottom if missing).

## 5. Import the emails already built (Texas, USA, USA 2)

The 251 emails from `texas-send.zip`, `usa-send.zip` and `usa2-send.zip` load as drafts. On your computer (Node 22+ and pnpm), unzip the three zips, then from this repo:

```bash
pnpm install
OUTREACH_URL=https://YOUR-APP.up.railway.app OUTREACH_TOKEN=YOUR_TOKEN pnpm import:outreach ~/Downloads/texas-send ~/Downloads/usa-send ~/Downloads/usa2-send
```

(A folder that contains the three, or `Zip-Tech-Agency/outreach/us`, works too.) It creates the campaigns "Texas", "USA" and "USA 2", one lead and one draft per email, with each concept image moved to Storage. The old red address placeholder is filled from Settings at send time. Running it again updates the drafts and creates no duplicates. Then review in **Campaigns** and approve.

On Windows PowerShell, set the two variables first: `$env:OUTREACH_URL="https://..."; $env:OUTREACH_TOKEN="..."`, then run `pnpm import:outreach C:\Users\you\Downloads\texas-send ...`.

## Email designs (templates)

140 ready-made designs: **14 business types × 10 layouts** (Classic, Split, Night, Magazine, Phone, Cards, Minimal, Bold, Gallery, Steps). Each design is the email itself, with a preview of the business's future website built in. When emails are generated, only the words change:

| Lead field | Used for |
|---|---|
| `business_name`, `city`, `state` | everywhere (name, domain idea like `freshfadez.com`, location) |
| `category` (or `custom.type`) | picks the business type, e.g. "Barbershop", "Food truck", "Auto repair" |
| `contact_name` or `custom.first_name` | greeting ("Hi Maria,") |
| `custom.hook` | the one personal line about the business (the most important field) |
| `custom.specialty` | the mock website's tagline (e.g. "Birria tacos") |
| `custom.rating`, `custom.reviews` | star rating on the mock site (only if real) |

Business types: barbershop, hair salon, nail salon, beauty & spa, tattoo, restaurant, food truck, bakery & café, cleaning, lawn & landscaping, home trades (plumbing, electrical, HVAC), auto repair, fitness, pet grooming.

- **Delete:** on **Campaigns**, the ⋯ menu on a row has Open, Pause/Resume and Delete (optionally with its leads; leads already emailed are kept).
- **Dashboard:** **Designs** shows all 140. On a campaign, **Generate emails** drafts one for every lead without an email (plus an optional follow-up 4 days later). No two leads in the same city get the same design until all ten are used there.
- **MCP:** `add_leads` (with `custom`), then `generate_emails`, then `approve_emails`.
- Photos live in `server/assets/photos/` (Unsplash License, see its `CREDITS.md`) and are served at `<PUBLIC_URL>/photos/...`.

## How sending works

Every 2 minutes, for each active inbox that is under today's limit and past its 1–4 minute gap, the worker picks one approved email:

- the lead isn't suppressed, hasn't replied, bounced or unsubscribed, and its campaign isn't paused;
- it's a weekday between 8:00 and 16:59 in the lead's time zone (set from the state when leads are added);
- for a follow-up: the previous step was sent at least `delay_days` ago; it goes in the same thread, from the same inbox.

After 3 failed sends in a row an inbox is set to *error* and skipped until you fix and resume it. An email interrupted mid-send is marked failed, never re-sent automatically.

**Compliance**: every email carries your postal address, a working unsubscribe link and one-click `List-Unsubscribe` headers. Keep each lead's `source_url` (where you found the email). Unsubscribes, bounces and opt-out replies are honoured automatically and permanently.

## Local development

Needs Node 22+, pnpm and a Postgres database (a free Supabase project works, or a local Postgres).

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL, ENCRYPTION_KEY, ADMIN_PASSWORD
pnpm dev:api                # http://localhost:8080 (applies migrations)
pnpm dev:web                # http://localhost:5173 with hot reload
pnpm dev:worker             # sending + inbox loops
```

Tests (unit tests always; database tests when `TEST_DATABASE_URL` points at an empty throwaway database, which they wipe):

```bash
TEST_DATABASE_URL=postgres://user@localhost:5432/outreach_test pnpm test
pnpm typecheck
```
