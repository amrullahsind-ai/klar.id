# Langkah Produksi Klaar

Dokumen ini dipakai satu kali sebelum sekolah mulai memakai data nyata. Kerjakan dalam satu sesi pemeliharaan agar frontend dan backend tidak berbeda versi.

## 1. Cadangkan dahulu

1. Supabase Free Tier tidak menyediakan backup harian yang dapat dipulihkan dari Dashboard. Buat backup manual sebelum migration:
   - Cara resmi dan lengkap: gunakan `supabase db dump` mengikuti dokumentasi Supabase.
   - Cara darurat yang lebih mudah: buka Table Editor dan ekspor CSV untuk tabel `licenses`, `databases`, `attendance_records`, `attendance_requests`, `attendance_selfies`, dan `logs`. File dalam bucket Storage harus dicadangkan terpisah karena backup database hanya menyimpan metadata Storage.
2. Unduh ZIP branch `main` terbaru repository GitHub melalui [tautan langsung ini](https://github.com/amrullahsind-ai/klar.id/archive/refs/heads/main.zip). Alternatifnya: buka halaman repo -> tombol hijau **Code** -> **Download ZIP**.
3. Simpan ZIP dan hasil ekspor di folder backup bertanggal. Jangan hapus data atau file lama sebelum pengujian selesai.

## 2. Sinkronkan source terbaru

Repository lokal yang lama tidak boleh langsung menimpa GitHub. Unduh atau `git pull` branch `main` terbaru terlebih dahulu, lalu salin perubahan Klaar ke salinan terbaru tersebut. Pertahankan workflow dan `apk-version.json` terbaru yang sudah dibuat GitHub Actions.

Jangan pernah commit file `.env`, keystore, password, `CRON_SECRET`, service-role key, atau `LICENSE_SECRET`.

## 3. Jalankan migration Supabase

1. Buka Supabase -> SQL Editor -> New query.
2. Salin seluruh isi `supabase/migrations/202607220001_production_schema.sql`.
3. Jalankan sekali dan pastikan tidak ada error.
4. Jalankan `supabase/verify-production.sql`.
5. Pastikan seluruh tabel menampilkan `rls_enabled = true`.
6. Pastikan bucket `selfies` menampilkan `public = false`.
7. Pastikan cron `klaar-auto-alpha` menampilkan `active = true`.

Catatan: selfie uji coba lama yang menggunakan path lama mungkin tidak lagi tampil setelah bucket dibuat private. Hapus hanya data uji setelah backup. Jangan mengedit tabel internal `storage.objects` secara manual.

## 4. Deploy Edge Function

1. Buka Supabase -> Edge Functions -> `dynamic-handler`.
2. Ganti source dengan `supabase/functions/dynamic-handler/index.ts` terbaru.
3. Tambahkan secret `ALLOWED_ORIGINS` dengan nilai `https://app.klaar.my.id` jika belum ada.
4. Pastikan `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LICENSE_SECRET`, dan `CRON_SECRET` tetap berada di Edge Function Secrets, bukan di source.
5. Deploy function.

## 5. Rotasi rahasia lisensi yang pernah bocor

`LICENSE_SECRET` lama pernah tersimpan dalam riwayat Git. Menghapus file saja tidak membuatnya aman.

1. Buat secret acak baru minimal 64 karakter dan simpan di password manager.
2. Ganti `LICENSE_SECRET` pada Supabase Edge Function Secrets.
3. Ganti secret yang sama pada project Apps Script penjual. Jangan menaruhnya di GitHub.
4. Deploy versi Apps Script baru dan deploy ulang Edge Function.
5. Terbitkan lisensi baru untuk Sekolah Mutiara Insani. Lisensi lama menjadi tidak valid.
6. Uji lisensi baru sebelum memberikan akses kepada sekolah.

## 6. Push frontend

Push file source terbaru ke branch `main`. Vercel akan menjalankan deploy. Sesudah status deploy berhasil, buka `https://app.klaar.my.id` pada jendela incognito untuk menghindari cache service worker lama.

## 7. Uji wajib sebelum data nyata

1. Login admin dengan lisensi baru.
2. Password default `1234` harus diarahkan ke halaman ganti password.
3. Login karyawan dengan password default; aplikasi harus memaksa perubahan password.
4. Ambil selfie check-in dan check-out. Gambar harus tampil untuk pengguna berizin, tetapi URL tidak boleh permanen.
5. Salin URL selfie dan coba lagi lebih dari 15 menit kemudian; URL harus kedaluwarsa.
6. Ubah kehadiran di payroll dan pastikan slip dihitung ulang.
7. Uji dua lisensi sekolah berbeda dan pastikan data, selfie, serta pegawai tidak saling terlihat.
8. Uji refresh halaman admin dan employee; sesi harus kembali ke halaman sebelumnya selama belum logout.
9. Uji cron auto-alpha dan lihat hasil terbaru di `cron.job_run_details`.
10. Buat satu payroll uji dan cocokkan total komponen dengan perhitungan manual.

## 8. Rilis APK

Jalankan workflow release dengan `versionCode` yang selalu naik. Unduh APK hasil release, instal sebagai pembaruan, lalu pastikan pemeriksaan versi terpusat membaca `apk-version.json` dan checksum SHA-256 yang dibuat workflow.

## 9. Syarat boleh dipakai sekolah

Aplikasi baru dianggap siap data nyata setelah semua uji pada bagian 7 lulus, backup tersedia, secret lama sudah tidak berlaku, bucket selfie private, dan satu siklus payroll paralel sudah cocok dengan Excel/perhitungan sekolah.
