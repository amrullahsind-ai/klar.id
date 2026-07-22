import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// ====== CORS (inline, supaya function ini 1 file utuh & bisa di-paste di dashboard) ======
const ALLOWED_ORIGINS = new Set((Deno.env.get("ALLOWED_ORIGINS") || "https://app.klaar.my.id").split(",").map((x)=>x.trim()).filter(Boolean));
function corsHeadersFor_(req) {
  const origin = String(req.headers.get("origin") || "");
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? {
      "Access-Control-Allow-Origin": origin
    } : {}),
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin"
  };
}
function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...extraHeaders,
      "Content-Type": "application/json"
    }
  });
}
// ====== Konstanta (padanan master-apps-script-v5.gs) ======
const DEFAULT_LICENSE = "EDUPAY-DEMO-0001";
const LICENSE_PREFIX = "KLAAR";
const LICENSE_SECRET = Deno.env.get("LICENSE_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const REQUIRE_SIGNED_LICENSE = (Deno.env.get("REQUIRE_SIGNED_LICENSE") ?? "true").toLowerCase() !== "false";
// sha256('1234'+SALT) — sama dgn DEFAULT_ADMIN_HASH di admin.html & master-apps-script-v5.gs.
const DEFAULT_ADMIN_HASH = "d3eecabb3db83dcdf562b12ff510afbfbf351e2a12efda3963e11c0d41c52e93";
const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: {
    persistSession: false
  }
});
// ====== Helper crypto: verifikasi token lisensi (HMAC-SHA256) ======
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8");
function b64urlFromBytes(bytes) {
  let bin = "";
  for (const b of bytes)bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64urlToStr(s) {
  let b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while(b64.length % 4)b64 += "=";
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c)=>c.charCodeAt(0));
  return dec.decode(bytes);
}
async function hmacB64url(payloadStr) {
  const key = await crypto.subtle.importKey("raw", enc.encode(LICENSE_SECRET), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadStr));
  return b64urlFromBytes(new Uint8Array(sig));
}
async function verifyLicenseToken(token) {
  try {
    token = String(token || "").trim();
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== LICENSE_PREFIX) {
      return {
        ok: false,
        error: "format token salah"
      };
    }
    const payloadStr = unb64urlToStr(parts[1]);
    const expected = await hmacB64url(payloadStr);
    const got = parts[2];
    if (expected.length !== got.length) {
      return {
        ok: false,
        error: "tanda tangan salah"
      };
    }
    let diff = 0;
    for(let i = 0; i < expected.length; i++){
      diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
    }
    if (diff !== 0) return {
      ok: false,
      error: "tanda tangan salah"
    };
    const payload = JSON.parse(payloadStr);
    if (!payload || !payload.school) {
      return {
        ok: false,
        error: "payload tanpa school"
      };
    }
    return {
      ok: true,
      school: String(payload.school),
      plan: String(payload.plan || ""),
      iat: payload.iat || ""
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err?.message || err)
    };
  }
}

const SELFIE_BUCKET = "selfies";
const SELFIE_URL_TTL_SECONDS = 15 * 60;

async function sha256Hex_(value) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(value || "")));
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2, "0")).join("");
}

async function selfieTenantPrefix_(licenseCode) {
  return `tenant/${await sha256Hex_(licenseCode)}`;
}

async function safeSelfiePath_(licenseCode, candidate) {
  const path = String(candidate || "").trim();
  const prefix = await selfieTenantPrefix_(licenseCode);
  return path.startsWith(prefix + "/") ? path : "";
}

async function signSelfiePaths_(licenseCode, paths) {
  const prefix = await selfieTenantPrefix_(licenseCode);
  const clean = [
    ...new Set((paths || []).map((x)=>String(x || "").trim()).filter((x)=>x.startsWith(prefix + "/")))
  ];
  const signed = new Map();
  for(let i = 0; i < clean.length; i += 100){
    const chunk = clean.slice(i, i + 100);
    const { data, error } = await supabase.storage.from(SELFIE_BUCKET).createSignedUrls(chunk, SELFIE_URL_TTL_SECONDS);
    if (error) throw error;
    (data || []).forEach((item, index)=>{
      const path = String(item?.path || chunk[index] || "");
      const url = String(item?.signedUrl || "");
      if (path && url) signed.set(path, url);
    });
  }
  return signed;
}

function collectAttendanceWithSelfies_(node, out, depth = 0) {
  if (!node || typeof node !== "object" || depth > 4) return;
  if (node.checkInSelfiePath || node.checkOutSelfiePath) out.push(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectAttendanceWithSelfies_(value, out, depth + 1);
  }
}

