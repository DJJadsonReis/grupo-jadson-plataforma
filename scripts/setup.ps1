param(
  [switch]$AllowDownloads,
  [string]$NodeVersion = '22.21.0'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Directories = @(
  'tools\node','tools\pnpm','tools\rust','tools\cargo','tools\postgresql','tools\redis','binaries',
  '.cache\npm','.cache\pnpm','.cache\cargo','.cache\downloads',
  '.runtime\database','.runtime\redis','.runtime\logs'
)
foreach ($relative in $Directories) {
  New-Item -ItemType Directory -Force -Path (Join-Path $ProjectRoot $relative) | Out-Null
}

$env:PROJECT_ROOT = $ProjectRoot
$env:RUSTUP_HOME = Join-Path $ProjectRoot 'tools\rust'
$env:CARGO_HOME = Join-Path $ProjectRoot 'tools\cargo'
$env:CARGO_TARGET_DIR = Join-Path $ProjectRoot '.cache\cargo\target'
$env:npm_config_cache = Join-Path $ProjectRoot '.cache\npm'
$env:COREPACK_HOME = Join-Path $ProjectRoot '.cache\pnpm\corepack'
$env:PNPM_HOME = Join-Path $ProjectRoot 'tools\pnpm'
$env:PNPM_STORE_DIR = Join-Path $ProjectRoot '.cache\pnpm\store'
$env:Path = (Join-Path $ProjectRoot 'tools\node') + ';' + (Join-Path $ProjectRoot 'tools\cargo\bin') + ';' + $env:Path

$nodeExe = Join-Path $ProjectRoot 'tools\node\node.exe'
$nodeVersionFile = Join-Path $ProjectRoot 'tools\node\VERSION'
$installedNodeVersion = if (Test-Path $nodeVersionFile) { (Get-Content $nodeVersionFile -Raw).Trim() } else { $null }
if (-not (Test-Path $nodeExe) -and $NodeVersion -match '^22\.\d+\.\d+$') {
  $archiveName = "node-v$NodeVersion-win-x64.zip"
  $archive = Join-Path $ProjectRoot ".cache\downloads\$archiveName"
  $uri = "https://nodejs.org/dist/v$NodeVersion/$archiveName"
  $checksumFile = Join-Path $ProjectRoot ".cache\downloads\node-v$NodeVersion-SHASUMS256.txt"
  if (-not (Test-Path $checksumFile) -and $AllowDownloads) {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt" -OutFile $checksumFile
  }
  if (-not (Test-Path $archive) -and $AllowDownloads) { Invoke-WebRequest -Uri $uri -OutFile $archive }
  if ((Test-Path $archive) -and (Test-Path $checksumFile)) {
    $checksumLine = Get-Content $checksumFile | Where-Object { $_ -match ('\s' + [regex]::Escape($archiveName) + '$') } | Select-Object -First 1
    if (-not $checksumLine) { throw "Hash oficial ausente para $archiveName." }
    $expectedHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw "SHA-256 divergente para $archiveName; arquivo não será extraído." }
    $extract = Join-Path $ProjectRoot '.cache\downloads\node-extract'
    Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
    $extracted = Join-Path $extract "node-v$NodeVersion-win-x64"
    $nodeSignature = Get-AuthenticodeSignature (Join-Path $extracted 'node.exe')
    if ($nodeSignature.Status -ne 'Valid') { throw "Assinatura Authenticode do node.exe não validou ($($nodeSignature.Status)); não será instalado." }
    Copy-Item (Join-Path $extracted '*') (Join-Path $ProjectRoot 'tools\node') -Recurse -Force
    Set-Content -LiteralPath $nodeVersionFile -Value $NodeVersion -Encoding ascii
  } elseif (Test-Path $archive) {
    Write-Warning "Pacote Node local sem SHASUMS256.txt oficial; não será extraído: $archive"
  }
} elseif (-not (Test-Path $nodeExe) -and $NodeVersion -notmatch '^22\.\d+\.\d+$') {
  throw 'NodeVersion deve ser uma versão explícita da linha 22 (22.x.y).'
}

