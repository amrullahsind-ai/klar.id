$ErrorActionPreference = "Stop"

$guideRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $guideRoot "..\..")).Path
$assetRoot = Join-Path $guideRoot "assets"
$profileRoot = Join-Path $guideRoot ".browser-profile-guide"
$guideHtml = Join-Path $guideRoot "PANDUAN-PENGGUNAAN-KLAAR.html"
$guidePdf = Join-Path $guideRoot "PANDUAN-PENGGUNAAN-KLAAR.pdf"

$browserCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw "Chrome/Edge tidak ditemukan." }

New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null

function Invoke-Browser {
  param([string[]]$Arguments)
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $browser
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.Arguments = ($Arguments | ForEach-Object {
    if ($_ -match '\s') { '"' + $_.Replace('"', '\"') + '"' } else { $_ }
  }) -join " "
  $process = [Diagnostics.Process]::Start($startInfo)
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Browser gagal (exit $($process.ExitCode)): $stderr"
  }
  return $stdout
}

function Convert-ToFileUri([string]$Path, [string]$Query = "") {
  $uri = [Uri]::new((Resolve-Path -LiteralPath $Path).Path).AbsoluteUri
  return $uri + $Query
}

function Capture-Admin([string]$Name, [string]$Query) {
  $capture = Join-Path $guideRoot "guide-capture.html"
  $output = Join-Path $assetRoot ($Name + ".png")
  if ((Test-Path -LiteralPath $output) -and (Get-Item -LiteralPath $output).Length -gt 10000) {
    Write-Host "Sudah ada, lewati: $Name" -ForegroundColor DarkGray
    return
  }
  Invoke-Browser @(
    "--headless=new"
    "--no-sandbox"
    "--disable-gpu"
    "--disable-crash-reporter"
    "--allow-file-access-from-files"
    "--hide-scrollbars"
    "--no-first-run"
    "--user-data-dir=$profileRoot-$Name"
    "--window-size=1440,1000"
    "--virtual-time-budget=12000"
    "--run-all-compositor-stages-before-draw"
    "--screenshot=$output"
    (Convert-ToFileUri $capture $Query)
  ) | Out-Null
  if (-not (Test-Path -LiteralPath $output)) { throw "Screenshot $Name gagal dibuat." }
  Write-Host "Screenshot: $Name" -ForegroundColor Cyan
}

Capture-Admin "01-admin-login" "?mode=login"
Capture-Admin "02-dashboard-v3" "?section=dashboard"
Capture-Admin "03-karyawan" "?section=employees"
Capture-Admin "04-aturan-gaji" "?section=salaryRules"
Capture-Admin "05-aturan-absensi" "?section=attendanceRules"
Capture-Admin "06-monitor-absensi" "?section=monitor"
Capture-Admin "07-payroll" "?section=payroll"
Capture-Admin "08-import-excel-v3" "?section=importExcel"
Capture-Admin "09-laporan-v2" "?section=reports"
Capture-Admin "10-profil" "?section=settings"

$employeeOutput = Join-Path $assetRoot "11-employee-aktivasi.png"
$employeeHtml = Join-Path $repoRoot "employee.html"
Invoke-Browser @(
  "--headless=new"
  "--no-sandbox"
  "--disable-gpu"
  "--disable-crash-reporter"
  "--hide-scrollbars"
  "--no-first-run"
  "--user-data-dir=$profileRoot-employee"
  "--window-size=430,900"
  "--virtual-time-budget=3000"
  "--run-all-compositor-stages-before-draw"
  "--screenshot=$employeeOutput"
  (Convert-ToFileUri $employeeHtml)
) | Out-Null
if (-not (Test-Path -LiteralPath $employeeOutput)) { throw "Screenshot employee gagal dibuat." }

Invoke-Browser @(
  "--headless=new"
  "--no-sandbox"
  "--disable-gpu"
  "--disable-crash-reporter"
  "--no-first-run"
  "--user-data-dir=$profileRoot-pdf"
  "--virtual-time-budget=5000"
  "--print-to-pdf=$guidePdf"
  "--print-to-pdf-no-header"
  (Convert-ToFileUri $guideHtml)
) | Out-Null

if (-not (Test-Path -LiteralPath $guidePdf)) { throw "PDF gagal dibuat." }
$pdf = Get-Item -LiteralPath $guidePdf
Write-Host "PANDUAN SELESAI: $($pdf.FullName) ($([math]::Round($pdf.Length / 1MB, 2)) MB)" -ForegroundColor Green
