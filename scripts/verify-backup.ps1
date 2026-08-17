param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
$resolved = [System.IO.Path]::GetFullPath($BackupDirectory)
if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
  throw 'Folder backup tidak ditemukan.'
}

$manifestPath = Join-Path $resolved 'backup-info.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw 'backup-info.json tidak ditemukan.'
}

$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ([int]$manifest.formatVersion -lt 2) {
  throw 'Format backup lama tidak memuat dump data/checksum. Buat backup baru.'
}

foreach ($entry in $manifest.files) {
  $path = Join-Path $resolved ([string]$entry.name)
  $fullPath = [System.IO.Path]::GetFullPath($path)
  if (-not $fullPath.StartsWith($resolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Manifest mencoba membaca file di luar folder backup.'
  }
  if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    throw "File backup hilang: $($entry.name)"
  }
  $item = Get-Item -LiteralPath $fullPath
  if ($item.Length -ne [long]$entry.bytes) {
    throw "Ukuran file berubah: $($entry.name)"
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $fullPath).Hash.ToLowerInvariant()
  if ($actual -ne [string]$entry.sha256) {
    throw "Checksum tidak cocok: $($entry.name)"
  }
}

Write-Host "Backup valid: $resolved"
Write-Host "Dibuat: $($manifest.createdAt)"
Write-Warning 'Validasi checksum bukan pengganti uji restore ke database staging.'
