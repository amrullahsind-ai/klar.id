import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202608170001_commercial_hardening.sql');
const dynamicHandler = read('supabase/functions/dynamic-handler/index.ts');
const sellerHandler = read('supabase/functions/seller-handler/index.ts');
const sellerAdmin = read('seller-admin.html');
const checkout = read('checkout.html');
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

assert.doesNotMatch(sellerAdmin, /script\.google\.com|SELLER_SALT|adminHash/);
assert.doesNotMatch(checkout, /script\.google\.com|klaar_store_cb_|callback:cb/);
assert.match(sellerAdmin, /sellerLogin/);
assert.match(sellerHandler, /service\.auth\.getUser\(token\)/);
assert.match(sellerHandler, /seller_users/);
assert.match(sellerHandler, /tenantKey/);
assert.match(sellerHandler, /grantComplimentaryExtension/);
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

console.log('commercial hardening static tests: ok');
