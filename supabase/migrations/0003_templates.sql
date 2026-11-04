-- Email templates: extra per-lead details used to fill a design (hook, specialty, rating, reviews, type),
-- and which design an email was made from (e.g. "barbershop-03"), so a city never gets the same design twice.
alter table leads add column if not exists custom jsonb not null default '{}'::jsonb;
alter table emails add column if not exists design text;
create index if not exists emails_design_idx on emails (campaign_id, design);
