# AGENTS.md — KLAAR

Dokumen ini berlaku untuk seluruh workspace KLAAR. Ikuti instruksi yang lebih spesifik jika kelak ada `AGENTS.md` lain di subdirektori.

## Tujuan proyek

KLAAR adalah aplikasi administrasi sekolah yang mencakup lisensi, data karyawan, presensi/selfie, penggajian, toko/checkout, dan aplikasi Android karyawan. Prioritas utama setiap perubahan adalah:

1. keamanan data dan isolasi antarsekolah;
2. ketepatan perhitungan payroll;
3. kestabilan alur admin dan karyawan;
4. kompatibilitas deployment web, Supabase, dan APK;
5. antarmuka yang sederhana, responsif, dan konsisten dengan merek KLAAR.

## Peta repository

- `index.html`: landing/login utama.
- `admin.html`: aplikasi admin; file besar dengan HTML, CSS, dan JavaScript inline.
- `employee.html`: aplikasi karyawan/presensi.
- `store.html`, `checkout.html`, `seller-admin.html`, `credential-center.html`: alur toko, pembelian, penjual, dan kredensial.
- `payroll-import-core.js`: logika bersama untuk impor payroll.
- `service-worker.js`, `*-manifest.json`, `vercel.json`: PWA, cache, dan deployment web.
- `supabase/functions/dynamic-handler/index.ts`: API/backend utama.
- `supabase/migrations/`: perubahan skema produksi yang berurutan dan dapat diaudit.
- `supabase/verify-production.sql`: pemeriksaan keamanan dan konfigurasi produksi.
- `android-employee/`: wrapper Android aplikasi karyawan.
- `.github/workflows/`: build dan release APK.
- `tests/payroll-regression.html` dan `tests/run-payroll-regression.ps1`: regression test payroll.
- `docs/PRODUCTION-HARDENING-STEPS.md`: prosedur wajib sebelum memakai data nyata.
- `docs/struktur-database-v4.md`: referensi struktur data.
- `LOGIKA_LEMBUR_DAN_ATURAN_GAJI.md`: prinsip bisnis lembur dan komponen gaji.

## Cara bekerja

- Baca file yang relevan dan telusuri pemanggil/penggunanya sebelum mengubah kode. Gunakan `rg` untuk pencarian.
- Buat perubahan sekecil mungkin yang menyelesaikan akar masalah. Jangan melakukan refactor luas tanpa permintaan eksplisit.
- Pertahankan perubahan pengguna yang tidak terkait. Jangan menghapus, memindahkan, atau memformat ulang file secara massal.
- Karena halaman utama memakai skrip dan gaya inline, periksa benturan nama fungsi, ID elemen, selector CSS, handler, dan state sebelum menambahkan implementasi baru.
- Pertahankan kompatibilitas data lama. Jika bentuk data berubah, sediakan normalisasi/fallback atau migration yang jelas.
- Gunakan bahasa Indonesia untuk teks UI dan dokumentasi pengguna, kecuali istilah teknis yang memang lebih jelas dalam bahasa Inggris.
- Jangan menganggap folder ini selalu memiliki metadata Git. Verifikasi dulu sebelum menjalankan perintah Git.
- Jangan mengedit artefak sementara seperti `tests/.browser-profile-*`, screenshot runtime, output build, APK, atau cache.

## Aturan bisnis yang wajib dipertahankan

- Semua data sekolah harus terisolasi berdasarkan lisensi/tenant. Pengguna dari satu sekolah tidak boleh dapat membaca atau mengubah data sekolah lain.
- Lembur tidak otomatis menjadi komponen payroll hanya karena check-in di luar jadwal. Lembur harus ditandai sebagai potensi, disetujui admin, lalu dimasukkan ke payroll.
- Perubahan absensi atau komponen gaji yang memengaruhi payroll harus memicu atau menghasilkan perhitungan ulang yang konsisten.
- Impor Excel harus toleran terhadap variasi yang sudah didukung, tetapi tidak boleh menebak data ambigu secara diam-diam.
- Password default harus memaksa pengguna mengganti password.
- Sesi admin dan karyawan harus pulih setelah refresh selama pengguna belum logout.
- URL selfie harus bersifat sementara; bucket selfie produksi harus private.

## Keamanan dan data produksi

