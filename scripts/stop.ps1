param()

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$processFile = Join-Path $ProjectRoot '.runtime\processes.json'
if (Test-Path $processFile) {
  $entries = @(Get-Content -LiteralPath $processFile -Raw -Encoding utf8 | ConvertFrom-Json)
  foreach ($entry in $entries) {
    if ($entry.Name -eq 'postgresql') { continue }
    $proc = Get-Process -Id $entry.Pid -ErrorAction SilentlyContinue
    if ($proc) {
      & taskkill.exe /PID $entry.Pid /T /F | Out-Null
      Write-Output "Encerrado $($entry.Name) (PID $($entry.Pid))."
    }
  }
  Remove-Item -LiteralPath $processFile -Force
}
$pgWasStarted = $entries | Where-Object { $_.Name -eq 'postgresql' } | Select-Object -First 1
$pgCtl = Join-Path $ProjectRoot 'tools\postgresql\bin\pg_ctl.exe'
$pgData = Join-Path $ProjectRoot '.runtime\database'
if ($pgWasStarted -and (Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
  & $pgCtl -D $pgData -m fast stop
}
Write-Output 'Encerramento dos processos registrados concluído.'
