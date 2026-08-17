# Respons Insiden KLAAR

## Tingkat insiden

- **SEV-1:** dugaan kebocoran lintas sekolah, service-role/secret bocor, data terhapus massal, atau payroll salah secara luas.
- **SEV-2:** satu tenant tidak dapat bekerja, backup/cron gagal berulang, pembayaran/lisensi salah, atau fitur penting rusak.
- **SEV-3:** gangguan terbatas dengan workaround.

## Langkah awal

1. Catat waktu, pelapor, tenant terdampak, gejala, dan perubahan terakhir.
2. Jangan menghapus log atau menjalankan migration tambahan.
3. Batasi dampak: tangguhkan lisensi/akun, cabut sesi, nonaktifkan fitur, atau rollback frontend yang diketahui aman sesuai kewenangan.
4. Untuk secret bocor, rotasi melalui pengelola secret dan deploy ulang fungsi; jangan menempel secret ke tiket/chat/source.
5. Ambil backup forensik sebelum koreksi data jika aman dilakukan.
6. Verifikasi tenant isolation dan bandingkan audit log.

## Komunikasi

Gunakan satu PIC insiden. Beri pembaruan berbasis fakta: dampak yang diketahui, mitigasi, tindakan yang diminta pelanggan, dan waktu pembaruan berikutnya. Jangan menyimpulkan akar masalah sebelum ada bukti. Pemberitahuan kepada sekolah/subjek/regulator harus mengikuti DPA dan hukum yang berlaku.

## Pemulihan

- Restore hanya ke staging terlebih dahulu untuk menguji backup.
- Rekonsiliasi jumlah tenant, karyawan, absensi, payroll, order, lisensi, serta checksum/hasil query verifikasi.
- Untuk payroll, jalankan regression test dan cocokkan sampel manual sebelum membuka akses.
- Buka layanan bertahap dan pantau minimal satu jam.

## Setelah insiden

Dalam postmortem tulis timeline, akar masalah, cakupan data, keputusan, apa yang berhasil/gagal, tindakan pencegahan, pemilik, dan tenggat. Hindari menyalahkan individu. Tutup insiden hanya setelah tindakan kritis mempunyai bukti verifikasi.
