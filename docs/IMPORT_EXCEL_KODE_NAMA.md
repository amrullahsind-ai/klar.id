# Import Excel Kode-Nama Klar V4.9

Versi ini dipakai untuk Excel sekolah yang kolom NAMA memang berisi kode seperti AA1, AA2, dan seterusnya.

## Prinsip
- Sheet `ABSENSI PER TMT` dianggap data lama dan **tidak dipakai otomatis**.
- Sheet `PER UNIT` menjadi sumber utama payroll awal.
- Kode pada kolom nama/karyawan diperlakukan sebagai identitas karyawan yang sah.
- Baris baru dianggap valid hanya jika memiliki identitas karyawan dan nominal gaji yang valid.
- Judul/header/catatan tetap difilter agar tidak masuk sebagai karyawan.

## Mapping yang disarankan
- `PER UNIT` → Payroll Awal dan karyawan draft
- `Gapok` → Golongan / gaji pokok
- `TJ. FUNGSIONAL` → Jabatan / tunjangan fungsional
- `SLIP GAJI`, `PINJAMAN`, `POTONGAN BPJS JHT` → abaikan dulu, atau import manual setelah dicek

## Kenapa tidak pakai ABSENSI PER TMT?
Karena pada kasus ini sheet tersebut sudah lawas. Memaksa mencocokkan nama ke sheet lawas justru membuat jabatan, nama, dan payroll salah.


## V5.0 Import Stability + UI Fix
- Tombol aksi tabel dibuat menyamping.
- Import Excel menolak baris judul/header agar tidak masuk sebagai karyawan.
- Data karyawan dari Excel tidak langsung hilang saat pindah ke Payroll karena refresh server ditahan sampai autosync berjalan.
- Jabatan/golongan hasil import tidak direset otomatis hanya karena jumlahnya banyak.
