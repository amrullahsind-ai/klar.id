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
    'logs',
    'seller_users',
    'store_orders',
    'seller_audit_logs',
    'license_time_grants',
    'app_sessions',
    'api_rate_limits'
  )
order by c.relname;

-- Untuk tabel aplikasi yang service-role-only, hasil query ini harus kosong.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'licenses',
    'databases',
    'attendance_records',
    'attendance_requests',
    'attendance_selfies',
    'logs',
    'seller_users',
    'store_orders',
    'seller_audit_logs',
    'license_time_grants',
    'app_sessions',
    'api_rate_limits'
  )
order by tablename, policyname;

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
where jobname in ('klaar-auto-alpha', 'klaar-selfie-retention', 'klaar-commercial-maintenance')
order by jobname;

-- Tidak menampilkan nilai secret. Hanya memastikan namanya tersedia.
select
  name,
  created_at,
  updated_at
from vault.decrypted_secrets
where name = 'klaar_cron_secret';

-- Ringkasan lisensi tanpa menampilkan kode lisensi atau data sekolah.
select
  status,
  plan,
  count(*) as total,
  count(*) filter (where expires_at is null) as tanpa_tanggal_berakhir,
  count(*) filter (where expires_at <= now()) as sudah_berakhir
from public.licenses
group by status, plan
order by status, plan;

-- Kolom tenant stabil dan optimistic locking wajib tersedia.
select
  count(*) filter (where tenant_key is null or tenant_key = '') as lisensi_tanpa_tenant,
  count(*) filter (where access_token is null or access_token = '') as lisensi_tanpa_token,
  count(*) filter (where tenant_key <> license_code) as tenant_tidak_sinkron
from public.licenses;

select
  min(revision) as revision_minimum,
  count(*) filter (where revision < 1) as revision_tidak_valid
from public.databases;

-- Ringkasan seller dan sesi tanpa menampilkan identitas/token.
select
  count(*) as seller_total,
  count(*) filter (where active) as seller_aktif
from public.seller_users;

select
  subject_type,
  count(*) filter (where revoked_at is null and expires_at > now()) as sesi_aktif,
  count(*) filter (where expires_at <= now()) as sesi_kedaluwarsa
from public.app_sessions
group by subject_type
order by subject_type;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('consume_rate_limit', 'reset_rate_limit', 'apply_complimentary_extension')
order by p.proname;
