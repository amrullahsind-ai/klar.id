# Troubleshooting Klar

## Employee tidak bisa login

Cek:
- Web App URL harus berakhir `/exec`.
- Apps Script sudah di-deploy ulang dengan New version.
- Karyawan sudah tersimpan di server.
- PIN default hasil import biasanya `1234`.

Tes server:

`URL_APPS_SCRIPT/exec?action=ping&callback=test`

Hasil benar harus berbentuk:

`test({"ok":true,...})`

## Data tidak muncul di Monitor Admin

Cek:
- Klik Refresh di admin.
- Pastikan tanggal monitor benar.
- Upload Apps Script terbaru karena tanggal lokal dan status telat dihitung di backend juga.

## Telat masih tampil Hadir

Cek:
- Aturan Absensi → Batas Telat.
- Klik Rekalkulasi Telat.
- Pastikan Apps Script sudah versi paket ini.

## Tampilan lama masih muncul

Cek:
- Buka incognito.
- Tekan Ctrl + Shift + R.
- Pastikan file `service-worker.js` ikut ter-upload.
