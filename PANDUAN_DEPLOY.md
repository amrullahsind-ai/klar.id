# Panduan Deploy Klar

## A. Deploy frontend ke GitHub/Vercel

1. Buat repo GitHub baru.
2. Upload semua file di folder ini ke root repo.
3. Deploy repo ke Vercel.
4. Setelah deploy, buka:
   - `/` untuk landing page
   - `/admin.html` untuk Klar Admin
   - `/employee.html` untuk Klar Hadir
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

## C. Aktivasi di Klar

1. Buka `/admin.html`.
2. Masukkan Web App URL Apps Script.
3. Masukkan kode lisensi, misalnya `EDUPAY-DEMO-0001`.
4. Klik aktivasi.
5. Login admin.
6. Klik Sync/Refresh untuk memastikan database sehat.

## D. Tes wajib sebelum dipakai

- Admin bisa login.
- Karyawan bisa login.
- Karyawan bisa check-in.
- Check-in lewat batas telat tampil sebagai Telat.
- Monitor Admin menampilkan absensi.
- Admin bisa ACC Telat menjadi Hadir.
- Payroll membaca telat.
- Slip muncul di employee setelah dikirim admin.
- Import Excel bisa preview sebelum diterapkan.
