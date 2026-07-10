Taruh screenshot aplikasi di folder ini dengan NAMA FILE PERSIS seperti di bawah.
Begitu file ada, galeri di halaman /store akan otomatis menampilkannya
(menggantikan kotak placeholder). Format .png (boleh juga .jpg, tapi ganti
ekstensi di store.html bila pakai jpg).

Nama file yang dipakai store.html:
  admin-dashboard.png   -> Dashboard Admin
  admin-karyawan.png    -> Kelola Karyawan
  admin-absensi.png     -> Monitor Absensi
  admin-payroll.png     -> Payroll & Slip Gaji
  employee-checkin.png  -> Aplikasi Karyawan (Check-in GPS)
  admin-gaji.png        -> Aturan Gaji

Tips:
- Ukuran disarankan lebar ~1200px, rasio kira-kira 16:10 supaya pas di frame.
- Untuk screenshot HP (aplikasi karyawan), tetap boleh; gambar akan dipotong
  rapi (object-fit: cover, fokus bagian atas).
- Mau tambah/ubah judul atau jumlah frame? Edit bagian <section id="tampilan">
  di store.html.
