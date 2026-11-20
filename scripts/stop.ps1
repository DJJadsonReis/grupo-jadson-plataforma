param()

$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$ErrorActionPreference = 'Continue'
$failures = [System.Collections.Generic.List[string]]::new()
$failurePrefix = 'N' + [char]0x00E3 + 'o foi poss' + [char]0x00ED + 'vel'
$codeLabel = 'c' + [char]0x00F3 + 'digo'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$processFile = Join-Path $ProjectRoot '.runtime\processes.json'
$entries = @()
if (Test-Path $processFile) {
  $entries = @(Get-Content -LiteralPath $processFile -Raw -Encoding utf8 | ConvertFrom-Json)
  foreach ($entry in $entries) {
    if ($entry.Name -eq 'postgresql') { continue }
    $proc = Get-Process -Id $entry.Pid -ErrorAction SilentlyContinue
    if ($proc) {
      & taskkill.exe /PID $entry.Pid /T /F | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Output "Encerrado $($entry.Name) (PID $($entry.Pid))."
      } else {
        $failures.Add("$failurePrefix encerrar $($entry.Name) (PID $($entry.Pid)); $codeLabel $LASTEXITCODE.")
      }
    }
  }
  Remove-Item -LiteralPath $processFile -Force
} else {
  Write-Output ('Nenhum servi' + [char]0x00E7 + 'o local registrado para encerrar.')
}
$pgWasStarted = $entries | Where-Object { $_.Name -eq 'postgresql' } | Select-Object -First 1
$pgCtl = Join-Path $ProjectRoot 'tools\postgresql\bin\pg_ctl.exe'
$pgData = Join-Path $ProjectRoot '.runtime\database'
if ($pgWasStarted -and (Test-Path $pgCtl) -and (Test-Path (Join-Path $pgData 'PG_VERSION'))) {
  & $pgCtl -D $pgData -m fast stop
  if ($LASTEXITCODE -ne 0) { $failures.Add("$failurePrefix parar o PostgreSQL; $codeLabel $LASTEXITCODE.") }
}
if ($failures.Count -gt 0) {
  foreach ($failure in $failures) { [Console]::Error.WriteLine($failure) }
  exit 1
}
Write-Output ('Encerramento dos processos registrados conclu' + [char]0x00ED + 'do.')
