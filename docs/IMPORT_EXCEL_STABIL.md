# Import Excel Stabil Klar V4.8

Versi ini memperbaiki import Excel yang sebelumnya terlalu agresif.

## Prinsip baru
- Tidak semua sheet diimport otomatis.
- `SLIP GAJI`, `POTONGAN BPJS JHT`, dan `PINJAMAN` dilewati default agar judul/teks bebas tidak ikut menjadi karyawan.
- Sheet inti yang otomatis dibaca: `ABSENSI PER TMT`, `Gapok`, `TJ. FUNGSIONAL`, dan `PER UNIT`.
- Baris judul, baris angka urutan kolom, baris rate biaya, dan baris kosong difilter.
- Nama kode seperti `AA1` tidak dipakai sebagai nama karyawan kecuali berhasil dicocokkan ke nama asli dari master.

## Mapping Excel contoh
- `ABSENSI PER TMT` → master nama asli, TTL, NRK, jabatan, golongan, masa kerja.
- `Gapok` → aturan golongan/gaji pokok/tunjangan hadir.
- `TJ. FUNGSIONAL` → aturan jabatan/tunjangan fungsional/tunjangan rumah.
- `PER UNIT` → payroll awal/snapshot.

## Catatan
Kalau data lama sudah terlanjur salah terimport, tes dengan database/lisensi baru atau hapus data import lama dulu.
