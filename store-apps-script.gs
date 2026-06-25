/**
 * Klaar Store - Apps Script (penjualan + penerbitan lisensi + email)
 * Milik PENJUAL (kamu), bukan pembeli. Deploy di Google Sheet "Klaar Store DB" terpisah.
 *
 * Deploy:
 *   1. Buat Google Sheet baru, beri nama "Klaar Store DB".
 *   2. Extensions -> Apps Script -> hapus kode lama -> paste file ini -> Save.
 *   3. WAJIB: ganti LICENSE_SECRET (harus SAMA PERSIS dengan di admin.html & master-apps-script-v5.gs).
 *   4. WAJIB: ganti ADMIN_PASS_HASH (jalankan genSellerHash('passwordmu') di editor, salin hasilnya).
 *   5. Ganti SELLER_EMAIL_FROM_NAME, PAY_INFO, dan harga PLAN_PRICES sesuai kebutuhan.
 *   6. Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Anyone -> Deploy.
 *   7. Salin Web App URL (/exec) -> isikan ke STORE_SERVER_URL di checkout.html & seller-admin.html.
 */

// ====== KONFIGURASI WAJIB DIGANTI ======
// HARUS SAMA PERSIS dengan LICENSE_SECRET di admin.html dan master-apps-script-v5.gs.
const LICENSE_SECRET = 'klaar_2026_R4nd0mSecretSuperPanjangJanganDikasihSiapaPun_92817';
const LICENSE_PREFIX = 'KLAAR';

// Hash password panel penjual. Default di bawah = password 'klaarstore2026'.
// GANTI: jalankan genSellerHash('passwordbaru') di editor, salin output ke sini.
const ADMIN_PASS_HASH = '190a1114d4ebce7f9f5ef71af4351d62fcb3c85a869e0707a866dad2f9963b81';
const SELLER_SALT = '|klaar-store-seller-v1';

// Tampilan & info pembayaran (muncul di email & checkout).
const SELLER_EMAIL_FROM_NAME = 'Klaar Store';
const APP_ACTIVATION_URL = 'https://klaar-id-five.vercel.app/admin'; // link admin app untuk pembeli
const PAY_INFO = 'Pembayaran via QRIS. Scan QRIS yang tampil di halaman checkout dan bayar sesuai nominal. '
               + 'Pesanan Anda otomatis tercatat; lisensi dikirim ke email setelah pembayaran kami verifikasi. '
               + 'Simpan Order ID Anda.';

// Daftar paket & harga (Rupiah). Sesuaikan.
const PLAN_PRICES = { starter: 200000 };

// ====== SHEET ======
const ORDERS_SHEET = 'orders';
const ORDER_HEADERS = ['orderId','school','email','plan','amount','status','licenseToken','createdAt','confirmedAt','notes','paymentProof','buyerNotes'];

function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }
function sh_(name){ return ss_().getSheetByName(name) || ss_().insertSheet(name); }
function ensureStore_(){
  const o = sh_(ORDERS_SHEET);
  if(o.getLastRow() === 0) { o.appendRow(ORDER_HEADERS); return; }
  var current = o.getRange(1, 1, 1, Math.max(o.getLastColumn(), ORDER_HEADERS.length)).getValues()[0].map(String);
  ORDER_HEADERS.forEach(function(h){
    if(current.indexOf(h) < 0){
      o.getRange(1, o.getLastColumn() + 1).setValue(h);
      current.push(h);
    }
  });
}

