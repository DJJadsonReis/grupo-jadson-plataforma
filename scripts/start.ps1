param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& (Join-Path $PSScriptRoot 'setup.ps1')
$node = Join-Path $ProjectRoot 'tools\node\node.exe'
$pnpm = Join-Path $ProjectRoot 'tools\pnpm\node_modules\pnpm\bin\pnpm.cjs'
if (-not (Test-Path $node) -or -not (Test-Path $pnpm)) { throw 'Ambiente local incompleto: prepare Node 22 e pnpm 9.15.0 antes de iniciar.' }

$processFile = Join-Path $ProjectRoot '.runtime\processes.json'
$started = [System.Collections.Generic.List[object]]::new()
$logDir = Join-Path $ProjectRoot '.runtime\logs'
function Start-ProjectProcess([string]$Name, [string]$WorkingDirectory, [string[]]$Arguments) {
  $safe = $Name -replace '[^a-zA-Z0-9_-]','_'
  $stdout = Join-Path $logDir "$safe.out.log"
  $stderr = Join-Path $logDir "$safe.err.log"
  $proc = Start-Process -FilePath $node -ArgumentList (@($pnpm) + $Arguments) -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $started.Add([pscustomobject]@{ Name = $Name; Pid = $proc.Id; Stdout = $stdout; Stderr = $stderr })
}

$pgCtl = Join-Path $ProjectRoot 'tools\postgresql\bin\pg_ctl.exe'
$pgData = Join-Path $ProjectRoot '.runtime\database'
if (Test-Path $pgCtl) {
  if (-not (Test-Path (Join-Path $pgData 'PG_VERSION'))) { throw "PostgreSQL local existe, mas o cluster ainda nÃ£o foi inicializado. Nenhum dado foi alterado: $pgData" }
  & $pgCtl -D $pgData -l (Join-Path $logDir 'postgresql.log') start
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar PostgreSQL local.' }
  $postmasterPidFile = Join-Path $pgData 'postmaster.pid'
  if (Test-Path $postmasterPidFile) {
    $started.Add([pscustomobject]@{ Name = 'postgresql'; Pid = [int](Get-Content $postmasterPidFile -TotalCount 1) })
  }
} else { Write-Warning 'PostgreSQL portÃ¡til nÃ£o localizado; backend poderÃ¡ iniciar sem banco, conforme configuraÃ§Ã£o.' }

$redis = Join-Path $ProjectRoot 'tools\redis\redis-server.exe'
$redisConf = Join-Path $ProjectRoot 'tools\redis\redis.conf'
if (Test-Path $redis) {
  $redisDataDir = Join-Path $ProjectRoot '.runtime\redis'
  $redisLogDir = Join-Path $logDir 'redis'
  New-Item -ItemType Directory -Force -Path $redisDataDir, $redisLogDir | Out-Null
  $redisConf = Join-Path $ProjectRoot 'tools\redis\redis.conf'
  $redisArgs = @($redisConf, '--dir', $redisDataDir, '--logfile', (Join-Path $redisLogDir 'redis.log'))
  $proc = Start-Process -FilePath $redis -ArgumentList $redisArgs -WorkingDirectory $redisDataDir -PassThru -WindowStyle Hidden
  $started.Add([pscustomobject]@{ Name = 'redis'; Pid = $proc.Id })
} else { Write-Warning 'Redis portátil não localizado; backend poderá iniciar sem Redis.' }

Start-ProjectProcess 'backend' (Join-Path $ProjectRoot 'apps\backend') @('--dir', $ProjectRoot, '--filter', '@grupo-jadson/backend', 'dev')
Start-ProjectProcess 'frontend-vite' (Join-Path $ProjectRoot 'apps\desktop') @('--dir', $ProjectRoot, '--filter', '@grupo-jadson/desktop', 'dev:web')
$started | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $processFile -Encoding utf8
Write-Output "Processos do projeto iniciados. Logs: $logDir"
