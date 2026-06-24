# Klar — Deploy Ready Package

Paket ini dibuat sebagai paket bersih untuk deploy baru Klar. File inti sudah berada di root folder agar bisa langsung di-upload ke GitHub/Vercel.

## Isi utama

- `index.html` — landing page Klar
- `admin.html` — Klar Admin
- `employee.html` — Klar Hadir untuk karyawan
- `credential-center.html` — pusat ganti kredensial admin
- `master-apps-script-v5.gs` — backend Google Apps Script app pembeli (kini bergerbang lisensi)
- `admin-manifest.json` dan `employee-manifest.json` — PWA manifest
- `service-worker.js` — cache PWA
- `vercel.json` — konfigurasi static deploy Vercel
- `klar-logo.png` dan `klar-logo.svg` — logo Klar
- `template-import-klar.xlsx` — template import karyawan, aturan gaji, jadwal, lembur, payroll awal
- `template-lisensi.csv` — catatan format lisensi (kini berupa token bertanda tangan)

### Klar Store (milik penjual — untuk jualan)
- `store.html` — landing page + harga
- `checkout.html` — form beli (buat order)
- `seller-admin.html` — panel penjual (konfirmasi bayar → terbit + email lisensi)
- `store-apps-script.gs` — backend Store (penerbit lisensi + email), deploy di Sheet terpisah

## Prinsip deploy

1 sekolah/yayasan sebaiknya memakai 1 Google Sheet dan 1 Apps Script sendiri. Frontend Klar bisa sama, tetapi database tiap sekolah dipisahkan. **Klar Store cukup di-deploy sekali oleh penjual.**

## Lisensi & gerbang akses

Aplikasi kini hanya menerima **kode lisensi bertanda tangan** (token `KLAR.xxxx.xxxx`) yang diterbitkan
Klar Store. Kode mengikat ke nama sekolah dan diverifikasi (HMAC-SHA256) di frontend dan backend pembeli
— **tanpa perlu server pusat selalu online**. Lihat `PANDUAN_DEPLOY.md` bagian "Set LICENSE_SECRET" dan
"Deploy Klar Store". Wajib set `LICENSE_SECRET` yang sama di `admin.html`, `master-apps-script-v5.gs`,
dan `store-apps-script.gs`.

## Default demo

- Admin default: `admin` / `1234`
- Karyawan demo: `G-001` / `1234` atau `TU-001` / `1234`
- Kode lisensi demo: terbitkan sendiri lewat panel penjual (`/seller-admin` → Terbitkan manual,
  nama sekolah mis. "Sekolah Demo"), atau jalankan `testSignVerify()` di `store-apps-script.gs`.
  Kode lama `EDUPAY-*` sudah tidak berlaku.
