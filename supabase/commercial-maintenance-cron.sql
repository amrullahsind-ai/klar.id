-- Jalankan sekali setelah migration commercial hardening.
-- Menghapus sesi dan rate-limit yang tidak lagi berguna; tidak menyentuh data sekolah.

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'klaar-commercial-maintenance') then
    perform cron.unschedule('klaar-commercial-maintenance');
  end if;
end $$;

select cron.schedule(
  'klaar-commercial-maintenance',
  '40 2 * * *',
  $cron$
    delete from public.app_sessions
    where expires_at <= now() - interval '7 days'
       or revoked_at is not null and revoked_at <= now() - interval '30 days';

    delete from public.api_rate_limits
    where updated_at <= now() - interval '7 days';
  $cron$
);
