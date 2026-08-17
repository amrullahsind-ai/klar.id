import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LICENSE_SECRET = Deno.env.get("LICENSE_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SELLER_FROM_EMAIL = Deno.env.get("SELLER_FROM_EMAIL") ?? "KLAAR <lisensi@klaar.my.id>";
const MONTHLY_PRICE_IDR = Math.max(0, Number(Deno.env.get("KLAAR_MONTHLY_PRICE_IDR") || 0) || 0);
const PRICING_OPEN = (Deno.env.get("STORE_PRICING_OPEN") ?? "false").toLowerCase() === "true";
const ALLOWED_ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || "https://app.klaar.my.id")
  .split(",").map((value) => value.trim()).filter(Boolean));

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const encoder = new TextEncoder();

class ApiError extends Error {
  status;
  details;
  constructor(message, status = 400, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function corsHeaders(req) {
  const origin = String(req.headers.get("origin") || "");
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function respond(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function cleanText(value, max = 200) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function validEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError("Email tidak valid.");
  return email;
}

function validUrl(value) {
  const raw = cleanText(value, 1000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") throw new Error("protocol");
    return url.toString();
  } catch (_error) {
    throw new ApiError("Link bukti pembayaran harus berupa URL HTTPS yang valid.");
  }
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value || "")));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function limit(scope, identity, maxAttempts, windowSeconds, blockSeconds) {
  const rateKey = await sha256(`${scope}|${identity}`);
  const { data, error } = await service.rpc("consume_rate_limit", {
    p_key: rateKey,
    p_scope: scope,
    p_limit: maxAttempts,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds
  });
  if (error) throw new ApiError("Rate limiter belum siap. Jalankan migration hardening.", 503);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    throw new ApiError(`Terlalu banyak percobaan. Coba lagi dalam ${Number(result?.retry_after_seconds || 60)} detik.`, 429, {
      retryAfter: Number(result?.retry_after_seconds || 60)
    });
  }
  return rateKey;
}

async function resetLimit(rateKey) {
  if (rateKey) await service.rpc("reset_rate_limit", { p_key: rateKey });
}

function randomOrderId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const suffix = Array.from(bytes).map((byte) => byte.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 9);
  return `ORD-${date}-${suffix}`;
}

function addCalendarMonths(date, months) {
  const source = new Date(date);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1,
    source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signLicenseUntil(school, tenantKey, expiresAt) {
  if (LICENSE_SECRET.length < 40) throw new ApiError("LICENSE_SECRET belum dikonfigurasi dengan aman.", 503);
  const issuedAt = new Date();
  const payload = JSON.stringify({
    school,
    tenantKey,
    plan: "monthly",
    billingPeriod: "monthly",
    iat: Math.floor(issuedAt.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000)
  });
  const key = await crypto.subtle.importKey("raw", encoder.encode(LICENSE_SECRET), {
    name: "HMAC", hash: "SHA-256"
  }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return {
    token: `KLAAR.${b64url(encoder.encode(payload))}.${b64url(new Uint8Array(signature))}`,
    expiresAt: expiresAt.toISOString()
  };
}

async function signLicense(school, tenantKey, durationMonths = 1) {
  return await signLicenseUntil(school, tenantKey, addCalendarMonths(new Date(), durationMonths));
}

async function sellerFromRequest(req) {
  const authorization = String(req.headers.get("authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiError("Sesi penjual tidak tersedia. Silakan masuk kembali.", 401);
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) throw new ApiError("Sesi penjual berakhir. Silakan masuk kembali.", 401);
  const { data: seller, error: sellerError } = await service.from("seller_users")
    .select("user_id,display_name,role,active").eq("user_id", data.user.id).maybeSingle();
  if (sellerError || !seller?.active) throw new ApiError("Akun ini tidak diizinkan membuka panel penjual.", 403);
  return { ...seller, email: data.user.email || "" };
}

async function audit(seller, action, targetType, targetId, requestFingerprint, metadata = {}) {
  const { error } = await service.from("seller_audit_logs").insert({
    actor_user_id: seller?.user_id || null,
    action,
    target_type: targetType || "",
    target_id: cleanText(targetId, 200),
    request_fingerprint: requestFingerprint || "",
    metadata
  });
  if (error) console.error("seller_audit_failed", error.message);
}

async function sendLicenseEmail(email, school, token, expiresAt) {
  if (!email) return { emailed: false, emailError: "Email tidak diisi." };
  if (!RESEND_API_KEY) return { emailed: false, emailError: "RESEND_API_KEY belum dikonfigurasi." };
  const safeSchool = cleanText(school, 160);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: SELLER_FROM_EMAIL,
      to: [email],
      subject: `Lisensi KLAAR — ${safeSchool}`,
      text: `Lisensi KLAAR untuk ${safeSchool}\n\n${token}\n\nBerlaku sampai ${new Date(expiresAt).toLocaleDateString("id-ID", { timeZone: "Asia/Jakarta" })}. Simpan kode ini dengan aman dan jangan bagikan ke sekolah lain.`
    })
  });
  if (!response.ok) return { emailed: false, emailError: `Penyedia email menolak permintaan (${response.status}).` };
  return { emailed: true, emailError: "" };
}

