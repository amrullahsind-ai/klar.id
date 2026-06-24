# Klar — Deploy Ready Package

Paket ini dibuat sebagai paket bersih untuk deploy baru Klar. File inti sudah berada di root folder agar bisa langsung di-upload ke GitHub/Vercel.

## Isi utama

- `index.html` — landing page Klar
- `admin.html` — Klar Admin
- `employee.html` — Klar Hadir untuk karyawan
- `credential-center.html` — pusat ganti kredensial admin
- `master-apps-script-v5.gs` — backend Google Apps Script / License Server
- `admin-manifest.json` dan `employee-manifest.json` — PWA manifest
- `service-worker.js` — cache PWA
- `vercel.json` — konfigurasi static deploy Vercel
- `klar-logo.png` dan `klar-logo.svg` — logo Klar
- `template-import-klar.xlsx` — template import karyawan, aturan gaji, jadwal, lembur, payroll awal
- `template-lisensi.csv` — contoh format lisensi

## Prinsip deploy

1 sekolah/yayasan sebaiknya memakai 1 Google Sheet dan 1 Apps Script sendiri. Frontend Klar bisa sama, tetapi database tiap sekolah dipisahkan.

## Default demo

- Kode lisensi demo: `EDUPAY-DEMO-0001`
- Admin default: `admin` / `1234`
- Karyawan demo: `G-001` / `1234` atau `TU-001` / `1234`

Kode lisensi demo tetap memakai nama lama agar kompatibel dengan backend dan data uji.
