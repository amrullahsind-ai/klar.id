# Struktur Database Klar V4

## _licenses
Master daftar pembeli/lisensi.

Kolom:
- licenseCode
- schoolName
- schoolCode
- status
- plan
- expiresAt
- createdAt
- notes

## _database
Menyimpan payload JSON per lisensi.

Kolom:
- licenseCode
- schoolCode
- payload
- updatedAt

## settings
Branding, tema, adminUser, adminHash, logo, aturan umum.

## attendanceRules
Aturan GPS:
- name
- lat
- lng
- radiusMeters
- maxAccuracyMeters
- checkinStart
- lateAfter
- checkoutStart
- requireCheckout
- leaveNeedsApproval
- sickNeedsApproval

## employees
Data karyawan:
- name
- nip
- employeePinHash
- position
- grade
- join
- status
- bank
- phone

## attendanceRecords
Record harian:

attendanceRecords[date][employeeId]

Berisi:
- status: hadir/izin/sakit/alpha
- checkInTime
- checkOutTime
- distanceMeters
- accuracy
- isLate
- reason
- source

## attendanceRequests
Pengajuan izin/sakit:
- employeeId
- type
- date
- reason
- proof
- status: pending/approved/rejected

## locks
Snapshot payroll final per bulan.


## Update Multi Lokasi

`attendanceRules.locations` berisi daftar titik absensi: id, name, lat, lng, radiusMeters, maxAccuracyMeters, active.

Saat karyawan check-in, server menghitung jarak ke semua lokasi aktif dan memilih lokasi yang masuk radius. Jika tidak ada yang masuk radius, check-in ditolak.

## Update Login Karyawan

Karyawan bisa login dengan salah satu dari: loginName, name, atau nip. Password disimpan sebagai hash di `employeePinHash` agar kompatibel dengan versi lama.
