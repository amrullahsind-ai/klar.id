-- Jalankan sekali di Supabase SQL Editor setelah Edge Function terbaru dideploy.
-- Memakai Vault secret klaar_cron_secret yang sama dengan cron auto-alpha.
-- Default retensi pada Edge Function adalah 30 hari dan dapat diubah melalui
-- secret SELFIE_RETENTION_DAYS (minimum 30, maksimum 365).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'klaar-selfie-retention') then
    perform cron.unschedule('klaar-selfie-retention');
  end if;
end $$;

select cron.schedule(
  'klaar-selfie-retention',
  '20 2 * * *',
  $cron$
  select net.http_post(
    url := 'https://swvqagxwwoefnrezqfnq.supabase.co/functions/v1/dynamic-handler',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'action', 'cleanupExpiredSelfies',
      'cronSecret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'klaar_cron_secret'
        limit 1
      )
    ),
    timeout_milliseconds := 55000
  );
  $cron$
);

-- Jadwal 02:20 UTC = 09:20 WIB. Pemeriksaan read-only:
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname = 'klaar-selfie-retention';
--
-- select *
-- from cron.job_run_details
-- where jobid = (
--   select jobid from cron.job where jobname = 'klaar-selfie-retention'
-- )
-- order by start_time desc
-- limit 10;
