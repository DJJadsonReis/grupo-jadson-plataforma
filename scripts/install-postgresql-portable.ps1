param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Fa-f0-9]{64}$')]
  [string]$ExpectedSha256
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$downloads = (Resolve-Path (Join-Path $ProjectRoot '.cache\downloads')).Path.TrimEnd('\') + '\'
$archive = (Resolve-Path -LiteralPath $ArchivePath).Path
if (-not $archive.StartsWith($downloads, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "O ZIP deve estar em .cache\downloads para manter a aquisição dentro do projeto."
}
if ([IO.Path]::GetExtension($archive) -ne '.zip') { throw 'A distribuição PostgreSQL deve ser ZIP.' }

$target = Join-Path $ProjectRoot 'tools\postgresql'
if (Get-ChildItem -LiteralPath $target -Force -ErrorAction SilentlyContinue | Select-Object -First 1) {
  throw "Destino não vazio; nenhum arquivo foi substituído: $target"
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash
if ($actualHash -ine $ExpectedSha256) { throw "SHA-256 divergente. Esperado $ExpectedSha256, obtido $actualHash." }

$staging = Join-Path $ProjectRoot ('.cache\downloads\postgresql-extract-' + [guid]::NewGuid().ToString('N'))
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

Copy-Item -Path (Join-Path $binaryRoot '*') -Destination $target -Recurse -Force
Set-Content -LiteralPath (Join-Path $target 'PORTABLE_VERSION.txt') -Value $version -Encoding utf8
Write-Output "PostgreSQL portátil instalado em $target"
Write-Output $version
