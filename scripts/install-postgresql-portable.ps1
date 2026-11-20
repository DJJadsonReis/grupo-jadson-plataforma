param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Fa-f0-9]{64}$')]
  [string]$ExpectedSha256
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$downloadsRoot = (Resolve-Path (Join-Path $ProjectRoot '.cache\downloads')).Path
$downloads = $downloadsRoot.TrimEnd('\') + '\'
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
if (-not $archive.StartsWith($downloads, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'O ZIP deve estar em .cache\downloads para manter a aquisição dentro do projeto.'
}
if ([IO.Path]::GetExtension($archive) -ine '.zip') { throw 'A distribuição PostgreSQL deve ser ZIP.' }

$target = Join-Path $ProjectRoot 'tools\postgresql'
if (Test-Path -LiteralPath $target) {
  if (Get-ChildItem -LiteralPath $target -Force | Select-Object -First 1) {
    throw "Destino não vazio; nenhum arquivo foi substituído: $target"
  }
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
if ($actualHash -ine $ExpectedSha256) { throw "SHA-256 divergente. Esperado $ExpectedSha256, obtido $actualHash." }

$staging = Join-Path $downloadsRoot ('postgresql-extract-' + [guid]::NewGuid().ToString('N'))
$installStage = Join-Path (Join-Path $ProjectRoot 'tools') ('.postgresql-install-' + [guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  Expand-Archive -LiteralPath $archive -DestinationPath $staging
  $pgCtl = Get-ChildItem -LiteralPath $staging -Filter 'pg_ctl.exe' -File -Recurse | Select-Object -First 1
  if (-not $pgCtl) { throw 'ZIP validado não contém pg_ctl.exe.' }
  $binaryRoot = $pgCtl.Directory.Parent.FullName
  $postgres = Join-Path $pgCtl.Directory.FullName 'postgres.exe'
  if (-not (Test-Path $postgres)) { throw 'ZIP não contém postgres.exe junto ao pg_ctl.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $postgres
  if ($signature.Status -ne 'Valid') { throw "Assinatura Authenticode do postgres.exe não validou ($($signature.Status))." }
  $version = (& $pgCtl.FullName --version 2>&1 | Out-String).Trim()
  if ($version -notmatch '\b16\.') { throw "Distribuição precisa ser PostgreSQL 16 para acompanhar o pin do projeto. Versão: $version" }

  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $installStage) | Out-Null
  New-Item -ItemType Directory -Path $installStage | Out-Null
  Copy-Item -Path (Join-Path $binaryRoot '*') -Destination $installStage -Recurse
  Set-Content -LiteralPath (Join-Path $installStage 'PORTABLE_VERSION.txt') -Value $version -Encoding utf8
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target }
  Move-Item -LiteralPath $installStage -Destination $target
  Write-Output "PostgreSQL portátil instalado em $target"
  Write-Output $version
}
finally {
  if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
  if (Test-Path -LiteralPath $installStage) { Remove-Item -LiteralPath $installStage -Recurse -Force }
}
