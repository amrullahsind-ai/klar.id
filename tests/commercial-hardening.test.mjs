import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202608170001_commercial_hardening.sql');
const paymentMigration = read('supabase/migrations/202608170002_midtrans_automation.sql');
const dynamicHandler = read('supabase/functions/dynamic-handler/index.ts');
const sellerHandler = read('supabase/functions/seller-handler/index.ts');
const sellerAdmin = read('seller-admin.html');
const checkout = read('checkout.html');
const store = read('store.html');
const admin = read('admin.html');
const employee = read('employee.html');

for (const table of ['seller_users', 'store_orders', 'seller_audit_logs', 'license_time_grants', 'app_sessions', 'api_rate_limits']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} belum dibuat`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} belum memakai RLS`);
  assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`), `${table} belum ditutup dari client`);
}
assert.match(migration, /add column if not exists revision bigint not null default 1/);
assert.match(migration, /create or replace function public\.consume_rate_limit/);
assert.match(migration, /create or replace function public\.apply_complimentary_extension/);
assert.match(migration, /drop policy if exists "Bypass RLS attendance_records"/);
assert.match(migration, /drop policy if exists "Bypass RLS attendance_requests"/);
assert.doesNotMatch(migration, /delete from public\.app_sessions\s+where expires_at <= now\(\)/);
assert.doesNotMatch(migration, /delete from public\.api_rate_limits\s+where updated_at <= now\(\) - interval '7 days'/);

for (const column of ['payment_provider', 'payment_status', 'payment_token', 'payment_transaction_id', 'checkout_token_hash', 'renewal_license_code']) {
  assert.match(paymentMigration, new RegExp(`add column if not exists ${column}`), `${column} belum dimigrasikan`);
}
assert.match(paymentMigration, /store_orders_midtrans_transaction_uidx/);
assert.match(paymentMigration, /apply_paid_license_renewal/);
assert.match(paymentMigration, /revoke all on table public\.store_orders from anon, authenticated/);

assert.doesNotMatch(sellerAdmin, /script\.google\.com|SELLER_SALT|adminHash/);
assert.doesNotMatch(checkout, /script\.google\.com|klaar_store_cb_|callback:cb/);
assert.doesNotMatch(checkout, /SELLER_WA|wa\.me|updatePaymentProof|qris\.png/i);
assert.match(checkout, /Rp199\.000/);
assert.match(store, /Rp199\.000/);
assert.match(checkout, /window\.snap\.pay/);
assert.match(checkout, /action:'orderStatus'/);
assert.match(checkout, /checkoutToken/);
assert.match(checkout, /renewalToken/);
assert.match(sellerAdmin, /sellerLogin/);
assert.match(sellerHandler, /service\.auth\.getUser\(token\)/);
assert.match(sellerHandler, /seller_users/);
assert.match(sellerHandler, /tenantKey/);
assert.match(sellerHandler, /grantComplimentaryExtension/);
assert.match(sellerHandler, /MIDTRANS_SERVER_KEY/);
assert.match(sellerHandler, /snap\/v1\/transactions/);
assert.match(sellerHandler, /\/v2\/\$\{encodeURIComponent\(orderId\)\}\/status/);
assert.match(sellerHandler, /signature_key/);
assert.match(sellerHandler, /midtransNotification/);
assert.match(sellerHandler, /createOrderLicense/);
assert.match(sellerHandler, /renewPaidOrderLicense/);
assert.match(sellerHandler, /apply_paid_license_renewal/);
assert.match(sellerHandler, /checkout_token_hash/);
assert.match(sellerHandler, /MONTHLY_PRICE_IDR.*199000/);
assert.match(sellerAdmin, /Waktu gratis/);
assert.match(dynamicHandler, /lic\.tenantKey \|\| presentedLicenseCode/);
assert.match(dynamicHandler, /savePayloadCAS\(licenseCode, data, baseRevision\)/);

assert.doesNotMatch(admin, /savedSession\.hash/);
assert.match(admin, /sessionToken: adminAuth\?\.sessionToken/);
assert.doesNotMatch(employee, /localStorage\.setItem\(PINHASH_KEY/);
assert.match(employee, /EMPLOYEE_SESSION_KEY/);

// Format token yang diterbitkan seller harus dapat diverifikasi oleh kontrak HMAC dynamic-handler.
const secret = 'test-only-secret-that-is-longer-than-forty-characters-123';
const payload = JSON.stringify({
  school: 'Sekolah Uji', tenantKey: 'KLR-TEST', plan: 'monthly', billingPeriod: 'monthly',
  iat: 1_800_000_000, exp: 1_802_678_400
});
const part = Buffer.from(payload).toString('base64url');
const signature = createHmac('sha256', secret).update(payload).digest('base64url');
const token = `KLAAR.${part}.${signature}`;
const [prefix, encoded, got] = token.split('.');
assert.equal(prefix, 'KLAAR');
assert.equal(Buffer.from(encoded, 'base64url').toString('utf8'), payload);
assert.equal(got, createHmac('sha256', secret).update(payload).digest('base64url'));

// Kontrak signature webhook Midtrans: SHA512(order_id + status_code + gross_amount + ServerKey).
const webhookInput = 'ORD-TEST-1' + '200' + '199000.00' + 'SB-Mid-server-test';
assert.equal(
  createHash('sha512').update(webhookInput).digest('hex').length,
  128
);

console.log('commercial hardening static tests: ok');
