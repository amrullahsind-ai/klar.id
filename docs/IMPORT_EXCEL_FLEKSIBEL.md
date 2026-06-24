# Import Excel Fleksibel Klar V4.6

Fitur ini dibuat untuk Excel sekolah/yayasan yang sudah lama dipakai dan biasanya punya banyak tab, judul tidak standar, dan nama sheet tidak sama dengan template Klar.

## Cara pakai

1. Buka **Klar Admin**.
2. Masuk ke menu **Import Excel**.
3. Upload file Excel lama.
4. Pilih mode **Fleksibel / Scan Semua Sheet**.
5. Klik **Baca & Analisis**.
6. Cek tabel **Analisis Semua Sheet**.
7. Centang sheet yang ingin diimport.
8. Ubah mode sheet jika tebakan Klar kurang tepat.
9. Cek preview sheet aktif.
10. Klik **Terapkan Import**.

## Yang bisa dibaca

- Sheet karyawan walaupun namanya `SDM`, `Guru`, `Data Pegawai`, atau nama lain.
- Sheet jabatan/fungsional.
- Sheet golongan/gapok.
- Sheet potongan.
- Sheet payroll/slip/rekap gaji.

## Catatan

Import tetap harus dicek lewat preview. Payroll adalah data sensitif, jadi Klar tidak langsung menimpa data tanpa konfirmasi admin.


## Update V4.7 Flexible Import Fix
- Import Excel kini menggabungkan data antar sheet memakai KODESLIP/NRK agar payroll yang berisi kode seperti AA1 tetap bisa memakai nama asli dari sheet master.
- Deteksi header lebih fleksibel: header boleh tidak berada di baris pertama.
- Kolom masa kerja, join date, grade khusus, unit, rekening, dan gaji payroll seperti GAJI POKOK/TUNJANGAN/POTONGAN/GAJI BERSIH ikut dibaca.
- Preview import sekarang menampilkan hasil terjemahan: Nama, Kode Slip, NRK, Jabatan, Golongan, Masa Kerja, Gaji Pokok, Tunjangan, Potongan, dan Gaji Bersih.
- Sheet PER UNIT cocok dijadikan Payroll Awal, ABSENSI PER TMT cocok jadi master karyawan, Gapok jadi Golongan, dan TJ. FUNGSIONAL jadi Jabatan.
