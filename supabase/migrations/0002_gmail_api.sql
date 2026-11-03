-- Gmail connected with Google sign-in (Gmail API over HTTPS). Hosts like Railway block SMTP ports on cheaper plans,
-- so this is the default way to connect Gmail there. For these accounts imap_last_uid stores the internal date (ms)
-- of the newest inbox message already processed.
alter table accounts drop constraint if exists accounts_provider_check;
alter table accounts add constraint accounts_provider_check check (provider in ('gmail', 'gmail_api', 'resend'));
