[CmdletBinding()]
param(
  [switch]$DryRun,
  [int]$ApiPort = 0,
  [string]$ProcessFilePath,
  [string]$LogDirectoryPath
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SetupPath = if (-not [string]::IsNullOrWhiteSpace($env:GJ_DESKTOP_SETUP_PATH)) { $env:GJ_DESKTOP_SETUP_PATH.Trim() } else { Join-Path $env:LOCALAPPDATA 'GrupoJadson\setup.json' }
$ProcessFile = if ([string]::IsNullOrWhiteSpace($ProcessFilePath)) { Join-Path $ProjectRoot '.runtime\processes.json' } else { $ProcessFilePath }
$LogDirectory = if ([string]::IsNullOrWhiteSpace($LogDirectoryPath)) { Join-Path $ProjectRoot '.runtime\logs' } else { $LogDirectoryPath }
$BackendDirectory = Join-Path $ProjectRoot 'apps\backend'
if ($ApiPort -le 0) { $ApiPort = if ($env:API_PORT -match '^\d+$') { [int]$env:API_PORT } else { 3333 } }
if ($ApiPort -lt 1 -or $ApiPort -gt 65535) { throw 'A porta do backend é inválida.' }

if (-not (Test-Path -LiteralPath $SetupPath -PathType Leaf)) { throw 'A configuração local do backend não foi encontrada.' }
try { $Setup = Get-Content -LiteralPath $SetupPath -Raw -Encoding utf8 | ConvertFrom-Json } catch { throw 'A configuração local do backend é inválida.' }
$ApiToken = [string]$Setup.apiToken
$DatabaseUrl = [string]$Setup.databaseUrl
if ($ApiToken -notmatch '^[0-9a-fA-F]{64}$') { throw 'A configuração local do backend é inválida.' }
try { $ParsedDatabaseUrl = [Uri]$DatabaseUrl } catch { throw 'A configuração local do backend é inválida.' }
if ($ParsedDatabaseUrl.Scheme -notin @('postgres', 'postgresql')) { throw 'A configuração local do backend é inválida.' }

$BackendProcessIds = [System.Collections.Generic.HashSet[int]]::new()
if (Test-Path -LiteralPath $ProcessFile -PathType Leaf) {
  try {
    $Registered = Get-Content -LiteralPath $ProcessFile -Raw -Encoding utf8 | ConvertFrom-Json
    $Entry = @($Registered | Where-Object { $_.Name -eq 'backend' } | Select-Object -First 1)
    if ($Entry.Count -and $Entry[0].Pid -and (Get-Process -Id ([int]$Entry[0].Pid) -ErrorAction SilentlyContinue)) { [void]$BackendProcessIds.Add([int]$Entry[0].Pid) }
  } catch { }
}
try {
  $Connection = Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($Connection) { [void]$BackendProcessIds.Add([int]$Connection.OwningProcess) }
} catch { }

if ($DryRun) {
  Write-Output "DryRun: encerraria o processo do backend registrado ou na porta $ApiPort e iniciaria node dist/main.js com a configuração local; os logs iriam para .runtime\logs."
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $BackendDirectory 'dist\main.js') -PathType Leaf)) { throw 'A compilação do backend não foi encontrada.' }
New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
foreach ($ProcessId in $BackendProcessIds) { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue }
$Node = (Get-Command node -ErrorAction Stop).Source
$StdoutLog = Join-Path $LogDirectory 'backend.out.log'
$StderrLog = Join-Path $LogDirectory 'backend.err.log'
$PreviousToken = $env:API_TOKEN
$PreviousDatabaseUrl = $env:DATABASE_URL
$PreviousApiPort = $env:API_PORT
try {
  $env:API_TOKEN = $ApiToken
  $env:DATABASE_URL = $DatabaseUrl
  $env:API_PORT = [string]$ApiPort
  $Started = Start-Process -FilePath $Node -ArgumentList 'dist/main.js' -WorkingDirectory $BackendDirectory -PassThru -WindowStyle Hidden -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
} finally {
  $env:API_TOKEN = $PreviousToken
  $env:DATABASE_URL = $PreviousDatabaseUrl
  $env:API_PORT = $PreviousApiPort
}

if (Test-Path -LiteralPath $ProcessFile -PathType Leaf) {
  try { $AllProcesses = @(Get-Content -LiteralPath $ProcessFile -Raw -Encoding utf8 | ConvertFrom-Json) } catch { $AllProcesses = @() }
} else { $AllProcesses = @() }
$AllProcesses = @($AllProcesses | Where-Object { $_.Name -ne 'backend' })
$AllProcesses += [pscustomobject]@{ Name = 'backend'; Pid = $Started.Id; Stdout = $StdoutLog; Stderr = $StderrLog }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ProcessFile) | Out-Null
$AllProcesses | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ProcessFile -Encoding utf8
Write-Output 'Backend reiniciado. Os detalhes de execução estão em .runtime\logs.'
