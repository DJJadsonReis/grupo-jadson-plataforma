param()

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LocalNode = Join-Path $ProjectRoot 'tools\node\node.exe'
$LocalNpm = Join-Path $ProjectRoot 'tools\node\npm.cmd'
$LocalPnpm = Join-Path $ProjectRoot 'tools\pnpm\node_modules\pnpm\bin\pnpm.cjs'
$LocalRustc = Join-Path $ProjectRoot 'tools\cargo\bin\rustc.exe'
$LocalCargo = Join-Path $ProjectRoot 'tools\cargo\bin\cargo.exe'
$LocalRustup = Join-Path $ProjectRoot 'tools\cargo\bin\rustup.exe'
$LocalPgCtl = Join-Path $ProjectRoot 'tools\postgresql\bin\pg_ctl.exe'
$LocalRedis = Join-Path $ProjectRoot 'tools\redis\redis-server.exe'
$LocalRedisCli = Join-Path $ProjectRoot 'tools\redis\redis-cli.exe'

$checks = [System.Collections.Generic.List[object]]::new()
function Add-Check([string]$Name, [string]$Status, [string]$Detail) {
  $checks.Add([pscustomobject]@{ Item = $Name; Status = $Status; Detail = $Detail })
}
function Get-Version([string]$Executable, [string[]]$Arguments) {
  if (-not (Test-Path -LiteralPath $Executable)) { return $null }
  try { return ((& $Executable @Arguments 2>&1 | Select-Object -First 1).ToString()) } catch { return "erro: $($_.Exception.Message)" }
}

if (Test-Path $LocalNode) {
  $version = Get-Version $LocalNode @('--version')
  Add-Check 'Node.js local' $(if ($version -match '^v22\.') { 'OK' } else { 'VERSÃO' }) "$version — $LocalNode"
} else { Add-Check 'Node.js local' 'PENDENTE' "Esperado em $LocalNode" }
if ((Test-Path $LocalPnpm) -and (Test-Path $LocalNode)) {
  $version = Get-Version $LocalNode @($LocalPnpm, '--version')
  Add-Check 'pnpm local' $(if ($version -eq '9.15.0') { 'OK' } else { 'VERSÃO' }) "$version — pin esperado 9.15.0"
} else { Add-Check 'pnpm local' 'PENDENTE' "Esperado pacote em $LocalPnpm" }
if (Test-Path $LocalRustup) {
  $toolchain = Get-Version $LocalRustup @('show','active-toolchain')
  Add-Check 'Rust/Cargo local' 'PRESENTE' "$toolchain; rustc=$(Test-Path $LocalRustc); cargo=$(Test-Path $LocalCargo)"
} else { Add-Check 'Rust/Cargo local' 'PENDENTE' "Toolchain isolado esperado em tools/rust e tools/cargo" }
if (Test-Path $LocalPgCtl) {
  Add-Check 'PostgreSQL local' 'PRESENTE' (Get-Version $LocalPgCtl @('--version'))
} else { Add-Check 'PostgreSQL local' 'PENDENTE' "Binários esperados em tools/postgresql/bin" }
if (Test-Path $LocalRedis) {
  Add-Check 'Redis local' 'PRESENTE' (Get-Version $LocalRedis @('--version'))
} else { Add-Check 'Redis local' 'PENDENTE' "Binários esperados em tools/redis" }

$vswhereCandidates = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe",
  "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe"
)
$vswhere = $vswhereCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($vswhere) {
  $vsPath = (& $vswhere -latest -products '*' -property installationPath 2>$null | Select-Object -First 1)
  $msbuild = if ($vsPath) { Join-Path $vsPath 'MSBuild\Current\Bin\MSBuild.exe' }
  $cl = if ($vsPath) { Get-ChildItem (Join-Path $vsPath 'VC\Tools\MSVC') -Filter cl.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }
  Add-Check 'Visual Studio C++ Build Tools' $(if ($msbuild -and (Test-Path $msbuild) -and $cl) { 'PRESENTE' } else { 'INCOMPLETO' }) "MSBuild=$(if($msbuild){Test-Path $msbuild}else{$false}); cl.exe=$(if($cl){$cl}else{'não localizado'})"
} else { Add-Check 'Visual Studio C++ Build Tools' 'NÃO LOCALIZADO' 'vswhere.exe não encontrado nos locais padrão' }
$sdkRoots = @(
  "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
  "$env:ProgramFiles\Windows Kits\10\bin"
) | Where-Object { Test-Path -LiteralPath $_ }
if ($sdkRoots) {
  $sdkVersions = foreach ($root in $sdkRoots) { Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name }
  Add-Check 'Windows SDK' 'PRESENTE' (($sdkVersions | Sort-Object -Unique) -join ', ')
} else { Add-Check 'Windows SDK' 'NÃO LOCALIZADO' 'Windows Kits 10 bin não encontrado nos locais padrão' }
$webview = @(
  "${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application",
  "$env:ProgramFiles\Microsoft\EdgeWebView\Application"
) | Where-Object { Test-Path -LiteralPath $_ }
if ($webview) {
  $webviewVersion = Get-ChildItem $webview -Directory | Where-Object { $_.Name -match '^\d+\.' } | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty Name
  Add-Check 'WebView2 Runtime' 'PRESENTE' "versão $webviewVersion"
} else { Add-Check 'WebView2 Runtime' 'NÃO LOCALIZADO' 'EdgeWebView Runtime não encontrado nos locais padrão' }

foreach ($dir in @('.cache\npm','.cache\pnpm','.cache\cargo','.cache\downloads','.runtime\database','.runtime\redis','.runtime\logs')) {
  $path = Join-Path $ProjectRoot $dir
  Add-Check "Diretório $dir" $(if (Test-Path $path) { 'OK' } else { 'AUSENTE' }) $path
}

$nodeStatus = 'PENDENTE'
$nodeDetail = "Esperado em $LocalNode"
if (Test-Path -LiteralPath $LocalNode) {
  $nodeVersion = Get-Version $LocalNode @('--version')
  $nodeStatus = if ($nodeVersion -match '^v22\.') { 'OK' } else { 'VERSÃO' }
  $nodeDetail = "$nodeVersion - $LocalNode"
}
$checks.Insert(0, [pscustomobject]@{ Item = 'Node.js local'; Status = $nodeStatus; Detail = $nodeDetail })
$checks | Format-Table -AutoSize -Wrap
Write-Output "Projeto: $ProjectRoot"
