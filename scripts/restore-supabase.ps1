param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,
  [switch]$ConfirmRestore,
  [switch]$AllowProduction
)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmRestore) {
  throw 'Restore dapat menimpa database target. Jalankan ulang dengan -ConfirmRestore setelah target diverifikasi.'
}
if (-not $env:KLAAR_RESTORE_DATABASE_URL) {
  throw 'Set KLAAR_RESTORE_DATABASE_URL ke database staging/restore. Jangan simpan URL di source.'
}
if (-not $AllowProduction -and $env:KLAAR_RESTORE_DATABASE_URL -match 'swvqagxwwoefnrezqfnq') {
  throw 'Target terlihat seperti proyek produksi KLAAR. Gunakan database staging. -AllowProduction hanya untuk prosedur insiden yang disetujui.'
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) { throw 'psql belum tersedia di PATH.' }

$verifyScript = Join-Path $PSScriptRoot 'verify-backup.ps1'
& $verifyScript -BackupDirectory $BackupDirectory
if ($LASTEXITCODE -ne 0) { throw 'Validasi backup gagal.' }

$resolved = [System.IO.Path]::GetFullPath($BackupDirectory)
$schema = Join-Path $resolved 'schema.sql'
$data = Join-Path $resolved 'data.sql'

Write-Host 'Memulihkan skema ke database target...'
& $psql.Source $env:KLAAR_RESTORE_DATABASE_URL -v ON_ERROR_STOP=1 -f $schema
if ($LASTEXITCODE -ne 0) { throw 'Restore skema gagal.' }

Write-Host 'Memulihkan data ke database target...'
& $psql.Source $env:KLAAR_RESTORE_DATABASE_URL -v ON_ERROR_STOP=1 -f $data
if ($LASTEXITCODE -ne 0) { throw 'Restore data gagal.' }

Write-Host 'Restore selesai. Jalankan supabase/verify-production.sql terhadap target sebelum menyatakan uji berhasil.'