- Jangan pernah menulis, menampilkan, commit, atau menyalin secret ke source maupun log. Ini termasuk `.env`, password, token, keystore, service-role key, `LICENSE_SECRET`, dan `CRON_SECRET`.
- Jangan memasukkan service-role key atau logika otorisasi istimewa ke frontend.
- Operasi sensitif harus divalidasi di backend, bukan hanya disembunyikan atau dicegah oleh UI.
- Pertahankan RLS dan pemeriksaan tenant pada tabel Supabase. Jangan membuat policy permisif untuk memudahkan pengujian.
- Jangan mengubah `storage.objects` secara manual.
- Jangan menjalankan migration, deploy, rotasi secret, menghapus data, menerbitkan lisensi, atau merilis APK tanpa permintaan eksplisit pengguna.
- Untuk perubahan skema, tambahkan migration baru; jangan mengubah migration produksi lama yang mungkin sudah dijalankan.
- Sebelum tindakan terhadap data nyata, ikuti backup dan checklist pada `docs/PRODUCTION-HARDENING-STEPS.md`.

## Pedoman frontend

- Pertahankan identitas visual KLAAR, token warna yang sudah ada, dan logo resmi di root.
- Pastikan tampilan tetap layak pada desktop dan viewport ponsel sekitar 390 px.
- Hindari dependensi baru untuk perubahan yang dapat diselesaikan dengan HTML/CSS/JavaScript yang sudah dipakai proyek.
- Berikan state loading, sukses, kosong, dan gagal untuk operasi asinkron yang disentuh.
- Jangan mengandalkan warna saja untuk menyampaikan status; pertahankan label dan kontras yang terbaca.
- Saat mengubah service worker atau aset yang dicache, periksa strategi invalidasi agar pengguna tidak tertahan pada versi lama.

## Pedoman backend dan database

- Pertahankan kontrak action/request/response yang digunakan semua halaman. Cari seluruh pemakaian action sebelum mengganti nama atau bentuk respons.
- Validasi tipe, field wajib, otorisasi, tenant, dan batas input pada Edge Function.
- Gunakan status HTTP serta pesan error yang aman dan dapat ditindaklanjuti; jangan membocorkan stack trace atau secret.
- Migration harus idempotent jika masuk akal, aman terhadap data yang sudah ada, dan disertai pembaruan `supabase/verify-production.sql` bila invariant produksi berubah.
- Untuk perubahan cron, storage, atau RLS, jelaskan dampak operasional dan langkah verifikasinya.

## Verifikasi

Jalankan pemeriksaan yang relevan dengan bagian yang diubah:

### JavaScript/HTML

- Parse JavaScript standalone dengan `node --check <file>`.
- Untuk script inline HTML, ekstrak setiap `<script>` lalu parse dengan `vm.Script`, atau gunakan pemeriksaan setara.
- Lakukan smoke test di browser untuk halaman yang diubah dan periksa console error.
- Uji desktop dan mobile jika perubahan menyentuh layout atau interaksi.

### Payroll

Jalankan:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-payroll-regression.ps1
```

Setiap perubahan pada impor, absensi, komponen gaji, pembulatan, atau total payroll wajib menjalankan regression test dan mencocokkan minimal satu contoh secara manual.

### Supabase

- Periksa TypeScript Edge Function dan kontrak action yang terdampak.
- Untuk perubahan schema/security, tinjau migration serta jalankan query pada `supabase/verify-production.sql` di lingkungan yang memang diizinkan pengguna.
- Jangan mengklaim RLS, cron, storage, atau migration berhasil di produksi jika hanya diperiksa secara statis.

### Android dan release

- Jika wrapper Android berubah, build varian yang relevan dan periksa manifest, permission, deep link, serta navigasi WebView.
- `versionCode` rilis harus selalu meningkat.
- Jangan membuat atau mengunggah release tanpa instruksi eksplisit.

Jika pemeriksaan tidak dapat dijalankan, sebutkan dengan jelas pemeriksaan yang dilewati dan alasannya.

## Kriteria selesai

Sebuah tugas dianggap selesai jika:

- perilaku yang diminta sudah diterapkan tanpa memperluas scope;
- jalur terkait dan kompatibilitas data lama sudah diperiksa;
- verifikasi relevan lulus atau keterbatasannya dilaporkan;
- tidak ada secret atau artefak lokal yang ikut ditambahkan;
- dokumentasi diperbarui jika kontrak, migration, prosedur produksi, atau aturan payroll berubah;
- ringkasan akhir menyebut file utama yang berubah, hasil pengujian, dan risiko/pekerjaan lanjutan yang benar-benar masih ada.

## Context Graph

Untuk setiap tugas di proyek ini:

- Gunakan skill Context Graph.
- Query `.context/graph.db` sebelum membaca file proyek.
- Gunakan graph yang sudah ada; jangan indeks ulang sebelum bekerja.
- Buka hanya node dan file yang relevan.
- Jika ada file yang berubah, indeks ulang satu kali setelah seluruh perubahan selesai.
- Jangan indeks ulang jika tugas hanya berupa pertanyaan dan file tidak berubah.
- Laporkan estimasi konteks yang dihindari jika diminta.
