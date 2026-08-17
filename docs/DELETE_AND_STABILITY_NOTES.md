# Klaar V5.3 — Hard Delete + Stability Notes

## Perbaikan hapus karyawan
Versi ini tidak lagi hanya mengandalkan autosync payload besar untuk menghapus karyawan. Admin PWA sekarang memanggil endpoint server khusus `deleteEmployee`, sehingga karyawan dihapus langsung dari payload server, mirror Sheet, attendance record, request, device request, sent slip, dan payroll lock.

## Kenapa sebelumnya masih muncul?
Karena data server lama masih bisa digabung lagi saat autosync/refresh. Tombstone di payload tidak selalu cukup jika proses save/merge tertunda; backend dan frontend harus selalu dirilis sebagai pasangan versi yang kompatibel.

## Catatan stabilitas
Backend produksi menggunakan Supabase/PostgreSQL. Skalakan berdasarkan penggunaan nyata, indeks, konkurensi, storage, dan hasil load test; jangan memakai Spreadsheet sebagai database aplikasi.
