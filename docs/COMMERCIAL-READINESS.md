# Kesiapan Komersial KLAAR

Dokumen ini mencatat keputusan operasional sebelum KLAAR menerima sekolah berbayar.

## Model lisensi

- Lisensi berlaku bulanan untuk satu sekolah/yayasan.
- Harga awal ditetapkan Rp199.000 per sekolah/yayasan per bulan, tanpa biaya per karyawan.
- Token baru wajib membawa tanggal kedaluwarsa (`exp`, `expiresAt`, atau `expires_at`).
- Kolom `licenses.expires_at` di Supabase menjadi sumber kendali yang dapat diperpanjang atau dinonaktifkan penjual.
- Ketika lisensi berakhir, akses operasional dihentikan tetapi database sekolah tidak dihapus.
- Perpanjangan dilakukan dengan menerbitkan token baru dan memperbarui `expires_at`.

## Infrastruktur yang disarankan

### Tahap pilot

- Pertahankan Supabase. Migrasi database sekarang justru menambah risiko tanpa manfaat yang jelas.
- Frontend KLAAR bersifat statis sehingga dapat tetap di Vercel selama uji internal atau dipindahkan ke Cloudflare Pages.
- Jangan menerima pelanggan berbayar di Vercel Hobby karena paket tersebut ditujukan untuk penggunaan personal/nonkomersial.

### Tahap sekolah berbayar

- Opsi hemat: Cloudflare Pages untuk frontend statis dan Supabase Pro untuk database/backend.
- Opsi paling minim perubahan: Vercel Pro dan Supabase Pro.
- Harga resmi harus diperiksa kembali sebelum menetapkan tarif sekolah:
  - Supabase: https://supabase.com/pricing
  - Vercel: https://vercel.com/pricing
  - Cloudflare Pages: https://developers.cloudflare.com/pages/functions/pricing/

Pada Juli 2026, harga dasar yang ditampilkan penyedia adalah Supabase Pro mulai USD 25/bulan dan Vercel Pro USD 20/bulan. Cloudflare menyatakan request aset statis Pages gratis dan tidak terbatas; Pages Functions mengikuti kuota Workers.

## Cara menentukan harga sekolah

Jangan memakai biaya server per sekolah secara langsung. Hitung:

1. biaya tetap bulanan: hosting, database, domain, dan alat operasional;
2. biaya variabel: storage selfie, egress, email/transaksi, serta dukungan;
3. cadangan 10–20% untuk kurs dan penggunaan berlebih;
4. waktu dukungan, perbaikan bug, onboarding, dan pajak;
5. margin pengembangan.

Gunakan rumus awal:

```text
harga minimum per sekolah = (biaya tetap / target sekolah aktif) + biaya variabel per sekolah + dukungan + margin
```

Tinjau harga kembali setelah pengukuran pemakaian pilot minimal satu bulan. Perubahan harga tidak boleh mengubah pesanan yang sudah dibuat.

## Backup ketika masih menggunakan Supabase Free

- Jalankan `scripts/backup-supabase.ps1` minimal seminggu sekali dan sebelum migration/deploy backend.
- Simpan hasil backup di dua tempat berbeda, salah satunya di luar laptop utama.
- Backup database tidak mencakup isi Supabase Storage. Selfie memang bersifat sementara dan dihapus setelah masa retensi; aset permanen lain harus disalin terpisah.
- Gunakan fitur Backup JSON dari KLAAR Admin sebagai lapisan tambahan, bukan pengganti dump database.
- Lakukan uji pemulihan berkala; file backup yang belum pernah diuji belum dapat dianggap aman.
- Setelah sekolah berbayar aktif, Supabase Pro lebih tepat karena menyediakan backup harian dengan retensi tujuh hari.

## Store dan panel penjual

Store tidak lagi bergantung pada Apps Script atau Spreadsheet. `seller-handler` memakai Supabase Auth untuk akun penjual, allowlist `seller_users`, audit log, rate limit, tabel order, dan tabel lisensi yang sama dengan aplikasi.

- Harga Rp199.000 dibuka hanya jika `STORE_PRICING_OPEN=true`, `KLAAR_MONTHLY_PRICE_IDR=199000`, dan konfigurasi Midtrans lengkap.
- Checkout memakai Snap Token yang dibuat di backend. Frontend tidak pernah menerima Server Key.
- Webhook Midtrans diverifikasi dengan `signature_key`, lalu backend mengambil status langsung dari Get Status API sebelum menerbitkan lisensi.
- Pembeli dapat memulihkan status order melalui token checkout acak; lisensi hanya ditampilkan setelah pembayaran dinyatakan berhasil oleh Midtrans.
- WhatsApp, QRIS statis, unggahan bukti, dan konfirmasi manual tidak digunakan untuk pesanan Midtrans baru.
- Lisensi baru berlaku satu bulan kalender.
- Sekolah lama memasukkan kode lisensi pada checkout. Pembayaran yang berhasil memperpanjang tenant yang sama satu bulan dan menghasilkan token baru; data sekolah tidak berubah atau terhapus.
- Sekolah yang dibebaskan dari pembayaran dapat diberi 1–365 hari melalui aksi `Waktu gratis`; alasan, pemberi, masa berlaku lama/baru, dan nilai nol dicatat untuk audit.
- Penangguhan mencabut sesi aplikasi dan menghentikan akses tanpa menghapus data.
- Email memakai penyedia backend (`RESEND_API_KEY`), bukan MailApp.
- `LICENSE_SECRET`, service-role, dan kredensial penjual tidak pernah ditempatkan di frontend.

## Keputusan go-live

Source sudah menyediakan kontrol teknis utama, tetapi status “siap dijual” baru boleh diberikan setelah migration/deploy staging dan produksi diverifikasi, transaksi Midtrans sandbox berhasil end-to-end, restore staging berhasil, legal final, monitoring hijau, serta pilot 2–3 sekolah menyelesaikan satu siklus payroll.
