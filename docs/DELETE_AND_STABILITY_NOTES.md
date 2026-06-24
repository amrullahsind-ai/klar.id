# Klar V5.3 — Hard Delete + Stability Notes

## Perbaikan hapus karyawan
Versi ini tidak lagi hanya mengandalkan autosync payload besar untuk menghapus karyawan. Admin PWA sekarang memanggil endpoint server khusus `deleteEmployee`, sehingga karyawan dihapus langsung dari payload server, mirror Sheet, attendance record, request, device request, sent slip, dan payroll lock.

## Kenapa sebelumnya masih muncul?
Karena data server lama masih bisa digabung lagi saat autosync/refresh. Tombstone di payload tidak selalu cukup kalau proses save/merge tertunda atau file Apps Script lama belum redeploy.

## Catatan stabilitas
Apps Script + Google Sheet cukup untuk pilot kecil-menengah, tapi masih belum ideal untuk ratusan pengguna aktif serentak. Untuk produksi skala besar, arahkan ke backend database seperti Supabase/Firebase/PostgreSQL.
