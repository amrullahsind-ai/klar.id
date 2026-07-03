/**
 * Klaar - Apps Script License Server (Deploy Ready)
 * Deploy: Execute as: Me, Who has access: Anyone with the link.
 * Supports: admin load/save, employee login by NIP/Login/Nama/Kode, check-in/out, request, change password.
 */
const DB_SHEET = '_database';
const LICENSE_SHEET = '_licenses';
const LOG_SHEET = '_logs';
const BROKEN_SHEET = '_database_broken';
const DEFAULT_LICENSE = 'EDUPAY-DEMO-0001';

// === GERBANG LISENSI ===
// LICENSE_SECRET WAJIB diganti dengan string acak panjang (min. 40 karakter),
// dan HARUS SAMA PERSIS di store-apps-script.gs (yang menandatangani) dan file ini.
// admin.html TIDAK menyimpan secret — verifikasi hanya di backend.
// Jika tidak sama, token terbitan Klaar Store akan ditolak.
// !!! JANGAN dibiarkan default: siapa pun yang tahu secret bisa membuat lisensi palsu. !!!
const LICENSE_SECRET = 'GANTI_SECRET_INI_DENGAN_ACAK_MIN_40_KARAKTER';
// true = wajib token bertanda tangan dari Klaar Store. Set false hanya untuk pengembangan.
const REQUIRE_SIGNED_LICENSE = true;
// Prefix token lisensi Klaar.
const LICENSE_PREFIX = 'KLAAR';
// Hash default admin (sha256 dari '1234'+SALT). Nilainya sama dengan DEFAULT_ADMIN_HASH di admin.html
// supaya kredensial demo admin/1234 tetap berlaku untuk database baru.
const DEFAULT_ADMIN_HASH = 'd3eecabb3db83dcdf562b12ff510afbfbf351e2a12efda3963e11c0d41c52e93';

