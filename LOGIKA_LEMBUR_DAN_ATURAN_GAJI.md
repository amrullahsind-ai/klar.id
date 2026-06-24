# Logika Lembur dan Aturan Gaji Klar

## Prinsip lembur

Lembur tidak langsung dihitung otomatis hanya karena karyawan check-in. Alur yang aman:

1. Sekolah punya jadwal kerja dan kalender libur.
2. Karyawan masuk di luar jadwal normal atau pada hari libur.
3. Sistem menandai potensi lembur.
4. Admin melakukan approval.
5. Setelah disetujui, lembur masuk sebagai komponen payroll.

## Jenis komponen

- Komponen tetap: gaji pokok, tunjangan jabatan, tunjangan golongan
- Komponen berbasis absensi: tunjangan hadir, potongan telat, potongan alpha
- Komponen berbasis jadwal: lembur hari libur, lembur malam
- Komponen manual: pinjaman, koreksi, bonus khusus

## Template Excel

Template `template-import-klar.xlsx` menyediakan sheet `Jadwal`, `Kalender Libur`, dan `Lembur` agar sekolah dapat memasukkan aturan sendiri. Untuk tahap pilot, nominal akhir payroll sebaiknya tetap dicek melalui sheet `Payroll Awal` sebelum diimport ke Klar.