async function createLicense(school, email, durationMonths, notes) {
  const tenantKey = `KLR-${crypto.randomUUID().toUpperCase()}`;
  const signed = await signLicense(school, tenantKey, durationMonths);
  const { error } = await service.from("licenses").insert({
    license_code: tenantKey,
    tenant_key: tenantKey,
    access_token: signed.token,
    contact_email: email || "",
    school_name: school,
    status: "active",
    plan: "monthly",
    expires_at: signed.expiresAt,
    notes: cleanText(notes, 500)
  });
  if (error) throw new ApiError("Gagal menyimpan lisensi.", 500);
  const delivery = await sendLicenseEmail(email, school, signed.token, signed.expiresAt);
  return { tenantKey, ...signed, ...delivery };
}

async function sellerLogin(params, context) {
  const email = validEmail(params.email);
  const password = String(params.password || "");
  if (password.length < 8 || password.length > 200) throw new ApiError("Email atau password salah.", 401);
  const rateKey = await limit("seller-login", `${context.ip}|${email}`, 5, 900, 900);
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session) throw new ApiError("Email atau password salah.", 401);
  const { data: seller } = await service.from("seller_users").select("active").eq("user_id", data.user.id).maybeSingle();
  if (!seller?.active) throw new ApiError("Akun ini tidak diizinkan membuka panel penjual.", 403);
  await resetLimit(rateKey);
  return {
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at,
    user: { email: data.user.email || "" }
  };
}

async function sellerRefresh(params, context) {
  await limit("seller-refresh", context.ip, 20, 900, 300);
  const refreshToken = String(params.refreshToken || "");
  if (!refreshToken) throw new ApiError("Sesi tidak dapat diperbarui.", 401);
  const { data, error } = await anon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session || !data.user) throw new ApiError("Sesi berakhir. Silakan masuk kembali.", 401);
  const { data: seller } = await service.from("seller_users").select("active").eq("user_id", data.user.id).maybeSingle();
  if (!seller?.active) throw new ApiError("Akun penjual tidak aktif.", 403);
  return {
    ok: true,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at
  };
}

async function createOrder(params, context) {
  const school = cleanText(params.school, 160);
  const email = validEmail(params.email);
  if (school.length < 3) throw new ApiError("Nama sekolah minimal 3 karakter.");
  await limit("store-order", `${context.ip}|${email}`, 4, 3600, 3600);
  if (!PRICING_OPEN || MONTHLY_PRICE_IDR < 1) {
    throw new ApiError("Pemesanan online belum dibuka. Hubungi penjual untuk informasi harga.", 409, { pricingClosed: true });
  }
  const orderId = randomOrderId();
  const { data, error } = await service.from("store_orders").insert({
    order_id: orderId,
    school_name: school,
    buyer_email: email,
    plan: "monthly",
    billing_period: "monthly",
    duration_months: 1,
    amount: MONTHLY_PRICE_IDR,
    buyer_notes: cleanText(params.buyerNotes, 1000)
  }).select("order_id,school_name,buyer_email,plan,amount,status").single();
  if (error) throw new ApiError("Pesanan gagal dibuat. Coba lagi.", 500);
  return {
    ok: true,
    orderId: data.order_id,
    school: data.school_name,
    email: data.buyer_email,
    plan: data.plan,
    amount: data.amount,
    status: data.status,
    payInfo: "Bayar sesuai nominal, lalu kirim bukti pembayaran untuk diverifikasi."
  };
}

