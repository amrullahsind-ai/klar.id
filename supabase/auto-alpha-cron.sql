-- Jalankan sekali di Supabase SQL Editor setelah secret Edge Function CRON_SECRET dibuat.
-- Nilai di Vault HARUS sama persis dengan CRON_SECRET pada Edge Function.
-- Ganti teks di bawah dengan secret acak minimal 24 karakter, lalu jalankan barisnya sekali:
-- select vault.create_secret('GANTI_DENGAN_SECRET_ACAK', 'klaar_cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'klaar-auto-alpha') then
    perform cron.unschedule('klaar-auto-alpha');
  end if;
end $$;

select cron.schedule(
  'klaar-auto-alpha',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://swvqagxwwoefnrezqfnq.supabase.co/functions/v1/dynamic-handler',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'action', 'runAutoAlpha',
      'cronSecret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'klaar_cron_secret'
        limit 1
      )
    ),
    timeout_milliseconds := 15000
  );
  $cron$
);

-- Pemeriksaan:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'klaar-auto-alpha';
-- select * from cron.job_run_details where jobid = (
--   select jobid from cron.job where jobname = 'klaar-auto-alpha'
-- ) order by start_time desc limit 10;
