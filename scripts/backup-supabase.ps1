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

& $supabase.Source db dump --db-url $env:KLAAR_DATABASE_URL --file (Join-Path $resolvedTarget 'schema.sql')
if ($LASTEXITCODE -ne 0) {
  throw 'Dump skema database gagal.'
}

& $supabase.Source db dump --db-url $env:KLAAR_DATABASE_URL --data-only --use-copy --file (Join-Path $resolvedTarget 'data.sql')
if ($LASTEXITCODE -ne 0) {
  throw 'Dump data database gagal.'
}

& $supabase.Source db dump --db-url $env:KLAAR_DATABASE_URL --role-only --file (Join-Path $resolvedTarget 'roles.sql')
if ($LASTEXITCODE -ne 0) {
  throw 'Dump role database gagal.'
}

$files = @('schema.sql', 'data.sql', 'roles.sql') | ForEach-Object {
  $item = Get-Item -LiteralPath (Join-Path $resolvedTarget $_)
  if ($item.Length -le 0) { throw "File backup kosong: $($_)" }
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $item.FullName
  @{
    name = $item.Name
    bytes = $item.Length
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

@{
  createdAt = (Get-Date).ToString('o')
  formatVersion = 2
  files = $files
  includesStorageObjects = $false
  restoreTestRequired = $true
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resolvedTarget 'backup-info.json') -Encoding utf8

Write-Host "Backup database selesai: $resolvedTarget"
Write-Host 'Skema, data, role, ukuran file, dan checksum SHA-256 sudah dicatat.'
Write-Warning 'Isi Supabase Storage tidak termasuk. Selfie sementara mengikuti kebijakan retensi terpisah.'
