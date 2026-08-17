# Runbook Operasional Komersial KLAAR

## Gerbang sebelum sekolah pertama

Semua butir berikut wajib hijau:

- Supabase Pro aktif dan spend cap/alert dikonfigurasi.
- Hosting mengizinkan penggunaan komersial (Cloudflare Pages atau Vercel Pro, bukan Vercel Hobby).
- Migration terbaru berhasil, `supabase/verify-production.sql` tidak menunjukkan invariant gagal.
- `dynamic-handler` dan `seller-handler` sudah di-deploy dengan CORS hanya domain resmi.
- `LICENSE_SECRET` minimal 40 karakter, `CRON_SECRET` minimal 24 karakter, service-role tidak ada di frontend.
- Seller dibuat melalui Supabase Auth lalu `user_id`-nya dimasukkan ke `seller_users`; MFA diwajibkan dari kebijakan organisasi bila tersedia.
- Retensi selfie dan auto-alpha berjalan, health workflow hijau.
- Backup data terbaru lolos checksum dan pernah direstore ke staging.
- Kebijakan Privasi, Syarat Layanan, DPA, SLA dukungan, harga, invoice, serta kontak insiden sudah final.

## Menambah akun penjual

1. Buat pengguna di Supabase Authentication dengan email individual; jangan memakai akun bersama.
2. Salin UUID pengguna, lalu jalankan melalui SQL Editor yang berwenang:

```sql
insert into public.seller_users (user_id, display_name, role, active)
values ('UUID-AUTH-USER', 'Nama Penjual', 'owner', true);
```

3. Uji login panel penjual. Pastikan akun non-allowlist ditolak.
4. Catat persetujuan penambahan akses. Saat personel keluar, ubah `active=false` dan cabut sesi Auth.

## Onboarding sekolah

1. Pastikan pembayaran/kontrak dan nama sekolah benar.
2. Terbitkan lisensi satu bulan di panel penjual.
3. Kirim kode lewat kanal terverifikasi; jangan menaruhnya di grup publik.
4. Dampingi aktivasi, ganti PIN admin default, tambah maksimal beberapa karyawan uji.
5. Uji admin, employee, selfie, izin, payroll contoh, ekspor, dan refresh sesi.
6. Catat tanggal aktivasi, PIC, kanal dukungan, dan hasil penerimaan.

## Perpanjangan dan penghentian

- Tombol `+1 bulan` menghitung dari tanggal berakhir yang masih aktif; bila sudah lewat, dihitung dari saat perpanjangan.
- Tombol `Waktu gratis` digunakan jika sekolah memang dibebaskan dari pembayaran. Penjual memilih 1–365 hari dan wajib menulis alasan. Aksi ini tidak membuat order/pembayaran, tetapi tersimpan di `license_time_grants` dan audit log dengan nilai pembayaran nol.
- Perpanjangan menghasilkan kode baru tetapi mempertahankan `tenant_key`, sehingga data sekolah tetap sama.
- Penangguhan mencabut sesi aktif. Data tidak dihapus.
- Penghapusan tenant hanya boleh mengikuti permintaan tertulis, periode ekspor, backup, dan checklist insiden/hukum; jangan menghapus langsung dari dashboard.

## Backup

```powershell
$env:KLAAR_DATABASE_URL = '<URL dari pengelola secret>'
powershell -ExecutionPolicy Bypass -File .\scripts\backup-supabase.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\verify-backup.ps1 -BackupDirectory '<folder backup>'
```

Simpan minimal dua salinan terenkripsi di lokasi berbeda. Lakukan restore staging bulanan. Target awal yang harus disepakati: RPO 24 jam dan RTO 8 jam; jangan menjanjikan angka ini sebelum uji nyata membuktikannya.

## Deploy berurutan

1. Buat backup dan verifikasi.
2. Jalankan migration baru di staging, lalu `verify-production.sql`.
3. Deploy `dynamic-handler` dan `seller-handler` di staging beserta secrets.
4. Jalankan smoke test admin, employee, seller, expiry, renew, suspend, dan tenant isolation.
5. Ulangi ke produksi dalam jendela pemeliharaan.
6. Baru publikasikan frontend dan aktifkan `STORE_PRICING_OPEN=true` serta `KLAAR_MONTHLY_PRICE_IDR` setelah harga final.
7. Pantau error, health, login denial, dan autosync minimal 60 menit.

## Review rutin

- Harian: health, error backend, cron, payment review.
- Mingguan: backup/checksum, akun seller, penggunaan storage/egress, lisensi akan habis.
- Bulanan: restore staging, dependency/security review, biaya vs sekolah aktif, akses personel, retensi, dan tiket berulang.
