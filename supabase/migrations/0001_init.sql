-- Mavan Outreach: core schema. Run with `pnpm migrate` (uses DATABASE_URL) or paste into the Supabase SQL editor.
-- Every table has row-level security on and no policies, so the public anon key can read nothing.
-- The API and worker connect with the database connection string (table owner), which is not affected by RLS.

create extension if not exists pgcrypto;

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  postal_address text not null default '',
  from_name text not null default 'Mavan',
  reply_to text,
  paused boolean not null default false,
  default_daily_cap int not null default 40,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- Sending inboxes: Gmail (address + App Password) or Resend (API key). The secret is AES-GCM encrypted by the API.
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gmail', 'resend')),
  email text not null unique,
  from_name text,
  secret_enc text not null,
  daily_cap int not null default 40,
  warmup_start date not null default current_date,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  fail_streak int not null default 0,
  last_error text,
  next_send_at timestamptz,
  imap_last_uid bigint not null default 0,
  imap_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'done')),
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  business_name text not null default '',
  contact_name text,
  category text,
  city text,
  state text,
  timezone text,
  phone text,
  address text,
  website text,
  source_url text,
  score int,
  status text not null default 'new'
    check (status in ('new', 'queued', 'sent', 'replied', 'interested', 'won', 'lost', 'unsubscribed', 'bounced')),
  notes text,
  campaign_id uuid references campaigns (id) on delete set null,
  last_reply text,
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists leads_email_key on leads (lower(email));
create index if not exists leads_status_idx on leads (status);
create index if not exists leads_campaign_idx on leads (campaign_id);

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists list_leads (
  list_id uuid not null references lists (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  primary key (list_id, lead_id)
);

-- One row per email to send: step 0 is the first email, 1+ are follow-ups sent delay_days after the previous step.
create table if not exists emails (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  step int not null default 0,
  delay_days int not null default 0,
  subject text not null,
  html text,
  text text,
  image_path text,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sending', 'sent', 'failed', 'cancelled', 'skipped')),
  send_after timestamptz,
  account_id uuid references accounts (id) on delete set null,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  message_id_header text,
  error text,
  created_at timestamptz not null default now(),
  unique (lead_id, campaign_id, step)
);
create index if not exists emails_status_idx on emails (status, send_after);
create index if not exists emails_msgid_idx on emails (message_id_header);

create table if not exists events (
  id bigserial primary key,
  lead_id uuid references leads (id) on delete cascade,
  email_id uuid references emails (id) on delete set null,
  account_id uuid references accounts (id) on delete set null,
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_type_time_idx on events (type, created_at desc);
create index if not exists events_lead_idx on events (lead_id);

-- Never-email list: unsubscribes, bounces and manual excludes. Checked before every send.
create table if not exists suppression (
  email text primary key,
  reason text not null default 'manual',
  created_at timestamptz not null default now()
);

-- Tokens for the MCP server and scripts. Only a SHA-256 hash is stored.
create table if not exists api_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table settings enable row level security;
alter table accounts enable row level security;
alter table campaigns enable row level security;
alter table leads enable row level security;
alter table lists enable row level security;
alter table list_leads enable row level security;
alter table emails enable row level security;
alter table events enable row level security;
alter table suppression enable row level security;
alter table api_tokens enable row level security;