// ====== ENTRY POINTS (JSONP, pola sama dengan app pembeli) ======
function doGet(e){
  const p = e.parameter || {};
  const cb = p.callback || 'callback';
  let out;
  try { out = route_(p); }
  catch(err){ out = {ok:false, error:String(err && err.message || err)}; }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function doPost(e){
  const p = Object.assign({}, e.parameter || {});
  const cb = p.callback || 'callback';
  let out;
  try { out = route_(p); }
  catch(err){ out = {ok:false, error:String(err && err.message || err)}; }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function route_(p){
  const action = p.action || 'ping';
  ensureStore_();
  if(action === 'ping' || action === 'health') return {ok:true, app:'Klaar Store', time:new Date().toISOString()};
  if(action === 'createOrder') return createOrder_(p);
  // Action di bawah ini hanya untuk penjual (butuh adminHash benar).
  if(['listOrders','confirmOrder','resendLicense','issueManual'].indexOf(action) >= 0){
    if(!checkSeller_(p)) return {ok:false, error:'Password panel penjual salah.'};
    if(action === 'listOrders') return listOrders_();
    if(action === 'confirmOrder') return confirmOrder_(p);
    if(action === 'resendLicense') return resendLicense_(p);
    if(action === 'issueManual') return issueManual_(p);
  }
  return {ok:false, error:'Action tidak dikenal: ' + action};
}

// ====== AUTH PENJUAL ======
function checkSeller_(p){
  const got = String(p.adminHash || '').trim().toLowerCase();
  return !!got && got === String(ADMIN_PASS_HASH).trim().toLowerCase();
}
// Jalankan manual di editor untuk membuat hash password panel penjual.
function genSellerHash(pass){
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pass) + SELLER_SALT, Utilities.Charset.UTF_8);
  const hex = raw.map(function(b){ return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  Logger.log(hex);
  return hex;
}

// ====== TOKEN LISENSI (HMAC-SHA256) ======
// Format: KLAAR.<b64url(payloadJson)>.<b64url(hmacBytes)>
// Harus byte-identik dengan verifier di admin.html & master-apps-script-v5.gs.
function b64url_(bytesOrStr){
  var b64 = (typeof bytesOrStr === 'string')
    ? Utilities.base64Encode(bytesOrStr, Utilities.Charset.UTF_8)
    : Utilities.base64Encode(bytesOrStr);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function signLicense_(school, plan){
  var iat = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  // payload deterministik (urutan kunci tetap).
  var payloadStr = '{"school":' + JSON.stringify(String(school))
                 + ',"plan":' + JSON.stringify(String(plan || ''))
                 + ',"iat":' + JSON.stringify(iat)
                 + ',"v":1}';
  var sig = Utilities.computeHmacSha256Signature(payloadStr, LICENSE_SECRET, Utilities.Charset.UTF_8);
  return LICENSE_PREFIX + '.' + b64url_(payloadStr) + '.' + b64url_(sig);
}

// ====== ORDERS ======
function newOrderId_(){
  return 'ORD-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyyMMdd') + '-' +
         Math.random().toString(36).slice(2, 7).toUpperCase();
}
function ordersData_(){ return sh_(ORDERS_SHEET).getDataRange().getValues(); }
function rowToOrder_(row){
  var o = {};
  for(var i=0;i<ORDER_HEADERS.length;i++) o[ORDER_HEADERS[i]] = row[i];
  return o;
}
function findOrderRow_(orderId){
  var vals = ordersData_();
  for(var i=1;i<vals.length;i++) if(String(vals[i][0]).trim() === String(orderId).trim()) return i+1; // 1-indexed
  return 0;
}

function createOrder_(p){
  var school = String(p.school || '').trim();
  var email = String(p.email || '').trim();
  var plan = String(p.plan || 'starter').trim();
  var paymentProof = String(p.paymentProof || '').trim();
  var buyerNotes = String(p.buyerNotes || '').trim();
  if(!school) return {ok:false, error:'Nama sekolah/yayasan wajib diisi.'};
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return {ok:false, error:'Email tidak valid.'};
  if(!PLAN_PRICES.hasOwnProperty(plan)) plan = 'starter';
  var amount = PLAN_PRICES[plan] || 0;
  var orderId = newOrderId_();
  sh_(ORDERS_SHEET).appendRow([orderId, school, email, plan, amount, 'pending', '', new Date(), '', '', paymentProof, buyerNotes]);
  return {ok:true, orderId:orderId, school:school, email:email, plan:plan, amount:amount, payInfo:PAY_INFO};
}

function listOrders_(){
  var vals = ordersData_(), out = [];
  for(var i=1;i<vals.length;i++){
    var o = rowToOrder_(vals[i]);
    // Jangan kirim token penuh ke daftar (cukup tahu sudah terbit atau belum).
    o.hasLicense = !!String(o.licenseToken || '').trim();
    delete o.licenseToken;
    out.push(o);
  }
  out.reverse();
  return {ok:true, orders:out};
}

function confirmOrder_(p){
  var orderId = String(p.orderId || '').trim();
  var row = findOrderRow_(orderId);
  if(!row) return {ok:false, error:'Order tidak ditemukan: ' + orderId};
  var sheet = sh_(ORDERS_SHEET);
  var vals = sheet.getRange(row, 1, 1, ORDER_HEADERS.length).getValues()[0];
  var o = rowToOrder_(vals);
  var token = String(o.licenseToken || '').trim();
  if(!token){ token = signLicense_(o.school, o.plan); }
  // tulis status + token + waktu konfirmasi
  sheet.getRange(row, 6).setValue('paid');               // status
  sheet.getRange(row, 7).setValue(token);                // licenseToken
  sheet.getRange(row, 9).setValue(new Date());           // confirmedAt
  var mail = sendLicenseEmail_(o.email, o.school, token);
  return {ok:true, orderId:orderId, token:token, emailed:mail.ok, emailError:mail.error || ''};
}

function resendLicense_(p){
  var orderId = String(p.orderId || '').trim();
  var row = findOrderRow_(orderId);
  if(!row) return {ok:false, error:'Order tidak ditemukan: ' + orderId};
  var sheet = sh_(ORDERS_SHEET);
  var o = rowToOrder_(sheet.getRange(row, 1, 1, ORDER_HEADERS.length).getValues()[0]);
  var token = String(o.licenseToken || '').trim();
  if(!token){ token = signLicense_(o.school, o.plan); sheet.getRange(row, 7).setValue(token); }
  var mail = sendLicenseEmail_(o.email, o.school, token);
  return {ok:true, orderId:orderId, emailed:mail.ok, emailError:mail.error || ''};
}

// Terbitkan lisensi langsung tanpa order (penjualan luring). Tetap dicatat sebagai order 'paid'.
function issueManual_(p){
  var school = String(p.school || '').trim();
  var email = String(p.email || '').trim();
  var plan = String(p.plan || 'starter').trim();
  if(!school) return {ok:false, error:'Nama sekolah wajib diisi.'};
  if(!PLAN_PRICES.hasOwnProperty(plan)) plan = 'starter';
  var token = signLicense_(school, plan);
  var orderId = newOrderId_();
  sh_(ORDERS_SHEET).appendRow([orderId, school, email, plan, PLAN_PRICES[plan] || 0, 'paid', token, new Date(), new Date(), 'manual']);
  var emailed = false, emailError = '';
  if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ var m = sendLicenseEmail_(email, school, token); emailed = m.ok; emailError = m.error || ''; }
  return {ok:true, orderId:orderId, token:token, emailed:emailed, emailError:emailError};
}

// ====== EMAIL ======
function sendLicenseEmail_(email, school, token){
  try{
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return {ok:false, error:'email kosong/invalid'};
    var subject = 'Kode Lisensi Klaar untuk ' + school;
    var body =
      'Halo,\n\n' +
      'Terima kasih sudah membeli Klaar. Berikut kode lisensi resmi untuk ' + school + ':\n\n' +
      token + '\n\n' +
      'Cara aktivasi:\n' +
      '1. Buka aplikasi Klaar Admin: ' + APP_ACTIVATION_URL + '\n' +
      '2. Masukkan URL Apps Script sekolah Anda (lihat panduan deploy).\n' +
      '3. Tempel kode lisensi di atas, lalu klik Aktivasi.\n' +
      '4. Login admin (default admin / 1234) lalu segera ganti PIN.\n\n' +
      'Simpan kode ini baik-baik. Jangan dibagikan ke pihak lain.\n\n' +
      'Salam,\n' + SELLER_EMAIL_FROM_NAME;
    MailApp.sendEmail({ to: email, subject: subject, body: body, name: SELLER_EMAIL_FROM_NAME });
    return {ok:true};
  }catch(err){
    return {ok:false, error:String(err && err.message || err)};
  }
}

// ====== TES MANUAL (jalankan di editor) ======
function testSignVerify(){
  var t = signLicense_('SDIT Al Falah', 'starter');
  Logger.log(t);
  return t;
}
