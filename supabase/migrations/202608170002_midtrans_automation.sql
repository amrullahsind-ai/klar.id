-- Otomatisasi pembayaran Midtrans untuk langganan bulanan KLAAR.
-- Migration lama tidak diubah agar riwayat produksi tetap auditabel.

alter table public.store_orders add column if not exists payment_provider text not null default 'manual';
alter table public.store_orders add column if not exists payment_status text not null default 'unpaid';
alter table public.store_orders add column if not exists payment_token text not null default '';
alter table public.store_orders add column if not exists payment_redirect_url text not null default '';
alter table public.store_orders add column if not exists payment_transaction_id text not null default '';
alter table public.store_orders add column if not exists payment_type text not null default '';
alter table public.store_orders add column if not exists payment_updated_at timestamptz;
alter table public.store_orders add column if not exists payment_payload jsonb not null default '{}'::jsonb;
alter table public.store_orders add column if not exists checkout_token_hash text not null default '';
alter table public.store_orders add column if not exists renewal_license_code text
  references public.licenses(license_code) on delete restrict;

-- Pesanan lama tetap dikenali sebagai pembayaran manual. Pesanan baru selalu
-- mengisi provider secara eksplisit dari backend.
update public.store_orders
set payment_provider = 'manual'
where payment_provider is null or payment_provider = '';

create index if not exists store_orders_payment_status_idx
  on public.store_orders (payment_provider, payment_status, created_at desc);

create unique index if not exists store_orders_midtrans_transaction_uidx
  on public.store_orders (payment_transaction_id)
  where payment_transaction_id <> '';

create index if not exists store_orders_renewal_license_idx
  on public.store_orders (renewal_license_code, created_at desc)
  where renewal_license_code is not null;

-- Perpanjangan berbayar harus atomik: satu notifikasi pembayaran hanya boleh
-- memperpanjang lisensi satu kali, walaupun webhook Midtrans dikirim ulang.
create or replace function public.apply_paid_license_renewal(
  p_order_id uuid,
  p_license_code text,
  p_expected_updated_at timestamptz,
  p_access_token text,
  p_new_expires_at timestamptz,
  p_buyer_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.store_orders%rowtype;
  current_license public.licenses%rowtype;
begin
  select * into current_order
  from public.store_orders
  where id = p_order_id
  for update;

  if not found or current_order.renewal_license_code is distinct from p_license_code then
    return jsonb_build_object('applied', false, 'alreadyPaid', false);
  end if;

  if current_order.status = 'paid' and current_order.license_code = p_license_code then
    return jsonb_build_object('applied', false, 'alreadyPaid', true);
  end if;

  select * into current_license
  from public.licenses
  where license_code = p_license_code
  for update;

  if not found or current_license.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('applied', false, 'alreadyPaid', false);
  end if;

  update public.licenses
  set access_token = p_access_token,
      contact_email = coalesce(nullif(trim(p_buyer_email), ''), contact_email),
      expires_at = p_new_expires_at,
      status = 'active',
      plan = 'monthly',
      updated_at = now()
  where license_code = p_license_code;

  update public.store_orders
  set status = 'paid',
      payment_status = 'paid',
      license_code = p_license_code,
      paid_at = coalesce(paid_at, now()),
      payment_updated_at = now(),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('applied', true, 'alreadyPaid', false);
end;
$$;

revoke all on table public.store_orders from anon, authenticated;
revoke all on function public.apply_paid_license_renewal(uuid, text, timestamptz, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.apply_paid_license_renewal(uuid, text, timestamptz, text, timestamptz, text)
  to service_role;
