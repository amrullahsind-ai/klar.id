param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot '..\backups\manual')
)

$ErrorActionPreference = 'Stop'

if (-not $env:KLAAR_DATABASE_URL) {
  throw 'Set environment variable KLAAR_DATABASE_URL untuk sesi terminal ini. Jangan simpan URL database di source.'
}

$supabase = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabase) {
  throw 'Supabase CLI belum tersedia. Instal CLI resmi, lalu jalankan skrip ini kembali.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $OutputRoot $stamp
$resolvedRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$resolvedTarget = [System.IO.Path]::GetFullPath($target)
if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Target backup berada di luar folder backup yang diizinkan.'
}

New-Item -ItemType Directory -Path $resolvedTarget -Force | Out-Null

& $supabase.Source db dump --db-url $env:KLAAR_DATABASE_URL --file (Join-Path $resolvedTarget 'database.sql')
if ($LASTEXITCODE -ne 0) {
  throw 'Database dump gagal.'
}

@{
  createdAt = (Get-Date).ToString('o')
  includesStorageObjects = $false
  restoreTestRequired = $true
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resolvedTarget 'backup-info.json') -Encoding utf8

Write-Host "Backup database selesai: $resolvedTarget"
Write-Warning 'Isi Supabase Storage tidak termasuk. Selfie sementara mengikuti kebijakan retensi terpisah.'

