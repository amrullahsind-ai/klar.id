# Panduan Deploy Klaar

## A. Deploy frontend ke GitHub/Vercel

1. Buat repo GitHub baru.
2. Upload semua file di folder ini ke root repo.
3. Deploy repo ke Vercel.
4. Setelah deploy, buka:
   - `/` untuk landing page
   - `/admin.html` untuk Klaar Admin
   - `/employee.html` untuk Klaar Hadir
   - `/credential-center.html` untuk Credential Center

## B. Deploy backend Apps Script

1. Buat Google Sheet baru untuk sekolah/yayasan.
2. Buka `Extensions → Apps Script`.
3. Hapus kode lama.
4. Copy seluruh isi `master-apps-script-v5.gs`.
5. Paste ke Apps Script.
6. Klik Save.
7. Klik `Deploy → New deployment` atau `Manage deployments → Edit → New version`.
8. Tipe: Web app.
9. Execute as: Me.
10. Who has access: Anyone.
11. Deploy.
12. Copy Web App URL yang berakhir `/exec`.

## C. Aktivasi di Klaar

1. Buka `/admin.html`.
2. Masukkan Web App URL Apps Script.
3. Masukkan **kode lisensi resmi** (token `KLAAR.xxxx.xxxx`) yang diterbitkan Klaar Store / dikirim ke email pembeli.
4. Klik aktivasi. (Kode yang bukan token bertanda tangan akan ditolak.)
5. Login admin.
6. Klik Sync/Refresh untuk memastikan database sehat.

---

## ⚠️ PENTING: Set LICENSE_SECRET (gerbang lisensi)

Sejak versi ini, app hanya menerima kode lisensi bertanda tangan dari Klaar Store.
Tanda tangannya memakai `LICENSE_SECRET`. **Secret ini WAJIB diganti dengan string acak panjang
(min. 40 karakter) dan HARUS SAMA PERSIS di 3 tempat:**

1. `store-apps-script.gs`  → `const LICENSE_SECRET = '...'`
2. `master-apps-script-v5.gs` → `const LICENSE_SECRET = '...'`
3. `admin.html` → `const LICENSE_SECRET='...'`

Kalau ketiganya tidak sama, token yang diterbitkan Store akan ditolak saat aktivasi.
Jaga kerahasiaan secret ini — siapa pun yang tahu secret bisa membuat lisensi sendiri.

> Catatan: kode lisensi lama `EDUPAY-*` tidak lagi berlaku. Untuk pengujian sementara tanpa Store,
> Anda bisa set `REQUIRE_SIGNED_LICENSE = false` di `master-apps-script-v5.gs`, tetapi JANGAN
> dipakai untuk produksi.

---

## D. Deploy Klaar Store (web jualan + penerbit lisensi) — milik PENJUAL

Klaar Store terpisah dari app pembeli. Cukup deploy SEKALI (milik Anda).

### D.1 Backend Store (Apps Script)
1. Buat Google Sheet baru, beri nama `Klaar Store DB`.
2. `Extensions → Apps Script` → hapus kode lama → paste isi `store-apps-script.gs` → Save.
3. Ganti `LICENSE_SECRET` (sama dengan 3 file di atas).
4. Ganti password panel penjual: jalankan fungsi `genSellerHash('passwordbaru')` di editor
   (menu Run), lihat hasil di `Logger`, salin ke `ADMIN_PASS_HASH`.
   (Default awal password = `klaarstore2026`.)
5. Sesuaikan `PLAN_PRICES`, `PAY_INFO`, `APP_ACTIVATION_URL`, `SELLER_EMAIL_FROM_NAME`.
6. `Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone → Deploy`.
7. Salin Web App URL (`/exec`).
8. (Sekali) jalankan `testSignVerify()` di editor untuk memastikan token terbentuk, dan saat
   pertama kirim email, setujui izin `MailApp` yang diminta Google.

### D.2 Frontend Store (Vercel — sudah satu repo)
1. Isi `STORE_SERVER_URL` di `checkout.html` dan `seller-admin.html` dengan Web App URL dari D.1.
2. Isi nomor `SELLER_WA` di `checkout.html`, dan nomor WhatsApp di `store.html` (footer).
3. Halaman yang tersedia:
   - `/store` — landing + harga (arahkan pembeli ke sini)
   - `/checkout` — form beli (buat order)
   - `/seller-admin` — panel Anda (konfirmasi bayar → terbit + email lisensi)

### D.3 Alur jualan
1. Pembeli buka `/store` → klik beli → `/checkout` isi sekolah+email → dapat **Order ID** + info bayar.
2. Pembeli transfer/QRIS lalu konfirmasi (mis. via WhatsApp dengan Order ID).
3. Anda buka `/seller-admin`, cek pembayaran, klik **Konfirmasi & Terbitkan** →
   token lisensi otomatis dibuat & **dikirim ke email pembeli**.
4. Pembeli aktivasi di `/admin` memakai token tersebut.

> Kuota email Gmail via `MailApp` ± 100 email/hari (akun biasa). Cukup untuk penjualan harian.

## E. Tes wajib sebelum dipakai

- Admin bisa login.
- Karyawan bisa login.
- Karyawan bisa check-in.
- Check-in lewat batas telat tampil sebagai Telat.
- Monitor Admin menampilkan absensi.
- Admin bisa ACC Telat menjadi Hadir.
- Payroll membaca telat.
- Slip muncul di employee setelah dikirim admin.
- Import Excel bisa preview sebelum diterapkan.