async function updatePaymentProof(params, context) {
  const orderId = cleanText(params.orderId, 80);
  const email = validEmail(params.email);
  await limit("payment-proof", `${context.ip}|${orderId}|${email}`, 6, 3600, 3600);
  const paymentProof = validUrl(params.paymentProof);
  const buyerNotes = cleanText(params.buyerNotes, 1000);
  if (!paymentProof && !buyerNotes) throw new ApiError("Isi link bukti atau catatan pembayaran.");
  const { data, error } = await service.from("store_orders").update({
    payment_proof: paymentProof,
    buyer_notes: buyerNotes,
    status: "payment_review",
    updated_at: new Date().toISOString()
  }).eq("order_id", orderId).eq("buyer_email", email).in("status", ["pending", "payment_review"])
    .select("order_id").maybeSingle();
  if (error || !data) throw new ApiError("Pesanan tidak ditemukan atau sudah selesai.", 404);
  return { ok: true, message: "Bukti pembayaran tersimpan dan menunggu verifikasi." };
}

async function listOrders() {
  const { data, error } = await service.from("store_orders")
    .select("order_id,school_name,buyer_email,plan,amount,payment_proof,buyer_notes,status,license_code,created_at,paid_at")
    .order("created_at", { ascending: false }).limit(300);
  if (error) throw new ApiError("Gagal memuat pesanan.", 500);
  return {
    ok: true,
    orders: (data || []).map((order) => ({
      orderId: order.order_id,
      school: order.school_name,
      email: order.buyer_email,
      plan: order.plan,
      amount: order.amount,
      paymentProof: order.payment_proof,
      buyerNotes: order.buyer_notes,
      status: order.status,
      hasLicense: Boolean(order.license_code),
      createdAt: order.created_at,
      paidAt: order.paid_at
    }))
  };
}

async function confirmOrder(params, seller, context) {
  const orderId = cleanText(params.orderId, 80);
  const { data: order, error } = await service.from("store_orders").select("*").eq("order_id", orderId).maybeSingle();
  if (error || !order) throw new ApiError("Pesanan tidak ditemukan.", 404);
  let license;
  if (order.license_code) {
    const { data } = await service.from("licenses").select("license_code,access_token,expires_at,school_name").eq("license_code", order.license_code).maybeSingle();
    if (!data) throw new ApiError("Referensi lisensi pesanan rusak.", 409);
    license = { tenantKey: data.license_code, token: data.access_token, expiresAt: data.expires_at };
    Object.assign(license, await sendLicenseEmail(order.buyer_email, data.school_name, data.access_token, data.expires_at));
  } else {
    license = await createLicense(order.school_name, order.buyer_email, order.duration_months || 1, `Order ${orderId}`);
    const { error: updateError } = await service.from("store_orders").update({
      status: "paid", license_code: license.tenantKey, paid_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }).eq("id", order.id).is("license_code", null);
    if (updateError) throw new ApiError("Lisensi terbit, tetapi pesanan gagal ditautkan. Periksa audit log.", 500);
  }
  await audit(seller, "confirm_order", "order", orderId, context.fingerprint, { tenantKey: license.tenantKey });
  return { ok: true, ...license };
}

async function issueManual(params, seller, context) {
  const school = cleanText(params.school, 160);
  const email = params.email ? validEmail(params.email) : "";
  if (school.length < 3) throw new ApiError("Nama sekolah minimal 3 karakter.");
  const license = await createLicense(school, email, 1, `Manual oleh ${seller.email}`);
  await audit(seller, "issue_manual", "license", license.tenantKey, context.fingerprint, { school, emailed: license.emailed });
  return { ok: true, ...license };
}

async function resendLicense(params, seller, context) {
  const orderId = cleanText(params.orderId, 80);
  const { data: order } = await service.from("store_orders").select("buyer_email,school_name,license_code").eq("order_id", orderId).maybeSingle();
  if (!order?.license_code) throw new ApiError("Lisensi pesanan belum terbit.", 409);
  const { data: license } = await service.from("licenses").select("access_token,expires_at").eq("license_code", order.license_code).maybeSingle();
  if (!license) throw new ApiError("Lisensi tidak ditemukan.", 404);
  const result = await sendLicenseEmail(order.buyer_email, order.school_name, license.access_token, license.expires_at);
  await audit(seller, "resend_license", "order", orderId, context.fingerprint, { emailed: result.emailed });
  return { ok: true, ...result };
}

