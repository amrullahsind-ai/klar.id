# Panduan Pembeli Klaar

Panduan ini untuk pembeli lisensi Klaar setelah pembayaran dikonfirmasi.

## Yang Anda terima

1. Kode lisensi Klaar melalui email.
2. Satu link setup berisi tutorial dan file backend `master-apps-script-v5.gs`.
3. Template Excel import jika diperlukan.
4. Link aplikasi Klaar Admin yang di-host oleh Klaar.

## Alur Aktivasi

### 1. Buat database sekolah

1. Buka Google Drive.
2. Buat Google Sheet baru.
3. Beri nama, misalnya `Database Klaar - Nama Sekolah`.

### 2. Pasang backend Apps Script

1. Di Google Sheet, klik `Extensions` > `Apps Script`.
2. Hapus kode bawaan yang muncul.
3. Buka file backend `master-apps-script-v5.gs` dari link setup yang dikirim di email.
4. Salin seluruh isi file tersebut.
5. Paste ke Apps Script.
6. Klik `Save`.

### 3. Deploy sebagai Web App

1. Klik `Deploy` > `New deployment`.
2. Pilih type `Web app`.
3. Isi:
   - `Execute as`: `Me`
   - `Who has access`: `Anyone`
4. Klik `Deploy`.
5. Setujui izin Google yang diminta.
6. Salin Web App URL yang berakhiran `/exec`.

### 4. Aktivasi Klaar Admin

1. Buka link Klaar Admin dari email.
2. Isi `License Server URL` dengan Web App URL `/exec`.
3. Isi `Kode Lisensi` dengan kode lisensi dari email.
4. Klik aktivasi.
5. Login awal:
   - Username: `admin`
   - Password/PIN: `1234`
6. Segera ganti password/PIN admin.

## Catatan Penting

- Satu lisensi hanya untuk satu sekolah/yayasan.
- Jangan membagikan kode lisensi ke pihak lain.
- Jangan menghapus Google Sheet database Klaar.
- Jika deploy Apps Script diubah, pastikan klik `Deploy` versi baru, bukan hanya `Save`.

## Bantuan

Jika aktivasi gagal, kirim ke support:

- Order ID
- Email pembelian
- Screenshot error
- Web App URL Apps Script yang dipakai
