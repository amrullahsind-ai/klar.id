-- Edge Function memakai service_role; hak tabel harus eksplisit karena tabel lama
-- dapat tidak mewarisi default grants Supabase.
grant select, insert, update, delete on table
  public.licenses,
  public.databases,
  public.attendance_records,
  public.attendance_requests,
  public.attendance_selfies,
  public.logs
to service_role;

grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- Browser tetap tidak boleh mengakses data sekolah secara langsung.
revoke all on table
  public.licenses,
  public.databases,
  public.attendance_records,
  public.attendance_requests,
  public.attendance_selfies,
  public.logs
from anon, authenticated;
