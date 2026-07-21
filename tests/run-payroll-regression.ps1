$ErrorActionPreference = "Stop"

$browserCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browserCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$testFile = Join-Path $PSScriptRoot "payroll-regression.html"
$testUri = [System.Uri]::new($testFile).AbsoluteUri
$profile = Join-Path $PSScriptRoot ".browser-profile-regression"

if (-not $browser) {
  throw "Chrome/Edge tidak ditemukan."
}

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = $browser
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.Arguments = @(
  "--headless=new"
  "--no-sandbox"
  "--disable-gpu"
  "--disable-crash-reporter"
  "--no-first-run"
  "--user-data-dir=`"$profile`""
  "--dump-dom"
  "`"$testUri`""
) -join " "

$process = [System.Diagnostics.Process]::Start($startInfo)
$dom = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -ne 0) {
  throw "Browser test gagal dijalankan (exit $($process.ExitCode)): $stderr"
}

if ($dom -notmatch 'data-status="passed"') {
  $failed = [regex]::Matches(($dom -join "`n"), '<li data-result="fail">(.*?)</li>')
  if ($failed.Count) {
    $failed | ForEach-Object { Write-Host $_.Groups[1].Value -ForegroundColor Red }
  }
  throw "Payroll regression gagal."
}

$summary = [regex]::Match(($dom -join "`n"), '<p id="summary">(.*?)</p>')
Write-Host ("PAYROLL REGRESSION OK: " + $summary.Groups[1].Value) -ForegroundColor Green