// === Helper verifikasi token lisensi (HMAC-SHA256) ===
// Format token: KLAAR.<b64url(payloadJson)>.<b64url(hmacBytes)>
// payloadJson = {"school":..,"plan":..,"iat":..,"v":1} (urutan kunci tetap).
// Harus byte-identik dengan signLicense_ di store-apps-script.gs & verifyLicenseToken di admin.html.
function b64url_(bytesOrStr){
  // bytesOrStr: byte array (hasil HMAC) atau string (akan di-utf8-kan).
  var b64 = (typeof bytesOrStr === 'string')
    ? Utilities.base64Encode(bytesOrStr, Utilities.Charset.UTF_8)
    : Utilities.base64Encode(bytesOrStr);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64urlToStr_(s){
  var b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while(b64.length % 4) b64 += '=';
  var bytes = Utilities.base64Decode(b64);
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}
function hmacB64url_(payloadStr){
  var raw = Utilities.computeHmacSha256Signature(payloadStr, LICENSE_SECRET, Utilities.Charset.UTF_8);
  return b64url_(raw);
}
function verifyLicenseToken_(token){
  try{
    token = String(token || '').trim();
    var parts = token.split('.');
    if(parts.length !== 3 || parts[0] !== LICENSE_PREFIX) return {ok:false, error:'format token salah'};
    var payloadStr = unb64urlToStr_(parts[1]);
    var expected = hmacB64url_(payloadStr);
    var got = parts[2];
    // Bandingkan panjang lalu isi byte demi byte (hindari early-exit yang bocorkan info).
    if(expected.length !== got.length) return {ok:false, error:'tanda tangan salah'};
    var diff = 0;
    for(var i=0;i<expected.length;i++) diff |= (expected.charCodeAt(i) ^ got.charCodeAt(i));
    if(diff !== 0) return {ok:false, error:'tanda tangan salah'};
    var payload = JSON.parse(payloadStr);
    if(!payload || !payload.school) return {ok:false, error:'payload tanpa school'};
    return {ok:true, school:String(payload.school), plan:String(payload.plan||''), iat:payload.iat||''};
  }catch(err){
    return {ok:false, error:String(err && err.message || err)};
  }
}
function doGet(e){
  const p = e.parameter || {};
  const cb = p.callback || 'callback';
  let out;
  try { out = route_(p, false); }
  catch(err){ out = {ok:false, error:String(err && err.message || err)}; }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function doPost(e){
  const p = Object.assign({}, e.parameter || {});
  try { route_(p, true); }
  catch(err){ log_('post_error', '', String(err && err.message || err)); }
  return HtmlService.createHtmlOutput('<script>try{parent.postMessage({ok:true},"*")}catch(e){}</script>OK');
}
function route_(p, post){
  const action = p.action || 'loadAdmin';
  const licenseCode = String(p.licenseCode || DEFAULT_LICENSE).trim();
  ensure_();
  if(action === 'ping' || action === 'health') return {ok:true, app:'Klaar', version:'deploy-ready', licenseCode, time:new Date().toISOString()};
  // Gerbang lisensi: semua action selain ping/health wajib token valid.
  if(REQUIRE_SIGNED_LICENSE){
    const lic = verifyLicenseToken_(licenseCode);
    if(!lic.ok){
      log_('license_denied', licenseCode, lic.error || 'token tidak valid');
      return {ok:false, error:'Lisensi tidak valid. Aktivasi dengan kode lisensi resmi dari Klaar Store.'};
    }
  }
  if(action === 'repairDatabase') return repairDatabase_(licenseCode, p.force === '1' || p.force === 'true');
  if(action === 'loadAdmin') return loadAdmin_(licenseCode, p);
  if(action === 'saveAdmin') return saveAdmin_(licenseCode, p.payload || '{}', p);
  if(action === 'changeAdminCredential') return changeAdminCredential_(licenseCode, p);
  if(action === 'loadEmployee') return loadEmployee_(licenseCode, p);
  if(action === 'employeeChangePassword') return employeeChangePassword_(licenseCode, p);
  if(action === 'employeeCheckIn') return employeeCheckIn_(licenseCode, p);
  if(action === 'employeeCheckOut') return employeeCheckOut_(licenseCode, p);
  if(action === 'employeeRequest') return employeeRequest_(licenseCode, p);
  if(action === 'archiveEmployee') return archiveEmployee_(licenseCode, p.employeeId);
  if(action === 'deleteEmployee') return deleteEmployee_(licenseCode, p.employeeId);
  if(action === 'approveLateAsPresent') return approveLateAsPresent_(licenseCode, p.employeeId, p.date);
  return {ok:false, error:'Action tidak dikenal: ' + action};
}
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name){ return ss_().getSheetByName(name) || ss_().insertSheet(name); }
function ensure_(){
  const db = sh_(DB_SHEET); if(db.getLastRow() === 0) db.appendRow(['licenseCode','payload','updatedAt']);
  const li = sh_(LICENSE_SHEET); if(li.getLastRow() === 0) li.appendRow(['licenseCode','schoolName','status','plan','expiresAt','notes']);
  const logs = sh_(LOG_SHEET); if(logs.getLastRow() === 0) logs.appendRow(['time','action','licenseCode','message']);
  const br = sh_(BROKEN_SHEET); if(br.getLastRow() === 0) br.appendRow(['time','licenseCode','rawPayload','rowSnapshot','reason']);
  ensureDemoLicense_();
}
function dbRow_(licenseCode){
  const db = sh_(DB_SHEET), vals = db.getDataRange().getValues();
  for(let i=1;i<vals.length;i++) if(String(vals[i][0]).trim() === licenseCode) return i+1;
  return 0;
}
function loadPayload_(licenseCode){
  const row = dbRow_(licenseCode); if(!row) return null;
  const sheet = sh_(DB_SHEET);
  const lastCol = Math.max(sheet.getLastColumn(), 3);
  const vals = sheet.getRange(row,1,1,lastCol).getValues()[0];
  const raw = vals[1];
  const parsed = safeParsePayload_(raw);
  if(parsed.ok) return normalizeDb_(parsed.data, licenseCode);

  // Kalau kolom payload ketukar, cari JSON valid di kolom lain pada baris yang sama.
  for(let i=2;i<vals.length;i++){
    const alt = vals[i];
    const p = safeParsePayload_(alt);
    if(p.ok){
      const fixed = normalizeDb_(p.data, licenseCode);
      sheet.getRange(row,2,1,2).setValues([[JSON.stringify(fixed), new Date()]]);
      backupBroken_(licenseCode, raw, vals, 'Payload utama invalid, ditemukan JSON valid di kolom ' + (i+1) + '. Dipindah ke kolom payload.');
      return fixed;
    }
  }

  // Kalau isi payload cuma teks seperti DEMO, backup lalu reset ke database kosong yang valid.
  backupBroken_(licenseCode, raw, vals, parsed.error || 'Payload bukan JSON');
  const fresh = defaultDb_(licenseCode, String(raw||''));
  sheet.getRange(row,2,1,2).setValues([[JSON.stringify(fresh), new Date()]]);
  log_('repairDatabaseAuto', licenseCode, 'Payload rusak direset otomatis: ' + String(raw).slice(0,80));
  return fresh;
}

function safeParsePayload_(raw){
  if(raw === null || raw === undefined || raw === '') return {ok:false,error:'Payload kosong'};
  if(typeof raw === 'object') return {ok:true,data:raw};
  const text = String(raw).trim();
  if(!text) return {ok:false,error:'Payload kosong'};
  if(!(text.startsWith('{') || text.startsWith('['))) return {ok:false,error:'Payload bukan JSON: ' + text.slice(0,40)};
  try { return {ok:true,data:JSON.parse(text)}; }
  catch(err){ return {ok:false,error:String(err && err.message || err)}; }
}
function normalizeDb_(data, licenseCode){
  if(!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  data.employees = Array.isArray(data.employees) ? data.employees : [];
  data.positions = Array.isArray(data.positions) ? data.positions : [];
  data.grades = Array.isArray(data.grades) ? data.grades : [];
  data.components = Array.isArray(data.components) ? data.components : [];
  data.attendanceRecords = data.attendanceRecords && typeof data.attendanceRecords === 'object' ? data.attendanceRecords : {};
  data.attendanceRequests = Array.isArray(data.attendanceRequests) ? data.attendanceRequests : [];
  data.deviceRequests = Array.isArray(data.deviceRequests) ? data.deviceRequests : [];
  data.locks = data.locks && typeof data.locks === 'object' ? data.locks : {};
  data.sentSlips = data.sentSlips && typeof data.sentSlips === 'object' ? data.sentSlips : {};
  data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
  data.backupLogs = Array.isArray(data.backupLogs) ? data.backupLogs : [];
  data.importHistory = Array.isArray(data.importHistory) ? data.importHistory : [];
  data.settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
  if(!data.settings.school) data.settings.school = schoolNameFromLicense_(licenseCode) || 'Klaar';
  if(!data.settings.adminUser) data.settings.adminUser = 'admin';
  if(!data.settings.adminHash) data.settings.adminHash = DEFAULT_ADMIN_HASH;
  return data;
}
function defaultDb_(licenseCode, schoolName){
  return normalizeDb_({
    version:'deploy-ready',
    settings:{school: schoolName && schoolName !== 'DEMO' ? schoolName : 'Klaar Demo', yayasan:'', logo:'', primary:'#085842', accent:'#39AE89', adminUser:'admin', adminHash:DEFAULT_ADMIN_HASH},
    employees:[], positions:[], grades:[], components:[], deductions:[],
    attendanceRecords:{}, attendanceRequests:[], deviceRequests:[], locks:{}, sentSlips:{}, auditLogs:[], backupLogs:[], importHistory:[],
    _createdAt:new Date().toISOString(), _note:'Database dibuat/diperbaiki otomatis oleh Klaar'
  }, licenseCode);
}
function backupBroken_(licenseCode, raw, rowSnapshot, reason){
  try { sh_(BROKEN_SHEET).appendRow([new Date(), licenseCode, String(raw||''), JSON.stringify(rowSnapshot||[]), String(reason||'')]); } catch(e) {}
}
function schoolNameFromLicense_(licenseCode){
  try{
    const li = sh_(LICENSE_SHEET), vals = li.getDataRange().getValues();
    for(let i=1;i<vals.length;i++) if(String(vals[i][0]).trim() === licenseCode) return String(vals[i][1]||'').trim();
  }catch(e){}
  return '';
}
function ensureDemoLicense_(){
  try{
    const li = sh_(LICENSE_SHEET), vals = li.getDataRange().getValues();
    for(let i=1;i<vals.length;i++) if(String(vals[i][0]).trim() === DEFAULT_LICENSE) return;
    li.appendRow([DEFAULT_LICENSE,'Klaar Demo','active','demo','','Dibuat otomatis oleh Klaar']);
  }catch(e){}
}
function repairDatabase_(licenseCode, force){
  const row = dbRow_(licenseCode);
  if(!row){
    const fresh = defaultDb_(licenseCode, schoolNameFromLicense_(licenseCode));
    savePayload_(licenseCode, fresh);
    return {ok:true,message:'Database baru dibuat.', data:fresh};
  }
  const sheet = sh_(DB_SHEET);
  const vals = sheet.getRange(row,1,1,Math.max(sheet.getLastColumn(),3)).getValues()[0];
  const p = safeParsePayload_(vals[1]);
  if(p.ok && !force) return {ok:true,message:'Database sudah valid. Tidak direset.', data:normalizeDb_(p.data, licenseCode)};
  backupBroken_(licenseCode, vals[1], vals, force ? 'Reset paksa oleh repairDatabase' : (p.error || 'Payload invalid'));
  const fresh = defaultDb_(licenseCode, schoolNameFromLicense_(licenseCode) || String(vals[1]||''));
  sheet.getRange(row,2,1,2).setValues([[JSON.stringify(fresh), new Date()]]);
  return {ok:true,message:'Database rusak sudah dibackup dan diganti database kosong valid.', data:fresh};
}

function savePayload_(licenseCode, data){
  const db = sh_(DB_SHEET); let row = dbRow_(licenseCode);
  if(!row){ db.appendRow([licenseCode, JSON.stringify(data), new Date()]); row = db.getLastRow(); }
  else db.getRange(row, 2, 1, 2).setValues([[JSON.stringify(data), new Date()]]);
  return row;
}
// Verifikasi kredensial admin di sisi server. Kalau DB belum punya adminHash, dipakai DEFAULT (admin/1234).
function checkAdmin_(db, p){
  const s = (db && db.settings) || {};
  const curUser = String(s.adminUser || 'admin').trim();
  const curHash = String(s.adminHash || '') || DEFAULT_ADMIN_HASH;
  const user = String((p && p.adminUser) || '').trim();
  const hash = String((p && p.adminHash) || '');
  if(!hash) return false;
  if(user && curUser && user.toLowerCase() !== curUser.toLowerCase()) return false;
  return hash === curHash;
}
function loadAdmin_(licenseCode, p){
  let data = loadPayload_(licenseCode);
  if(!data) {
    // Lisensi sudah lolos gerbang di route_(). Pakai nama sekolah dari token bila ada.
    var lic = verifyLicenseToken_(licenseCode);
    var schoolName = (lic.ok && lic.school) ? lic.school : schoolNameFromLicense_(licenseCode);
    data = defaultDb_(licenseCode, schoolName);
    savePayload_(licenseCode, data);
  }
  if(!checkAdmin_(data, p)){ log_('loadAdmin_denied', licenseCode, 'kredensial admin salah'); return {ok:false, error:'Username/PIN admin salah.'}; }
  if(normalizeAllLateRecords_(data)) savePayload_(licenseCode, data);
  return {ok:true, license:{licenseCode,status:'active'}, data};
}
function saveAdmin_(licenseCode, payload, p){
  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(15000);
    const existing = loadPayload_(licenseCode);
    if(!checkAdmin_(existing || {}, p)){ log_('saveAdmin_denied', licenseCode, 'kredensial admin salah'); return {ok:false, error:'Username/PIN admin salah. Sync ditolak.'}; }
    const parsed = safeParsePayload_(payload || '{}');
    if(!parsed.ok) throw new Error('Payload admin bukan JSON valid: ' + parsed.error);
    const data = normalizeDb_(parsed.data, licenseCode);
    // Kredensial admin hanya boleh diubah lewat changeAdminCredential, bukan lewat sync biasa.
    const es = (existing && existing.settings) || {};
    if(es.adminHash){ data.settings.adminUser = es.adminUser || data.settings.adminUser; data.settings.adminHash = es.adminHash; }
    normalizeAllLateRecords_(data);
    data._serverUpdatedAt = new Date().toISOString();
    savePayload_(licenseCode, data);
    log_('saveAdmin', licenseCode, 'payload saved');
    return {ok:true, message:'Data tersimpan'};
  } finally { try{ lock.releaseLock(); }catch(e){} }
}
function changeAdminCredential_(licenseCode, p){
  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(15000);
    const db = loadPayload_(licenseCode);
    if(!db) return {ok:false, error:'Database belum ada. Buka Admin & Sync dulu.'};
    db.settings = db.settings || {};
    const curUser = String(db.settings.adminUser || 'admin').trim();
    const curHash = String(db.settings.adminHash || '') || DEFAULT_ADMIN_HASH;
    const oldUser = String(p.oldUser || '').trim(), oldHash = String(p.oldHash || '');
    if(oldHash !== curHash || (oldUser && curUser && oldUser.toLowerCase() !== curUser.toLowerCase())) return {ok:false, error:'Username/PIN lama salah.'};
    const newUser = String(p.newUser || '').trim(), newHash = String(p.newHash || '');
    if(!newUser || !newHash) return {ok:false, error:'Username/PIN baru belum lengkap.'};
    db.settings.adminUser = newUser;
    db.settings.adminHash = newHash;
    savePayload_(licenseCode, db);
    log_('changeAdminCredential', licenseCode, 'kredensial admin diganti');
    return {ok:true, message:'Kredensial admin berhasil diganti.'};
  } finally { try{ lock.releaseLock(); }catch(e){} }
}
function norm_(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
function flex_(s){ return norm_(s).replace(/[^a-z0-9]/g,''); }
function findEmployee_(db, login){
  const q = norm_(login), f = flex_(login);
  const emps = db.employees || [];
  return emps.find(e => flex_(e.nip)===f || flex_(e.loginName)===f || flex_(e.name)===f || flex_(e.slipCode)===f || norm_(e.nip)===q || norm_(e.loginName)===q || norm_(e.name)===q || norm_(e.slipCode)===q);
}
function checkEmployee_(db,p){
  const emp = findEmployee_(db, p.nip || p.login || p.username || '');
  if(!emp) throw new Error('Karyawan tidak ditemukan. Coba login pakai NIP/Login/Nama/Kode yang tertulis di Admin.');
  if(['nonaktif','arsip'].indexOf(String(emp.status||'Aktif').toLowerCase())>=0) throw new Error('Akun karyawan nonaktif/arsip.');
  const expected = emp.employeePinHash || '';
  if(expected && String(p.pinHash||'') !== String(expected)) throw new Error('Username atau password salah. Untuk karyawan hasil import, default biasanya 1234.');
  return emp;
}
function withDB_(licenseCode, fn){
  const lock = LockService.getScriptLock();
  try{
    lock.waitLock(15000);
    const db = loadPayload_(licenseCode); if(!db) throw new Error('Database belum ada. Sync dari Admin dulu.');
    const result = fn(db) || {};
    savePayload_(licenseCode, db);
    return result;
  } finally { try{ lock.releaseLock(); }catch(e){} }
}
// ===== Geofence GPS =====
function haversine_(lat1,lng1,lat2,lng2){
  const R=6371000, toRad=d=>d*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*R*Math.asin(Math.min(1,Math.sqrt(a)));
}
function activeLocations_(db){
  const r=(db&&db.attendanceRules)||{};
  let locs=Array.isArray(r.locations)?r.locations.filter(l=>l && l.active!==false && Number(l.lat) && Number(l.lng)):[];
  if(!locs.length && Number(r.lat) && Number(r.lng)) locs=[{id:'loc_primary',name:r.name||'Sekolah',lat:r.lat,lng:r.lng,radiusMeters:r.radiusMeters||80,maxAccuracyMeters:r.maxAccuracyMeters||120}];
  return locs;
}
// Cek lokasi check-in. Selalu kembalikan jarak/lokasi terdekat untuk dicatat.
// Enforcement default ON; bisa dimatikan via attendanceRules.geofence===false; dilewati bila tak ada koordinat lokasi.
function geofenceCheck_(db, lat, lng, accuracy){
  const r=(db&&db.attendanceRules)||{};
  const enforce = r.geofence !== false;
  const locs=activeLocations_(db);
  if(!locs.length) return {ok:true, skip:true, distanceMeters:null, locationName:''};
  let best=null;
  locs.forEach(l=>{ const d=haversine_(Number(lat),Number(lng),Number(l.lat),Number(l.lng)); if(!best||d<best.dist) best={dist:d,loc:l}; });
  const maxAcc=Number(best.loc.maxAccuracyMeters||r.maxAccuracyMeters||120);
  const radius=Number(best.loc.radiusMeters||r.radiusMeters||80);
  const info={ok:true, distanceMeters:Math.round(best.dist), locationName:best.loc.name||'', radius:radius};
  if(!enforce) return info;
  if(!Number(lat) || !Number(lng)) return {ok:false, error:'Lokasi GPS tidak terbaca. Aktifkan GPS lalu coba lagi.'};
  if(accuracy && maxAcc && Number(accuracy) > maxAcc) return {ok:false, error:'Akurasi GPS terlalu rendah ('+Math.round(accuracy)+'m, maksimal '+maxAcc+'m). Coba di area terbuka.'};
  if(best.dist > radius) return {ok:false, error:'Di luar radius lokasi: '+Math.round(best.dist)+'m dari '+(best.loc.name||'titik absensi')+' (maksimal '+radius+'m).'};
  return info;
}
function normalizeLateRecord_(db,r){ if(!r||!r.checkInTime) return r; const st=String(r.status||'').toLowerCase(); if(['izin','sakit','alpha','pending'].indexOf(st)>=0) return r; if(r.lateApproved||r.lateOverride||r.lateStatus==='approved'||r.lateManuallyApproved){ r.status='hadir'; r.isLate=false; return r; } const late=lateInfo_(db,r.checkInTime); if(late.isLate){ r.status='telat'; r.isLate=true; r.lateMinutes=late.minutes; r.lateAfter=late.lateAfter; r.lateApprovalAfter=late.lateApprovalAfter; r.needsLateApproval=late.needsApproval; if(!r.message) r.message='Check-in telat '+(late.minutes?('+'+late.minutes+' menit'):''); } return r; }
function normalizeAllLateRecords_(db){ let changed=false; const recs=db.attendanceRecords||{}; Object.keys(recs).forEach(date=>{Object.keys(recs[date]||{}).forEach(empId=>{const r=recs[date][empId]; const before=JSON.stringify({s:r&&r.status,l:r&&r.isLate,m:r&&r.lateMinutes,a:r&&r.lateAfter}); normalizeLateRecord_(db,r); const after=JSON.stringify({s:r&&r.status,l:r&&r.isLate,m:r&&r.lateMinutes,a:r&&r.lateAfter}); if(before!==after) changed=true;});}); return changed; }
function empView_(db, emp, p){
  const d = today_();
  const recs = db.attendanceRecords || {}; const todayRecord = normalizeLateRecord_(db, ((recs[d]||{})[emp.id] || null));
  const pos = (db.positions||[]).find(x=>x.id===emp.position) || {}; const gr = (db.grades||[]).find(x=>x.id===emp.grade) || {};
  const hist = Object.keys(recs).sort().reverse().slice(0,40).map(date=>Object.assign({date}, (recs[date]||{})[emp.id]||{})).filter(x=>x.status);
  const slip = latestSlip_(db, emp.id);
  return {ok:true, employee:Object.assign({}, emp, {positionName:pos.name||'', gradeName:gr.name||'', years:years_(emp.join, emp.yearsImported)}), school:(db.settings||{}).school||'Klaar', todayRecord, history:hist, slip, todayRequest:(db.attendanceRequests||[]).find(r=>r.employeeId===emp.id && r.date===d && r.status==='pending') || null, deviceStatus:'aktif'};
}
function loadEmployee_(licenseCode,p){ const db=loadPayload_(licenseCode); if(!db) throw new Error('Database belum ada. Sync dari Admin dulu.'); const emp=checkEmployee_(db,p); return empView_(db,emp,p); }
function employeeChangePassword_(licenseCode,p){ return withDB_(licenseCode, db=>{ const emp=checkEmployee_(db,p); emp.employeePinHash = p.newHash; emp.updatedAt = new Date().toISOString(); log_('employeeChangePassword', licenseCode, emp.name); return {ok:true,message:'Password berhasil diganti'}; }); }
function employeeCheckIn_(licenseCode,p){ return withDB_(licenseCode, db=>{ const emp=checkEmployee_(db,p); const d=today_(); db.attendanceRecords=db.attendanceRecords||{}; db.attendanceRecords[d]=db.attendanceRecords[d]||{}; if(db.attendanceRecords[d][emp.id] && db.attendanceRecords[d][emp.id].checkInTime) throw new Error('Sudah check-in hari ini.'); const lat=Number(p.lat||0),lng=Number(p.lng||0),accuracy=Number(p.accuracy||0); const geo=geofenceCheck_(db, lat, lng, accuracy); if(!geo.ok) throw new Error(geo.error); const now=time_(); const late=lateInfo_(db, now); const r={status:late.isLate?'telat':'hadir',date:d,checkInTime:now,lat:lat,lng:lng,accuracy:accuracy,distanceMeters:(geo.distanceMeters!=null?geo.distanceMeters:null),locationName:geo.locationName||'',source:'employee',isLate:late.isLate,lateMinutes:late.minutes,lateAfter:late.lateAfter,lateApprovalAfter:late.lateApprovalAfter,needsLateApproval:late.needsApproval,message:late.isLate?('Check-in berhasil, status TELAT '+(late.minutes?('('+late.minutes+' menit)'):'')+'.'):'Check-in berhasil'}; db.attendanceRecords[d][emp.id]=r; return {ok:true,record:r}; }); }
function employeeCheckOut_(licenseCode,p){ return withDB_(licenseCode, db=>{ const emp=checkEmployee_(db,p); const d=today_(); db.attendanceRecords=db.attendanceRecords||{}; db.attendanceRecords[d]=db.attendanceRecords[d]||{}; const r=db.attendanceRecords[d][emp.id]; if(!r || !r.checkInTime) throw new Error('Belum check-in.'); if(r.checkOutTime) throw new Error('Sudah check-out.'); r.checkOutTime=time_(); r.checkoutLat=Number(p.lat||0); r.checkoutLng=Number(p.lng||0); r.checkoutAccuracy=Number(p.accuracy||0); r.checkoutMessage='Check-out berhasil'; return {ok:true,record:r}; }); }
function employeeRequest_(licenseCode,p){ return withDB_(licenseCode, db=>{ const emp=checkEmployee_(db,p); db.attendanceRequests=db.attendanceRequests||[]; const r={id:'req_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),employeeId:emp.id,employeeName:emp.name,date:p.date||today_(),type:p.type||'izin',status:'pending',reason:p.reason||'',proof:p.proof||'',createdAt:new Date().toISOString()}; db.attendanceRequests.push(r); return {ok:true,record:r,message:'Pengajuan dikirim'}; }); }

function archiveEmployee_(licenseCode, empId){ return withDB_(licenseCode, db=>{ const emp=(db.employees||[]).find(e=>e.id===empId); if(!emp) return {ok:false,error:'Karyawan tidak ditemukan'}; emp.status='Arsip'; emp.archivedAt=new Date().toISOString(); db.auditLogs=Array.isArray(db.auditLogs)?db.auditLogs:[]; db.auditLogs.unshift({id:'log_'+Date.now(),at:new Date().toISOString(),action:'archive_employee',message:'Karyawan diarsipkan: '+(emp.name||emp.nip||empId),meta:{employeeId:empId}}); db.auditLogs=db.auditLogs.slice(0,300); return {ok:true,message:'Karyawan diarsipkan'}; }); }
function deleteEmployee_(licenseCode, empId){ return withDB_(licenseCode, db=>{ db._deletedEmployees=db._deletedEmployees||[]; if(empId && db._deletedEmployees.indexOf(empId)<0) db._deletedEmployees.push(empId); db.employees=(db.employees||[]).filter(e=>e.id!==empId); Object.keys(db.attendanceRecords||{}).forEach(d=>{ if(db.attendanceRecords[d]) delete db.attendanceRecords[d][empId]; }); db.attendanceRequests=(db.attendanceRequests||[]).filter(r=>r.employeeId!==empId); db.deviceRequests=(db.deviceRequests||[]).filter(r=>r.employeeId!==empId); Object.keys(db.locks||{}).forEach(m=>{ if(db.locks[m]&&db.locks[m].items) db.locks[m].items=db.locks[m].items.filter(x=>x.id!==empId); }); Object.keys(db.sentSlips||{}).forEach(m=>{ if(db.sentSlips[m]) delete db.sentSlips[m][empId]; }); return {ok:true,message:'Karyawan dihapus'}; }); }

function approveLateAsPresent_(licenseCode, empId, date){
  return withDB_(licenseCode, db=>{
    const d = date || today_();
    db.attendanceRecords = db.attendanceRecords || {};
    db.attendanceRecords[d] = db.attendanceRecords[d] || {};
    const r = db.attendanceRecords[d][empId];
    if(!r) throw new Error('Data absensi tidak ditemukan.');
    r.lateOriginalStatus = r.status;
    r.lateOriginalMinutes = r.lateMinutes || 0;
    r.lateOriginalAfter = r.lateAfter || '';
    r.status = 'hadir';
    r.isLate = false;
    r.lateApproved = true;
    r.lateStatus = 'approved';
    r.lateApprovedAt = new Date().toISOString();
    r.lateApprovedBy = 'admin';
    r.message = 'Telat di-ACC admin sebagai hadir';
    return {ok:true, record:r};
  });
}

function latestSlip_(db, empId){ const sent=db.sentSlips||{}, locks=db.locks||{}; const months=Object.keys(sent).sort().reverse(); for(const m of months){ if(sent[m] && sent[m][empId] && locks[m] && locks[m].items){ const it=locks[m].items.find(x=>x.id===empId); if(it) return Object.assign({month:m}, it); } } return null; }
function timeToMin_(hhmm){ const m=String(hhmm||'').match(/^(\d{1,2}):(\d{2})/); if(!m) return null; return Number(m[1])*60+Number(m[2]); }
function lateInfo_(db, now){ const rules=(db&&db.attendanceRules)||{}; const lateAfter=rules.lateAfter||'07:15'; const approvalAfter=rules.lateApprovalAfter||'08:30'; const n=timeToMin_(now), l=timeToMin_(lateAfter), a=timeToMin_(approvalAfter); const isLate=(n!==null&&l!==null&&n>l); return {isLate, minutes:isLate?(n-l):0, lateAfter, lateApprovalAfter:approvalAfter, needsApproval:(isLate&&a!==null&&n>a)}; }
function today_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd'); }
function time_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'HH:mm'); }
function years_(join, imported){ if(imported) return imported; if(!join) return 0; const a=new Date(join), b=new Date(); let y=b.getFullYear()-a.getFullYear(); if(b.getMonth()<a.getMonth() || (b.getMonth()===a.getMonth() && b.getDate()<a.getDate())) y--; return Math.max(0,y); }
// Compatibility alias: beberapa versi frontend/backend lama memanggil yearsWorked().
// Jangan dihapus agar login karyawan dari data import lama tidak error.
function yearsWorked(join, imported){ return years_(join, imported); }
function log_(action, licenseCode, message){ try{ sh_(LOG_SHEET).appendRow([new Date(), action, licenseCode, message]); }catch(e){} }
