-- Who is sending right now. The worker and the API can both run the sending loop; only the process holding this
-- lease (renewed every tick, taken over when it runs out) sends, so emails go out even when the worker isn't running,
-- and never twice. sender_seen_at / sender_note show in the dashboard as "last check".
alter table settings add column if not exists sender_holder text;
alter table settings add column if not exists sender_lease_until timestamptz;
alter table settings add column if not exists sender_seen_at timestamptz;
alter table settings add column if not exists sender_note text;