async function listLicenses() {
  const { data, error } = await service.from("licenses")
    .select("license_code,school_name,status,plan,expires_at,created_at,updated_at")
    .order("created_at", { ascending: false }).limit(300);
  if (error) throw new ApiError("Gagal memuat lisensi.", 500);
  return {
    ok: true,
    licenses: (data || []).map((license) => ({
      tenantKey: license.license_code,
      school: license.school_name,
      status: license.status,
      plan: license.plan,
      expiresAt: license.expires_at,
      createdAt: license.created_at,
      updatedAt: license.updated_at
    }))
  };
}

async function renewLicense(params, seller, context) {
  const tenantKey = cleanText(params.tenantKey, 200);
  const { data: current, error } = await service.from("licenses")
    .select("license_code,school_name,contact_email,expires_at,status,updated_at").eq("license_code", tenantKey).maybeSingle();
  if (error || !current) throw new ApiError("Lisensi tidak ditemukan.", 404);
  const now = new Date();
  const currentExpiry = current.expires_at ? new Date(current.expires_at) : now;
  const base = !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now ? currentExpiry : now;
  const newExpiry = addCalendarMonths(base, 1);
  const signed = await signLicenseUntil(current.school_name, tenantKey, newExpiry);
  const { data: updated, error: updateError } = await service.from("licenses").update({
    access_token: signed.token,
    expires_at: newExpiry.toISOString(),
    status: "active",
    plan: "monthly",
    updated_at: new Date().toISOString()
  }).eq("license_code", tenantKey).eq("updated_at", current.updated_at).select("license_code").maybeSingle();
  if (updateError) throw new ApiError("Gagal memperpanjang lisensi.", 500);
  if (!updated) throw new ApiError("Lisensi berubah bersamaan. Muat ulang lalu coba lagi.", 409);
  const delivery = await sendLicenseEmail(current.contact_email || "", current.school_name, signed.token, newExpiry.toISOString());
  await audit(seller, "renew_license", "license", tenantKey, context.fingerprint, { expiresAt: newExpiry.toISOString(), emailed: delivery.emailed });
  return { ok: true, tenantKey, token: signed.token, expiresAt: newExpiry.toISOString(), ...delivery };
}

async function grantComplimentaryExtension(params, seller, context) {
  if (!new Set(["owner", "seller"]).has(String(seller.role || ""))) {
    throw new ApiError("Akun support tidak boleh memberikan masa aktif gratis.", 403);
  }
  const tenantKey = cleanText(params.tenantKey, 200);
  const days = Number(params.days);
  const reason = cleanText(params.reason, 500);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ApiError("Tambahan gratis harus 1–365 hari.");
  if (reason.length < 5) throw new ApiError("Alasan pemberian waktu gratis wajib diisi minimal 5 karakter.");
  const { data: current, error } = await service.from("licenses")
    .select("license_code,school_name,contact_email,expires_at,updated_at").eq("license_code", tenantKey).maybeSingle();
  if (error || !current) throw new ApiError("Lisensi tidak ditemukan.", 404);
  const now = new Date();
  const currentExpiry = current.expires_at ? new Date(current.expires_at) : now;
  const base = !Number.isNaN(currentExpiry.getTime()) && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  const signed = await signLicenseUntil(current.school_name, tenantKey, newExpiry);
  const { data: applied, error: updateError } = await service.rpc("apply_complimentary_extension", {
    p_license_code: tenantKey,
    p_expected_updated_at: current.updated_at,
    p_access_token: signed.token,
    p_new_expires_at: newExpiry.toISOString(),
    p_days: days,
    p_reason: reason,
    p_actor: seller.user_id
  });
  if (updateError) throw new ApiError("Gagal menambahkan masa aktif gratis.", 500);
  if (!applied) throw new ApiError("Lisensi berubah bersamaan. Muat ulang lalu coba lagi.", 409);
  const delivery = await sendLicenseEmail(current.contact_email || "", current.school_name, signed.token, newExpiry.toISOString());
  await audit(seller, "grant_complimentary_extension", "license", tenantKey, context.fingerprint, {
    days,
    reason,
    previousExpiresAt: current.expires_at || null,
    expiresAt: newExpiry.toISOString(),
    amount: 0,
    emailed: delivery.emailed
  });
  return { ok: true, tenantKey, token: signed.token, days, reason, expiresAt: newExpiry.toISOString(), ...delivery };
}