async function hydrateAttendanceSelfieUrls_(licenseCode, attendanceRecords) {
  const records = [];
  collectAttendanceWithSelfies_(attendanceRecords, records);
  if (!records.length) return;
  const paths = [];
  for (const record of records){
    if (record.checkInSelfiePath) paths.push(record.checkInSelfiePath);
    if (record.checkOutSelfiePath) paths.push(record.checkOutSelfiePath);
  }
  const signed = await signSelfiePaths_(licenseCode, paths);
  for (const record of records){
    record.checkInSelfieUrl = signed.get(String(record.checkInSelfiePath || "")) || "";
    record.checkOutSelfieUrl = signed.get(String(record.checkOutSelfiePath || "")) || "";
  }
}
async function log_(action, licenseCode, message) {
  try {
    await supabase.from("logs").insert({
      action,
      license_code: licenseCode,
      message: String(message || "").slice(0, 500)
    });
  } catch (_e) {
  /* logging tidak boleh menggagalkan request */ }
}
async function ensureLicenseRow(licenseCode, schoolName) {
  // Auto-provision: buat baris licenses jika belum ada (padanan ensureDemoLicense_).
  const { data } = await supabase.from("licenses").select("license_code").eq("license_code", licenseCode).maybeSingle();
  if (!data) {
    await supabase.from("licenses").insert({
      license_code: licenseCode,
      school_name: schoolName || "",
      status: "active",
      notes: "Auto-provision oleh Edge Function"
    });
  }
}
async function getRow(licenseCode) {
  const { data, error } = await supabase.from("databases").select("payload, updated_at").eq("license_code", licenseCode).maybeSingle();
  if (error) throw error;
  return data;
}
async function loadPayload(licenseCode) {
  const row = await getRow(licenseCode);
  if (!row) return null;
  return normalizeDb(row.payload || {}, licenseCode);
}
// Full-replace (dipakai loadAdmin auto-create & saveAdmin). Kembalikan payload tersimpan.
async function upsertPayload(licenseCode, data) {
  const { data: out, error } = await supabase.from("databases").upsert({
    license_code: licenseCode,
    payload: data,
    updated_at: new Date().toISOString()
  }, {
    onConflict: "license_code"
  }).select("payload").single();
  if (error) throw error;
  return out.payload;
}
// Compare-and-swap: hanya menulis bila updated_at belum berubah (optimistic lock,
// pengganti LockService). Kembalikan true bila menang.
async function savePayloadCAS(licenseCode, data, prevUpdatedAt) {
  const { data: out, error } = await supabase.from("databases").update({
    payload: data,
    updated_at: new Date().toISOString()
  }).eq("license_code", licenseCode).eq("updated_at", prevUpdatedAt).select("license_code");
  if (error) throw error;
  return !!(out && out.length > 0);
}
// Read-modify-write aman-konkurensi (padanan withDB_ + LockService).
async function withDB(licenseCode, fn) {
  for(let attempt = 0; attempt < 6; attempt++){
    const row = await getRow(licenseCode);
    if (!row) throw new Error("Database belum ada. Sync dari Admin dulu.");
    const db = normalizeDb(row.payload || {}, licenseCode);
    const result = fn(db) || {};
    const won = await savePayloadCAS(licenseCode, db, row.updated_at);
    if (won) return result;
  // kalah balapan -> ulangi dgn data terbaru
  }
  throw new Error("Konflik penyimpanan berulang. Coba lagi.");
}
// ====== Normalisasi & default DB (port apa adanya) ======
function normalizeDb(data, licenseCode) {
  if (!data || typeof data !== "object" || Array.isArray(data)) data = {};
  data.employees = Array.isArray(data.employees) ? data.employees : [];
  data.positions = Array.isArray(data.positions) ? data.positions : [];
  data.grades = Array.isArray(data.grades) ? data.grades : [];
  data.components = Array.isArray(data.components) ? data.components : [];
  data.attendanceRecords = data.attendanceRecords && typeof data.attendanceRecords === "object" ? data.attendanceRecords : {};
  data.attendanceRequests = Array.isArray(data.attendanceRequests) ? data.attendanceRequests : [];
  data.deviceRequests = Array.isArray(data.deviceRequests) ? data.deviceRequests : [];
  data.attendanceRules = data.attendanceRules && typeof data.attendanceRules === "object" ? data.attendanceRules : {};
  data.locks = data.locks && typeof data.locks === "object" ? data.locks : {};
  data.sentSlips = data.sentSlips && typeof data.sentSlips === "object" ? data.sentSlips : {};
  data.payrollOverrides = data.payrollOverrides && typeof data.payrollOverrides === "object" ? data.payrollOverrides : {};
  data.importedPayrollSnapshots = data.importedPayrollSnapshots && typeof data.importedPayrollSnapshots === "object" ? data.importedPayrollSnapshots : {};
  data.payrollInputDefinitions = Array.isArray(data.payrollInputDefinitions) ? data.payrollInputDefinitions : [];
  data.periodInputs = data.periodInputs && typeof data.periodInputs === "object" ? data.periodInputs : {};
  data.importBatches = Array.isArray(data.importBatches) ? data.importBatches : [];
  data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
  data.backupLogs = Array.isArray(data.backupLogs) ? data.backupLogs : [];
  data.importHistory = Array.isArray(data.importHistory) ? data.importHistory : [];
  data.settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  data.attendanceRules.autoAlphaEnabled = data.attendanceRules.autoAlphaEnabled === true;
  data.attendanceRules.autoAlphaAt = data.attendanceRules.autoAlphaAt || "09:30";
  data.attendanceRules.autoAlphaGraceMinutes = Math.max(0, Number(data.attendanceRules.autoAlphaGraceMinutes ?? 30));
  data.attendanceRules.timezone = data.attendanceRules.timezone || "Asia/Jakarta";
  data.attendanceRules.autoAlphaWorkDays = Array.isArray(data.attendanceRules.autoAlphaWorkDays) ? data.attendanceRules.autoAlphaWorkDays.map(Number) : [1, 2, 3, 4, 5, 6];
  data.attendanceRules.autoAlphaExcludedDates = Array.isArray(data.attendanceRules.autoAlphaExcludedDates) ? data.attendanceRules.autoAlphaExcludedDates.map(String) : [];
  if (!data.settings.school) {
    data.settings.school = schoolNameFromLicense_local(licenseCode) || "Klaar";
  }
  if (!data.settings.adminUser) data.settings.adminUser = "admin";
  if (!data.settings.adminHash) data.settings.adminHash = DEFAULT_ADMIN_HASH;
  return data;
}
// Catatan: nama sekolah dari licenses diambil async di pemanggil; di sini fallback saja.
function schoolNameFromLicense_local(_licenseCode) {
  return "";
}
function defaultDb(licenseCode, schoolName) {
  return normalizeDb({
    version: "supabase",
    settings: {
      school: schoolName && schoolName !== "DEMO" ? schoolName : "Klaar Demo",
      yayasan: "",
      logo: "",
      primary: "#085842",
      accent: "#39AE89",
      adminUser: "admin",
      adminHash: DEFAULT_ADMIN_HASH
    },
    employees: [],
    positions: [],
    grades: [],
    components: [],
    deductions: [],
    attendanceRecords: {},
    attendanceRequests: [],
    attendanceRules: {},
    deviceRequests: [],
    locks: {},
    sentSlips: {},
    payrollOverrides: {},
    importedPayrollSnapshots: {},
    payrollInputDefinitions: [],
    periodInputs: {},
    importBatches: [],
    auditLogs: [],
    backupLogs: [],
    importHistory: [],
    _createdAt: new Date().toISOString(),
    _note: "Database dibuat/diperbaiki otomatis oleh Klaar (Supabase)"
  }, licenseCode);
}
// ====== Admin credential ======
function checkAdmin(db, p) {
  const s = db && db.settings || {};
  const curUser = String(s.adminUser || "admin").trim();
  const curHash = String(s.adminHash || "") || DEFAULT_ADMIN_HASH;
  const user = String(p && p.adminUser || "").trim();
  const hash = String(p && p.adminHash || "");
  if (!hash) return false;
  if (user && curUser && user.toLowerCase() !== curUser.toLowerCase()) {
    return false;
  }
  return hash === curHash;
}
// ====== Pencarian karyawan (port) ======
function norm_(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function flex_(s) {
  return norm_(s).replace(/[^a-z0-9]/g, "");
}
function findEmployee(db, login) {
  const q = norm_(login), f = flex_(login);
  const emps = db.employees || [];
  return emps.find((e)=>flex_(e.nip) === f || flex_(e.loginName) === f || flex_(e.name) === f || flex_(e.slipCode) === f || norm_(e.nip) === q || norm_(e.loginName) === q || norm_(e.name) === q || norm_(e.slipCode) === q);
}
function checkEmployee(db, p) {
  const emp = findEmployee(db, p.nip || p.login || p.username || "");
  if (!emp) {
    throw new Error("Karyawan tidak ditemukan. Coba login pakai NIP/Login/Nama/Kode yang tertulis di Admin.");
  }
  if ([
    "nonaktif",
    "arsip"
  ].indexOf(String(emp.status || "Aktif").toLowerCase()) >= 0) {
    throw new Error("Akun karyawan nonaktif/arsip.");
  }
  const expected = String(emp.employeePinHash || "");
  const effective = expected || DEFAULT_ADMIN_HASH;
  if (String(p.pinHash || "") !== effective) {
    throw new Error("Username atau password salah. Untuk karyawan hasil import, default biasanya 1234.");
  }
  return emp;
}
// ====== Geofence GPS (port) ======
function haversine_(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (d)=>d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
function activeLocations_(db) {
  const r = db && db.attendanceRules || {};
  let locs = Array.isArray(r.locations) ? r.locations.filter((l)=>l && l.active !== false && Number(l.lat) && Number(l.lng)) : [];
  if (!locs.length && Number(r.lat) && Number(r.lng)) {
    locs = [
      {
        id: "loc_primary",
        name: r.name || "Sekolah",
        lat: r.lat,
        lng: r.lng,
        radiusMeters: r.radiusMeters || 80,
        maxAccuracyMeters: r.maxAccuracyMeters || 120
      }
    ];
  }
  return locs;
}
// deno-lint-ignore no-explicit-any
function geofenceCheck_(db, lat, lng, accuracy) {
  const r = db && db.attendanceRules || {};
  const enforce = r.geofence !== false;
  const locs = activeLocations_(db);
  if (!locs.length) {
    return {
      ok: true,
      skip: true,
      distanceMeters: null,
      locationName: ""
    };
  }
  let best = null;
  locs.forEach((l)=>{
    const d = haversine_(Number(lat), Number(lng), Number(l.lat), Number(l.lng));
    if (!best || d < best.dist) best = {
      dist: d,
      loc: l
    };
  });
  best = best;
  const maxAcc = Number(best.loc.maxAccuracyMeters || r.maxAccuracyMeters || 120);
  const radius = Number(best.loc.radiusMeters || r.radiusMeters || 80);
  const info = {
    ok: true,
    distanceMeters: Math.round(best.dist),
    locationName: best.loc.name || "",
    radius: radius
  };
  if (!enforce) return info;
  if (!Number(lat) || !Number(lng)) {
    return {
      ok: false,
      error: "Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi."
    };
  }
  if (accuracy && maxAcc && Number(accuracy) > maxAcc) {
    return {
      ok: false,
      error: "Akurasi GPS terlalu rendah (" + Math.round(accuracy) + "m, maksimal " + maxAcc + "m). Coba di area terbuka."
    };
  }
  if (best.dist > radius) {
    return {
      ok: false,
      error: "Di luar radius lokasi: " + Math.round(best.dist) + "m dari " + (best.loc.name || "titik absensi") + " (maksimal " + radius + "m)."
    };
  }
  return info;
}
// ====== Telat / normalisasi record (port) ======
function timeToMin_(hhmm) {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function lateInfo_(db, now) {
  const rules = db && db.attendanceRules || {};
  const lateAfter = rules.lateAfter || "07:15";
  const approvalAfter = rules.lateApprovalAfter || "08:30";
  const n = timeToMin_(now), l = timeToMin_(lateAfter), a = timeToMin_(approvalAfter);
  const isLate = n !== null && l !== null && n > l;
  return {
    isLate,
    minutes: isLate ? n - l : 0,
    lateAfter,
    lateApprovalAfter: approvalAfter,
    needsApproval: isLate && a !== null && n > a
  };
}
function normalizeLateRecord_(db, r) {
  if (!r || !r.checkInTime) return r;
  const st = String(r.status || "").toLowerCase();
  if ([
    "izin",
    "sakit",
    "alpha",
    "pending"
  ].indexOf(st) >= 0) return r;
  if (r.lateApproved || r.lateOverride || r.lateStatus === "approved" || r.lateManuallyApproved) {
    r.status = "hadir";
    r.isLate = false;
    return r;
  }
  const late = lateInfo_(db, r.checkInTime);
  if (late.isLate) {
    r.status = "telat";
    r.isLate = true;
    r.lateMinutes = late.minutes;
    r.lateAfter = late.lateAfter;
    r.lateApprovalAfter = late.lateApprovalAfter;
    r.needsLateApproval = late.needsApproval;
    if (!r.message) {
      r.message = "Check-in telat " + (late.minutes ? "+" + late.minutes + " menit" : "");
    }
  }
  return r;
}
function normalizeAllLateRecords_(db) {
  let changed = false;
  const recs = db.attendanceRecords || {};
  Object.keys(recs).forEach((date)=>{
    Object.keys(recs[date] || {}).forEach((empId)=>{
      const r = recs[date][empId];
      const before = JSON.stringify({
        s: r?.status,
        l: r?.isLate,
        m: r?.lateMinutes,
        a: r?.lateAfter
      });
      normalizeLateRecord_(db, r);
      const after = JSON.stringify({
        s: r?.status,
        l: r?.isLate,
        m: r?.lateMinutes,
        a: r?.lateAfter
      });
      if (before !== after) changed = true;
    });
  });
  return changed;
}
// ====== View karyawan (port) ======
function latestSlip_(db, empId) {
  const sent = db.sentSlips || {}, locks = db.locks || {};
  const months = Object.keys(sent).sort().reverse();
  for (const m of months){
    if (sent[m] && sent[m][empId] && locks[m] && locks[m].items) {
      const it = locks[m].items.find((x)=>x.id === empId);
      if (it) return Object.assign({
        month: m
      }, it);
    }
  }
  return null;
}
function years_(join, imported) {
  if (imported) return imported;
  if (!join) return 0;
  const a = new Date(join), b = new Date();
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || b.getMonth() === a.getMonth() && b.getDate() < a.getDate()) y--;
  return Math.max(0, y);
}
function empView_(db, emp) {
  const d = today_(db.attendanceRules?.timezone);
  const recs = db.attendanceRecords || {};
  const todayRecord = normalizeLateRecord_(db, (recs[d] || {})[emp.id] || null);
  const pos = (db.positions || []).find((x)=>x.id === emp.position) || {};
  const gr = (db.grades || []).find((x)=>x.id === emp.grade) || {};
  const hist = Object.keys(recs).sort().reverse().slice(0, 40).map((date)=>Object.assign({
      date
    }, (recs[date] || {})[emp.id] || {})).filter((x)=>x.status);
  const slip = latestSlip_(db, emp.id);
  return {
    ok: true,
    employee: Object.assign({}, emp, {
      positionName: pos.name || "",
      gradeName: gr.name || "",
      years: years_(emp.join, emp.yearsImported)
    }),
    school: (db.settings || {}).school || "Klaar",
    todayRecord,
    history: hist,
    slip,
    todayRequest: (db.attendanceRequests || []).find((r)=>r.employeeId === emp.id && r.date === d && r.status === "pending") || null,
    deviceStatus: "aktif"
  };
}
// ====== Waktu (Asia/Jakarta) ======
function jakartaParts(timeZone = "Asia/Jakarta") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date()))p[part.type] = part.value;
  return p;
}
function today_(timeZone = "Asia/Jakarta") {
  const p = jakartaParts(timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}
function time_(timeZone = "Asia/Jakarta") {
  const p = jakartaParts(timeZone);
  const hh = p.hour === "24" ? "00" : p.hour;
  return `${hh}:${p.minute}`;
}
async function loadAdmin_(licenseCode, p, tokenSchool) {
  await ensureLicenseRow(licenseCode, tokenSchool);
  let data = await loadPayload(licenseCode);
  if (!data) {
    data = defaultDb(licenseCode, tokenSchool);
    await upsertPayload(licenseCode, data);
  }
  if (!checkAdmin(data, p)) {
    await log_("loadAdmin_denied", licenseCode, "kredensial admin salah");
    return {
      ok: false,
      error: "Username/PIN admin salah."
    };
  }
  // Merge relational attendance records
  const { data: recRows } = await supabase.from("attendance_records").select("attendance_date, employee_id, payload").eq("license_code", licenseCode);
  data.attendanceRecords = data.attendanceRecords || {};
  if (recRows) {
    for (const r of recRows){
      data.attendanceRecords[r.attendance_date] = data.attendanceRecords[r.attendance_date] || {};
      data.attendanceRecords[r.attendance_date][r.employee_id] = r.payload;
    }
  }
  const { data: reqRows } = await supabase.from("attendance_requests").select("payload").eq("license_code", licenseCode);
  data.attendanceRequests = reqRows ? reqRows.map((x)=>x.payload) : [];
  if (normalizeAllLateRecords_(data)) await upsertPayload(licenseCode, data);
  await hydrateAttendanceSelfieUrls_(licenseCode, data.attendanceRecords);
  const out = JSON.parse(JSON.stringify(data));
  if (out.settings) delete out.settings.adminHash;
  return {
    ok: true,
    license: {
      licenseCode,
      status: "active"
    },
    data: out
  };
}
async function saveAdmin_(licenseCode, payloadStr, p, tokenSchool) {
  await ensureLicenseRow(licenseCode, tokenSchool);
  const existing = await loadPayload(licenseCode);
  if (!checkAdmin(existing || {}, p)) {
    await log_("saveAdmin_denied", licenseCode, "kredensial admin salah");
    return {
      ok: false,
      error: "Username/PIN admin salah. Sync ditolak."
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(payloadStr || "{}");
  } catch (err) {
    throw new Error("Payload admin bukan JSON valid: " + String(err?.message || err));
  }
  const data = normalizeDb(parsed, licenseCode);
  const es = existing && existing.settings || {};
  if (es.adminHash) {
    data.settings.adminUser = es.adminUser || data.settings.adminUser;
    data.settings.adminHash = es.adminHash;
  }
  normalizeAllLateRecords_(data);
  data._serverUpdatedAt = new Date().toISOString();
  const expectEmp = Array.isArray(data.employees) ? data.employees.length : 0;
  // Process relational delta for attendance
  const delAtt = parsed._deletedAttendance || [];
  for (const { date, empId } of delAtt){
    await supabase.from("attendance_records").delete().eq("license_code", licenseCode).eq("attendance_date", date).eq("employee_id", empId);
  }
  const recs = parsed.attendanceRecords || {};
  for (const date of Object.keys(recs)){
    for (const empId of Object.keys(recs[date])){
      const r = recs[date][empId];
      if (r && String(r.source).startsWith("admin")) {
        await supabase.from("attendance_records").upsert({
          license_code: licenseCode,
          attendance_date: date,
          employee_id: empId,
          payload: r,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "license_code, attendance_date, employee_id"
        });
      }
    }
  }
  const reqs = parsed.attendanceRequests || [];
  for (const r of reqs){
    if (r.id) {
      await supabase.from("attendance_requests").upsert({
        id: r.id,
        license_code: licenseCode,
        employee_id: r.employeeId,
        attendance_date: r.date,
        payload: r
      }, {
        onConflict: "id"
      });
    }
  }
  // Remove relational properties before saving JSON blob
  delete data.attendanceRecords;
  delete data.attendanceRequests;
  delete data._deletedAttendance;
  const saved = await upsertPayload(licenseCode, data);
  const savedEmp = Array.isArray(saved.employees) ? saved.employees.length : -1;
  if (savedEmp !== expectEmp) {
    await log_("saveAdmin_verify_fail", licenseCode, "harusnya " + expectEmp + " karyawan, tersimpan " + savedEmp);
    return {
      ok: false,
      error: "Verifikasi server gagal: harusnya " + expectEmp + " karyawan, tersimpan " + savedEmp + "."
    };
  }
  await log_("saveAdmin", licenseCode, "payload saved & verified (" + savedEmp + " karyawan)");
  return {
    ok: true,
    message: "Data tersimpan & terverifikasi",
    employees: savedEmp,
    serverUpdatedAt: data._serverUpdatedAt
  };
}
async function changeAdminCredential_(licenseCode, p) {
  return await withDB(licenseCode, (db)=>{
    db.settings = db.settings || {};
    const curUser = String(db.settings.adminUser || "admin").trim();
    const curHash = String(db.settings.adminHash || "") || DEFAULT_ADMIN_HASH;
    const oldUser = String(p.oldUser || "").trim(), oldHash = String(p.oldHash || "");
    if (oldHash !== curHash || oldUser && curUser && oldUser.toLowerCase() !== curUser.toLowerCase()) {
      throw new Error("Username/PIN lama salah.");
    }
    const newUser = String(p.newUser || "").trim(), newHash = String(p.newHash || "");
    if (!newUser || !newHash) throw new Error("Username/PIN baru belum lengkap.");
    db.settings.adminUser = newUser;
    db.settings.adminHash = newHash;
    return {
      ok: true,
      message: "Kredensial admin berhasil diganti."
    };
  }).catch((e)=>({
      ok: false,
      error: String(e?.message || e)
    }));
}
async function loadEmployee_(licenseCode, p) {
  const db = await loadPayload(licenseCode);
  if (!db) throw new Error("Database belum ada. Sync dari Admin dulu.");
  const emp = checkEmployee(db, p);
  const { data: recs } = await supabase.from("attendance_records").select("attendance_date, payload").eq("license_code", licenseCode).eq("employee_id", emp.id);
  db.attendanceRecords = {};
  if (recs) {
    for (const r of recs){
      db.attendanceRecords[r.attendance_date] = db.attendanceRecords[r.attendance_date] || {};
      db.attendanceRecords[r.attendance_date][emp.id] = r.payload;
    }
  }
  await hydrateAttendanceSelfieUrls_(licenseCode, db.attendanceRecords);
  const { data: reqs } = await supabase.from("attendance_requests").select("payload").eq("license_code", licenseCode).eq("employee_id", emp.id);
  db.attendanceRequests = reqs ? reqs.map((x)=>x.payload) : [];
  return empView_(db, emp);
}
async function employeeChangePassword_(licenseCode, p) {
  return await withDB(licenseCode, (db)=>{
    const emp = checkEmployee(db, p);
    emp.employeePinHash = p.newHash;
    emp.updatedAt = new Date().toISOString();
    return {
      ok: true,
      message: "Password berhasil diganti"
    };
  }).catch((e)=>({
      ok: false,
      error: String(e?.message || e)
    }));
}
async function employeeCheckIn_(licenseCode, p) {
  try {
    const db = await loadPayload(licenseCode);
    if (!db) throw new Error("Database belum ada.");
    const emp = checkEmployee(db, p);
    const schoolTimezone = db.attendanceRules?.timezone || "Asia/Jakarta";
    const d = today_(schoolTimezone);
    const { data: existing } = await supabase.from("attendance_records").select("payload").eq("license_code", licenseCode).eq("attendance_date", d).eq("employee_id", emp.id).maybeSingle();
    if (existing && existing.payload && existing.payload.checkInTime) {
      throw new Error("Sudah check-in hari ini.");
    }
    const lat = Number(p.lat || 0), lng = Number(p.lng || 0), accuracy = Number(p.accuracy || 0);
    const geo = geofenceCheck_(db, lat, lng, accuracy);
    if (!geo.ok) throw new Error(geo.error);
    const now = time_(schoolTimezone);
    const late = lateInfo_(db, now);
    const selfiePath = await safeSelfiePath_(licenseCode, p.selfiePath);
    const r = {
      status: late.isLate ? "telat" : "hadir",
      date: d,
      checkInTime: now,
      lat,
      lng,
      accuracy,
      distanceMeters: geo.distanceMeters != null ? geo.distanceMeters : null,
      locationName: geo.locationName || "",
      source: "employee",
      isLate: late.isLate,
      lateMinutes: late.minutes,
      lateAfter: late.lateAfter,
      lateApprovalAfter: late.lateApprovalAfter,
      needsLateApproval: late.needsApproval,
      message: late.isLate ? "Check-in berhasil, status TELAT " + (late.minutes ? "(" + late.minutes + " menit)" : "") + "." : "Check-in berhasil",
      checkInSelfiePath: selfiePath,
      checkInSelfieUrl: "",
      checkInSelfieThumbUrl: p.selfieThumbUrl || ""
    };
    const { error } = await supabase.from("attendance_records").upsert({
      license_code: licenseCode,
      attendance_date: d,
      employee_id: emp.id,
      payload: r,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "license_code, attendance_date, employee_id"
    });
    if (error) throw new Error("Gagal menyimpan absen: " + error.message);
    if (selfiePath) {
      const signed = await signSelfiePaths_(licenseCode, [selfiePath]);
      r.checkInSelfieUrl = signed.get(selfiePath) || "";
    }
    return {
      ok: true,
      record: r
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
async function employeeCheckOut_(licenseCode, p) {
  try {
    const db = await loadPayload(licenseCode);
    if (!db) throw new Error("Database belum ada.");
    const emp = checkEmployee(db, p);
    const schoolTimezone = db.attendanceRules?.timezone || "Asia/Jakarta";
    const d = today_(schoolTimezone);
    const { data: existing } = await supabase.from("attendance_records").select("payload").eq("license_code", licenseCode).eq("attendance_date", d).eq("employee_id", emp.id).maybeSingle();
    if (!existing || !existing.payload || !existing.payload.checkInTime) throw new Error("Belum check-in.");
    if (existing.payload.checkOutTime) throw new Error("Sudah check-out.");
    const r = existing.payload;
    r.checkOutTime = time_(schoolTimezone);
    r.checkoutLat = Number(p.lat || 0);
    r.checkoutLng = Number(p.lng || 0);
    r.checkoutAccuracy = Number(p.accuracy || 0);
    r.checkoutMessage = "Check-out berhasil";
    const selfiePath = await safeSelfiePath_(licenseCode, p.selfiePath);
    if (selfiePath) {
      r.checkOutSelfiePath = selfiePath;
      r.checkOutSelfieUrl = "";
    }
    if (p.selfieThumbUrl) r.checkOutSelfieThumbUrl = p.selfieThumbUrl;
    const { error } = await supabase.from("attendance_records").upsert({
      license_code: licenseCode,
      attendance_date: d,
      employee_id: emp.id,
      payload: r,
      updated_at: new Date().toISOString()
    }, {
      onConflict: "license_code, attendance_date, employee_id"
    });
    if (error) throw new Error("Gagal menyimpan absen: " + error.message);
    if (selfiePath) {
      const signed = await signSelfiePaths_(licenseCode, [selfiePath]);
      r.checkOutSelfieUrl = signed.get(selfiePath) || "";
    }
    return {
      ok: true,
      record: r
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
async function employeeRequest_(licenseCode, p) {
  try {
    const db = await loadPayload(licenseCode);
    if (!db) throw new Error("Database belum ada.");
    const emp = checkEmployee(db, p);
    const r = {
      id: "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      employeeId: emp.id,
      employeeName: emp.name,
      date: p.date || today_(db.attendanceRules?.timezone),
      type: p.type || "izin",
      status: "pending",
      reason: p.reason || "",
      proof: p.proof || "",
      createdAt: new Date().toISOString()
    };
    const { error } = await supabase.from("attendance_requests").insert({
      id: r.id,
      license_code: licenseCode,
      employee_id: emp.id,
      attendance_date: r.date,
      payload: r
    });
    if (error) throw new Error("Gagal menyimpan pengajuan: " + error.message);
    return {
      ok: true,
      record: r,
      message: "Pengajuan dikirim"
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
// ====== Upload Selfie ke Supabase Storage ======
async function uploadSelfie_(licenseCode, p) {
  try {
    const db = await loadPayload(licenseCode);
    if (!db) throw new Error("Database belum ada.");
    const emp = checkEmployee(db, p);
    const base64Data = String(p.photoBase64 || "");
    if (!base64Data || base64Data.length < 100) {
      throw new Error("Data foto tidak valid.");
    }
    // Decode base64 → Uint8Array
    // Format: data:image/jpeg;base64,<data> atau langsung base64
    let b64 = base64Data;
    if (b64.includes(",")) b64 = b64.split(",")[1];
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for(let i = 0; i < binaryStr.length; i++)bytes[i] = binaryStr.charCodeAt(i);
    const sizeKB = Math.round(bytes.length / 1024);
    if (bytes.length > 3 * 1024 * 1024) {
      throw new Error("Ukuran foto terlalu besar (maksimal 3MB). Harap kompres terlebih dahulu.");
    }
    const d = today_(db.attendanceRules?.timezone);
    const ts = Date.now();
    const type = String(p.selfieType || "checkin"); // 'checkin' | 'checkout'
    const fileName = `${emp.id}_${type}_${ts}.jpg`;
    const storagePath = `${await selfieTenantPrefix_(licenseCode)}/${d}/${fileName}`;
    // Upload ke Supabase Storage bucket 'selfies'
    const { error: uploadErr } = await supabase.storage.from(SELFIE_BUCKET).upload(storagePath, bytes, {
      contentType: "image/jpeg",
      upsert: true
    });
    if (uploadErr) {
      // Jika bucket belum ada, beri pesan yang jelas
      if (String(uploadErr.message).toLowerCase().includes("bucket") || String(uploadErr.message).toLowerCase().includes("not found")) {
        throw new Error("Bucket selfie privat belum tersedia. Hubungi administrator sistem.");
      }
      throw new Error("Upload foto gagal: " + uploadErr.message);
    }
    // URL hanya berlaku sementara; bucket tidak boleh dibuat publik.
    const { data: signedData, error: signedError } = await supabase.storage.from(SELFIE_BUCKET).createSignedUrl(storagePath, SELFIE_URL_TTL_SECONDS);
    if (signedError) throw signedError;
    const selfieUrl = signedData?.signedUrl || "";
    // Simpan metadata ke tabel attendance_selfies
    const watermarkText = String(p.watermarkText || "").slice(0, 500);
    const { error: metaError } = await supabase.from("attendance_selfies").insert({
      license_code: licenseCode,
      employee_id: emp.id,
      employee_name: emp.name || "",
      attendance_date: d,
      type,
      selfie_url: "",
      storage_path: storagePath,
      lat: Number(p.lat || 0) || null,
      lng: Number(p.lng || 0) || null,
      accuracy: Number(p.accuracy || 0) || null,
      location_name: String(p.locationName || "").slice(0, 200),
      watermark_text: watermarkText,
      file_size_bytes: bytes.length,
      captured_at: new Date().toISOString()
    });
    if (metaError) throw metaError;
    await log_("uploadSelfie", licenseCode, `${emp.name} (${type}) ${d} - ${sizeKB}KB`);
    return {
      ok: true,
      selfieUrl,
      storagePath,
      sizeKB
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
// ====== Admin: ambil metadata selfie absensi ======
async function getSelfieMeta_(licenseCode, p, tokenSchool) {
  try {
    await ensureLicenseRow(licenseCode, tokenSchool);
    const existing = await loadPayload(licenseCode);
    if (!checkAdmin(existing || {}, p)) {
      return {
        ok: false,
        error: "Admin auth gagal."
      };
    }
    const dateFilter = String(p.date || "");
    const empFilter = String(p.employeeId || "");
    // deno-lint-ignore no-explicit-any
    let query = supabase.from("attendance_selfies").select("id,employee_id,employee_name,attendance_date,type,selfie_url,storage_path,lat,lng,accuracy,location_name,watermark_text,file_size_bytes,captured_at").eq("license_code", licenseCode).order("captured_at", {
      ascending: false
    }).limit(200);
    if (dateFilter) query = query.eq("attendance_date", dateFilter);
    if (empFilter) query = query.eq("employee_id", empFilter);
    const { data, error } = await query;
    if (error) throw error;
    const selfies = data || [];
    const signed = await signSelfiePaths_(licenseCode, selfies.map((x)=>x.storage_path));
    for (const selfie of selfies){
      selfie.selfie_url = signed.get(String(selfie.storage_path || "")) || "";
      delete selfie.storage_path;
    }
    return {
      ok: true,
      selfies
    };
  } catch (e) {
    return {
      ok: false,
      error: String(e?.message || e)
    };
  }
}
async function archiveEmployee_(licenseCode, empId, p) {
  return await withDB(licenseCode, (db)=>{
    if (!checkAdmin(db, p)) throw new Error("Admin auth gagal.");
    const emp = (db.employees || []).find((e)=>e.id === empId);
    if (!emp) return {
      ok: false,
      error: "Karyawan tidak ditemukan"
    };
    emp.status = "Arsip";
    emp.archivedAt = new Date().toISOString();
    db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : [];
    db.auditLogs.unshift({
      id: "log_" + Date.now(),
      at: new Date().toISOString(),
      action: "archive_employee",
      message: "Karyawan diarsipkan: " + (emp.name || emp.nip || empId),
      meta: {
        employeeId: empId
      }
    });
    db.auditLogs = db.auditLogs.slice(0, 300);
    return {
      ok: true,
      message: "Karyawan diarsipkan"
    };
  }).catch((e)=>({
      ok: false,
      error: String(e?.message || e)
    }));
}
async function deleteEmployee_(licenseCode, empId, p) {
  return await withDB(licenseCode, (db)=>{
    if (!checkAdmin(db, p)) throw new Error("Admin auth gagal.");
    db._deletedEmployees = db._deletedEmployees || [];
    if (empId && db._deletedEmployees.indexOf(empId) < 0) db._deletedEmployees.push(empId);
    db.employees = (db.employees || []).filter((e)=>e.id !== empId);
    Object.keys(db.attendanceRecords || {}).forEach((d)=>{
      if (db.attendanceRecords[d]) delete db.attendanceRecords[d][empId];
    });
    db.attendanceRequests = (db.attendanceRequests || []).filter((r)=>r.employeeId !== empId);
    db.deviceRequests = (db.deviceRequests || []).filter((r)=>r.employeeId !== empId);
    Object.keys(db.locks || {}).forEach((m)=>{
      if (db.locks[m] && db.locks[m].items) {
        db.locks[m].items = db.locks[m].items.filter((x)=>x.id !== empId);
      }
    });
    Object.keys(db.sentSlips || {}).forEach((m)=>{
      if (db.sentSlips[m]) delete db.sentSlips[m][empId];
    });
    return {
      ok: true,
      message: "Karyawan dihapus"
    };
  }).catch((e)=>({
      ok: false,
      error: String(e?.message || e)
    }));
}
async function approveLateAsPresent_(licenseCode, empId, date, p) {
  return await withDB(licenseCode, (db)=>{
    if (!checkAdmin(db, p)) throw new Error("Admin auth gagal.");
    const d = date || today_(db.attendanceRules?.timezone);
    db.attendanceRecords = db.attendanceRecords || {};
    db.attendanceRecords[d] = db.attendanceRecords[d] || {};
    const r = db.attendanceRecords[d][empId];
    if (!r) throw new Error("Data absensi tidak ditemukan.");
    r.lateOriginalStatus = r.status;
    r.lateOriginalMinutes = r.lateMinutes || 0;
    r.lateOriginalAfter = r.lateAfter || "";
    r.status = "hadir";
    r.isLate = false;
    r.lateApproved = true;
    r.lateStatus = "approved";
    r.lateApprovedAt = new Date().toISOString();
    r.lateApprovedBy = "admin";
    r.message = "Telat di-ACC admin sebagai hadir";
    return {
      ok: true,
      record: r
    };
  }).catch((e)=>({
      ok: false,
      error: String(e?.message || e)
    }));
}
async function repairDatabase_(licenseCode, tokenSchool, p) {
  await ensureLicenseRow(licenseCode, tokenSchool);
  const row = await getRow(licenseCode);
  const authDb = row ? normalizeDb(row.payload || {}, licenseCode) : defaultDb(licenseCode, tokenSchool);
  if (!checkAdmin(authDb, p)) {
    return {
      ok: false,
      error: "Admin auth gagal."
    };
  }
  if (!row) {
    const fresh = defaultDb(licenseCode, tokenSchool);
    await upsertPayload(licenseCode, fresh);
    return {
      ok: true,
      message: "Database baru dibuat.",
      data: fresh
    };
  }
  return {
    ok: true,
    message: "Database sudah valid (jsonb). Tidak perlu repair.",
    data: normalizeDb(row.payload || {}, licenseCode)
  };
}
async function syncCheck_(licenseCode) {
  const row = await getRow(licenseCode);
  if (!row) return {
    ok: true,
    exists: false,
    employees: 0,
    serverUpdatedAt: ""
  };
  const d = row.payload || {};
  return {
    ok: true,
    exists: true,
    employees: Array.isArray(d.employees) ? d.employees.length : 0,
    serverUpdatedAt: String(d._serverUpdatedAt || "")
  };
}
// ====== Alpha otomatis (dipanggil terjadwal oleh Supabase Cron) ======
function zonedParts_(timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false
  });
  const out = {};
  for (const part of fmt.formatToParts(new Date())) out[part.type] = part.value;
  if (out.hour === "24") out.hour = "00";
  return out;
}
function activeEmployeeForAlpha_(emp, date) {
  if (!emp || !emp.id) return false;
  const status = String(emp.status || "aktif").toLowerCase();
  if (["inactive", "nonaktif", "arsip", "archived"].includes(status)) return false;
  const start = String(emp.join || emp.joinDate || "").slice(0, 10);
  const end = String(emp.endDate || emp.resignDate || "").slice(0, 10);
  if (start && start > date) return false;
  if (end && end < date) return false;
  return true;
}
async function runAutoAlpha_(p) {
  if (!CRON_SECRET || CRON_SECRET.length < 24 || String(p.cronSecret || "") !== CRON_SECRET) {
    return { ok: false, error: "Otorisasi cron tidak valid." };
  }
  const { data: licenseRows, error: licenseError } = await supabase
    .from("licenses").select("license_code").eq("status", "active");
  if (licenseError) throw licenseError;
  const activeLicenses = new Set((licenseRows || []).map((x)=>String(x.license_code || "")));
  const { data: databaseRows, error: databaseError } = await supabase
    .from("databases").select("license_code,payload");
  if (databaseError) throw databaseError;
  const summary = { checkedSchools: 0, enabledSchools: 0, inserted: 0, skippedExisting: 0, skippedLeave: 0, skippedSchedule: 0 };
  for (const row of databaseRows || []) {
    const licenseCode = String(row.license_code || "");
    if (!activeLicenses.has(licenseCode)) continue;
    summary.checkedSchools++;
    const db = normalizeDb(row.payload || {}, licenseCode);
    const rules = db.attendanceRules || {};
    if (rules.autoAlphaEnabled !== true) continue;
    summary.enabledSchools++;
    const now = zonedParts_(rules.timezone || "Asia/Jakarta");
    const date = `${now.year}-${now.month}-${now.day}`;
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const workDays = Array.isArray(rules.autoAlphaWorkDays) ? rules.autoAlphaWorkDays.map(Number) : [1, 2, 3, 4, 5, 6];
    const excludedDates = Array.isArray(rules.autoAlphaExcludedDates) ? rules.autoAlphaExcludedDates.map(String) : [];
    if (!workDays.includes(weekdayMap[now.weekday]) || excludedDates.includes(date)) {
      summary.skippedSchedule++;
      continue;
    }
    const configuredCutoff = timeToMin_(rules.autoAlphaAt || "09:30");
    const cutoff = (configuredCutoff === null ? 570 : configuredCutoff) + Math.max(0, Number(rules.autoAlphaGraceMinutes || 0));
    const current = (Number(now.hour) * 60) + Number(now.minute);
    if (current < cutoff) continue;
    const employees = (db.employees || []).filter((emp)=>activeEmployeeForAlpha_(emp, date));
    if (!employees.length) continue;
    const employeeIds = employees.map((emp)=>String(emp.id));
    const { data: recRows, error: recError } = await supabase.from("attendance_records")
      .select("employee_id").eq("license_code", licenseCode).eq("attendance_date", date).in("employee_id", employeeIds);
    if (recError) throw recError;
    const existing = new Set((recRows || []).map((x)=>String(x.employee_id)));
    const { data: reqRows, error: reqError } = await supabase.from("attendance_requests")
      .select("employee_id,payload").eq("license_code", licenseCode).eq("attendance_date", date).in("employee_id", employeeIds);
    if (reqError) throw reqError;
    const approvedLeave = new Set((reqRows || []).filter((x)=>String(x.payload?.status || "").toLowerCase() === "approved").map((x)=>String(x.employee_id)));
    const inserts = [];
    for (const emp of employees) {
      const employeeId = String(emp.id);
      if (existing.has(employeeId)) { summary.skippedExisting++; continue; }
      if (approvedLeave.has(employeeId)) { summary.skippedLeave++; continue; }
      inserts.push({
        license_code: licenseCode,
        attendance_date: date,
        employee_id: employeeId,
        payload: {
          status: "alpha",
          date,
          employeeId,
          employeeName: emp.name || "",
          source: "server_auto_alpha",
          autoGenerated: true,
          autoAlphaAt: rules.autoAlphaAt || "09:30",
          autoAlphaGraceMinutes: Math.max(0, Number(rules.autoAlphaGraceMinutes || 0)),
          timezone: rules.timezone || "Asia/Jakarta",
          message: "Tidak ada check-in sampai batas waktu absensi.",
          createdAt: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      });
    }
    if (inserts.length) {
      const { error: insertError } = await supabase.from("attendance_records").upsert(inserts, {
        onConflict: "license_code, attendance_date, employee_id",
        ignoreDuplicates: true
      });
      if (insertError) throw insertError;
      summary.inserted += inserts.length;
      await log_("auto_alpha", licenseCode, `${inserts.length} karyawan ditandai alpha untuk ${date}`);
    }
  }
  return { ok: true, ...summary, ranAt: new Date().toISOString() };
}
// ====== Router (padanan route_) ======
async function route(p) {
  const action = p.action || "loadAdmin";
  const licenseCode = String(p.licenseCode || DEFAULT_LICENSE).trim();
  if (action === "ping" || action === "health") {
    return {
      ok: true,
      app: "Klaar",
      version: "supabase",
      time: new Date().toISOString()
    };
  }
  if (action === "runAutoAlpha") return await runAutoAlpha_(p);
  let tokenSchool = "";
  if (REQUIRE_SIGNED_LICENSE) {
    if (!LICENSE_SECRET || LICENSE_SECRET === "GANTI_SECRET_INI_DENGAN_ACAK_MIN_40_KARAKTER" || LICENSE_SECRET.length < 40) {
      await log_("config_error", licenseCode, "LICENSE_SECRET belum dikonfigurasi");
      return {
        ok: false,
        error: "Server belum dikonfigurasi: LICENSE_SECRET wajib diisi (min. 40 karakter). Hubungi penjual."
      };
    }
    const lic = await verifyLicenseToken(licenseCode);
    if (!lic.ok) {
      await log_("license_denied", licenseCode, lic.error || "token tidak valid");
      return {
        ok: false,
        error: "Lisensi tidak valid. Aktivasi dengan kode lisensi resmi dari Klaar Store."
      };
    }
    tokenSchool = lic.school;
    // Revocation: bila baris licenses ada & status bukan active -> tolak.
    const { data: licRow } = await supabase.from("licenses").select("status").eq("license_code", licenseCode).maybeSingle();
    if (licRow && String(licRow.status || "active") !== "active") {
      await log_("license_suspended", licenseCode, "status=" + licRow.status);
      return {
        ok: false,
        error: "Lisensi dinonaktifkan. Hubungi penjual."
      };
    }
  }
  switch(action){
    case "validateLicense":
      return {
        ok: true,
        valid: true
      };
    case "repairDatabase":
      return await repairDatabase_(licenseCode, tokenSchool, p);
    case "syncCheck":
      return await syncCheck_(licenseCode);
    case "loadAdmin":
      return await loadAdmin_(licenseCode, p, tokenSchool);
    case "saveAdmin":
      return await saveAdmin_(licenseCode, p.payload || "{}", p, tokenSchool);
    case "changeAdminCredential":
      return await changeAdminCredential_(licenseCode, p);
    case "loadEmployee":
      return await loadEmployee_(licenseCode, p);
    case "employeeChangePassword":
      return await employeeChangePassword_(licenseCode, p);
    case "employeeCheckIn":
      return await employeeCheckIn_(licenseCode, p);
    case "employeeCheckOut":
      return await employeeCheckOut_(licenseCode, p);
    case "employeeRequest":
      return await employeeRequest_(licenseCode, p);
    case "uploadSelfie":
      return await uploadSelfie_(licenseCode, p);
    case "getSelfieMeta":
      return await getSelfieMeta_(licenseCode, p, tokenSchool);
    case "archiveEmployee":
      return await archiveEmployee_(licenseCode, p.employeeId, p);
    case "deleteEmployee":
      return await deleteEmployee_(licenseCode, p.employeeId, p);
    case "approveLateAsPresent":
      return await approveLateAsPresent_(licenseCode, p.employeeId, p.date, p);
    default:
      return {
        ok: false,
        error: "Action tidak dikenal: " + action
      };
  }
}
// ====== HTTP entry ======
Deno.serve(async (req)=>{
  const corsHeaders = corsHeadersFor_(req);
  const origin = String(req.headers.get("origin") || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({
      ok: false,
      error: "Origin tidak diizinkan."
    }, 403, corsHeaders);
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    let params = {};
    const url = new URL(req.url);
    // Query-string (kompat GET / debugging)
    for (const [k, v] of url.searchParams.entries())params[k] = v;
    // Body JSON (jalur utama dari fetch)
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(()=>({}));
        params = {
          ...params,
          ...body
        };
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        const form = await req.formData();
        for (const [k, v] of form.entries())params[k] = String(v);
      }
    }
    const action = String(params.action || "");
    if (req.method !== "POST" && action !== "ping" && action !== "health") {
      return jsonResponse({
        ok: false,
        error: "Gunakan metode POST."
      }, 405, corsHeaders);
    }
    const out = await route(params);
    return jsonResponse(out, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err?.message || err)
    }, 500, corsHeaders);
  }
});