$rustupExe = Join-Path $ProjectRoot 'tools\cargo\bin\rustup.exe'
$rustupInstaller = Join-Path $ProjectRoot '.cache\downloads\rustup-init.exe'
if (-not (Test-Path $rustupExe) -and $AllowDownloads) {
  if (-not (Test-Path $rustupInstaller)) { Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $rustupInstaller }
  $rustupSignature = Get-AuthenticodeSignature $rustupInstaller
  if ($rustupSignature.Status -ne 'Valid') { throw "Assinatura Authenticode do rustup-init não validou ($($rustupSignature.Status)); não será executado." }
  $env:RUSTUP_HOME = Join-Path $ProjectRoot 'tools\rust'
  $env:CARGO_HOME = Join-Path $ProjectRoot 'tools\cargo'
  & $rustupInstaller -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-msvc --default-toolchain stable
  if ($LASTEXITCODE -ne 0) { throw "Rustup falhou (exit $LASTEXITCODE). Verifique C++ Build Tools e Windows SDK." }
}

if (Test-Path $nodeExe) {
  $localNodeVersion = (& $nodeExe --version).TrimStart('v')
  if ($localNodeVersion -notmatch '^22\.' -or ($installedNodeVersion -and $installedNodeVersion -ne $localNodeVersion)) {
    throw "Node local tem versão $localNodeVersion (marcador: $installedNodeVersion); esperada linha 22 compatível."
  }
  $npmCmd = Join-Path $ProjectRoot 'tools\node\npm.cmd'
  $pnpmPackage = Join-Path $ProjectRoot 'tools\pnpm\node_modules\pnpm\bin\pnpm.cjs'
  if (-not (Test-Path $pnpmPackage) -and $AllowDownloads) {
    if (-not (Test-Path $npmCmd)) { throw 'Node local não contém npm.cmd; não é possível preparar pnpm local.' }
    & $npmCmd install --prefix (Join-Path $ProjectRoot 'tools\pnpm') --cache (Join-Path $ProjectRoot '.cache\npm') --no-audit --no-fund 'pnpm@9.15.0'
    if ($LASTEXITCODE -ne 0) { throw "Instalação local do pnpm falhou (exit $LASTEXITCODE)." }
  }
  if (Test-Path $pnpmPackage) {
    $version = & $nodeExe $pnpmPackage --version
    if ($version -ne '9.15.0') { throw "pnpm local retornou $version; esperado 9.15.0." }
    Push-Location $ProjectRoot
    & $nodeExe $pnpmPackage config set store-dir (Join-Path $ProjectRoot '.cache\pnpm\store') --location project
    & $nodeExe $pnpmPackage install --offline
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Instalação offline incompleta; sem repetir downloads. Dependências ausentes precisam de cache ou autorização de rede.' }
  } else { Write-Warning 'pnpm 9.15.0 indisponível localmente. Não houve download; use -AllowDownloads para tentar npm registry.' }
} else { Write-Warning "Node.js 22 portátil indisponível. Com rede acessível, use: .\scripts\setup.ps1 -AllowDownloads -NodeVersion $NodeVersion" }

$redisConfig = Join-Path $ProjectRoot 'tools\redis\redis.conf'
if (-not (Test-Path $redisConfig)) {
  @(
    'bind 127.0.0.1',
    'port 6379',
    "dir $($ProjectRoot -replace '\\','/')/.runtime/redis",
    'dbfilename dump.rdb',
    'appendonly yes',
    "appendfilename appendonly.aof",
    'loglevel notice',
    "logfile $($ProjectRoot -replace '\\','/')/.runtime/logs/redis.log"
  ) | Set-Content -LiteralPath $redisConfig -Encoding utf8
}

Write-Output 'Estrutura portátil criada. Não foram instalados componentes Windows nem feitos downloads sem -AllowDownloads.'
& (Join-Path $PSScriptRoot 'check-environment.ps1')
