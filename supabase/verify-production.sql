-- Pemeriksaan read-only setelah migration dan deploy Klaar.
-- Aman dijalankan berulang kali di Supabase SQL Editor.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'licenses',
    'databases',
    'attendance_records',
    'attendance_requests',
    'attendance_selfies',
    'logs'
  )
order by c.relname;

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'selfies';

select
  jobid,
  jobname,
  schedule,
  active
from cron.job
where jobname = 'klaar-auto-alpha';

-- Tidak menampilkan nilai secret. Hanya memastikan namanya tersedia.
select
  name,
  created_at,
  updated_at
from vault.decrypted_secrets
where name = 'klaar_cron_secret';
