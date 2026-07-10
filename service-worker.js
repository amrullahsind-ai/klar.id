// Klaar Service Worker — cache app shell untuk kemampuan offline ringan.
// Strategi: network-first (selalu ambil versi terbaru bila online), fallback ke cache saat offline.
// PENTING: HANYA request same-origin GET yang di-cache. Panggilan API ke Apps Script
// (script.google.com) dan layanan pihak ketiga TIDAK PERNAH di-cache agar data selalu real-time.
const CACHE = 'klaar-final-deploy-20260705';
const SHELL = [
  '/', '/index.html', '/admin.html', '/employee.html',
  '/credential-center.html', '/store.html', '/checkout.html', '/seller-admin.html',
  '/klaar-logo.png', '/klaar-logo.svg',
  '/admin-manifest.json', '/employee-manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll gagal-total bila satu file 404; pakai per-file agar tetap terpasang.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Hanya tangani GET same-origin. Sisanya (API Apps Script, CDN, QR) lewat langsung ke jaringan.
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // Simpan salinan terbaru untuk fallback offline.
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || caches.match('/index.html'))
      )
  );
});