async function setLicenseStatus(params, seller, context) {
  const tenantKey = cleanText(params.tenantKey, 200);
  const status = cleanText(params.status, 30).toLowerCase();
  if (!new Set(["active", "suspended"]).has(status)) throw new ApiError("Status lisensi tidak valid.");
  const { data, error } = await service.from("licenses").update({ status, updated_at: new Date().toISOString() })
    .eq("license_code", tenantKey).select("license_code").maybeSingle();
  if (error || !data) throw new ApiError("Lisensi tidak ditemukan.", 404);
  if (status === "suspended") {
    await supabaseRevokeTenantSessions(tenantKey);
  }
  await audit(seller, "set_license_status", "license", tenantKey, context.fingerprint, { status });
  return { ok: true, tenantKey, status };
}

async function supabaseRevokeTenantSessions(tenantKey) {
  await service.from("app_sessions").update({ revoked_at: new Date().toISOString() })
    .eq("license_code", tenantKey).is("revoked_at", null);
}

async function route(req, params, context) {
  const action = cleanText(params.action, 80);
  if (action === "health") return {
    ok: true,
    app: "KLAAR Seller API",
    pricingOpen: PRICING_OPEN && MONTHLY_PRICE_IDR > 0,
    monthlyPriceIdr: PRICING_OPEN ? MONTHLY_PRICE_IDR : 0,
    time: new Date().toISOString()
  };
  if (action === "sellerLogin") return await sellerLogin(params, context);
  if (action === "sellerRefresh") return await sellerRefresh(params, context);
  if (action === "createOrder") return await createOrder(params, context);
  if (action === "updatePaymentProof") return await updatePaymentProof(params, context);

  const seller = await sellerFromRequest(req);
  if (action === "listOrders") return await listOrders();
  if (action === "confirmOrder") return await confirmOrder(params, seller, context);
  if (action === "issueManual") return await issueManual(params, seller, context);
  if (action === "resendLicense") return await resendLicense(params, seller, context);
  if (action === "listLicenses") return await listLicenses();
  if (action === "renewLicense") return await renewLicense(params, seller, context);
  if (action === "grantComplimentaryExtension") return await grantComplimentaryExtension(params, seller, context);
  if (action === "setLicenseStatus") return await setLicenseStatus(params, seller, context);
  throw new ApiError(`Action tidak dikenal: ${action || "(kosong)"}`, 404);
}

Deno.serve(async (req) => {
  const origin = String(req.headers.get("origin") || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return respond(req, { ok: false, error: "Origin tidak diizinkan." }, 403);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method === "GET") {
    const action = new URL(req.url).searchParams.get("action") || "";
    if (action !== "health") return respond(req, { ok: false, error: "Gunakan metode POST." }, 405);
    return respond(req, await route(req, { action }, { ip: "health", fingerprint: "" }));
  }
  if (req.method !== "POST") return respond(req, { ok: false, error: "Metode tidak didukung." }, 405);

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new ApiError("Content-Type harus application/json.", 415);
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 32_000) throw new ApiError("Payload terlalu besar.", 413);
    const params = await req.json().catch(() => { throw new ApiError("JSON tidak valid."); });
    const forwarded = String(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const ip = await sha256(forwarded);
    const fingerprint = await sha256(`${forwarded}|${req.headers.get("user-agent") || ""}`);
    const result = await route(req, params || {}, { ip, fingerprint });
    return respond(req, result, 200);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    const message = error instanceof ApiError ? error.message : "Terjadi gangguan server. Coba lagi atau hubungi dukungan.";
    const details = error instanceof ApiError ? error.details : {};
    if (!(error instanceof ApiError)) console.error("seller_handler_error", error);
    return respond(req, { ok: false, error: message, ...details }, status);
  }
});
