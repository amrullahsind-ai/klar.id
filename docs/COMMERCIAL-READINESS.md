# Kesiapan Komersial KLAAR

Dokumen ini mencatat keputusan operasional sebelum KLAAR menerima sekolah berbayar.

## Model lisensi

- Lisensi berlaku bulanan untuk satu sekolah/yayasan.
- Harga belum dikunci di source. Store menampilkan ajakan menghubungi penjual sampai biaya operasional dan margin disepakati.
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

Harga baru dipublikasikan setelah pengukuran pemakaian pilot minimal satu bulan.

## Backup ketika masih menggunakan Supabase Free

- Jalankan `scripts/backup-supabase.ps1` minimal seminggu sekali dan sebelum migration/deploy backend.
- Simpan hasil backup di dua tempat berbeda, salah satunya di luar laptop utama.
- Backup database tidak mencakup isi Supabase Storage. Selfie memang bersifat sementara dan dihapus setelah masa retensi; aset permanen lain harus disalin terpisah.
- Gunakan fitur Backup JSON dari KLAAR Admin sebagai lapisan tambahan, bukan pengganti dump database.
- Lakukan uji pemulihan berkala; file backup yang belum pernah diuji belum dapat dianggap aman.
- Setelah sekolah berbayar aktif, Supabase Pro lebih tepat karena menyediakan backup harian dengan retensi tujuh hari.

## Yang masih harus dikerjakan di Apps Script Store

Source Apps Script penjual tidak tersedia di workspace ini. Sebelum sistem bulanan diterbitkan, handler `createOrder`, `confirmOrder`, dan `issueManual` harus:

- menerima `billingPeriod=monthly` dan `durationMonths=1`;
- menghitung `expiresAt` satu bulan kalender dari tanggal aktivasi;
- memasukkan expiry ke payload token yang ditandatangani;
- menulis `expiresAt` pada spreadsheet lisensi;
- memperbarui baris `licenses.expires_at` di Supabase atau menyediakan proses sinkronisasi yang aman;
- tidak menyimpan `LICENSE_SECRET` di spreadsheet atau frontend.

