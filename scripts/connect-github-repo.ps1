param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Za-z0-9-]+$')]
    [string]$RepositoryOwner
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$gitExe = Join-Path $projectRoot 'tools\git\cmd\git.exe'
$targetRemote = "https://github.com/$RepositoryOwner/grupo-jadson-platform.git"

if (-not (Test-Path -LiteralPath $gitExe -PathType Leaf)) {
    throw "Git portátil não encontrado em '$gitExe'. Disponibilize uma distribuição oficial e verificada em tools/git antes de conectar."
}

$gitDir = Join-Path $projectRoot '.git'
if (-not (Test-Path -LiteralPath $gitDir)) {
    & $gitExe -C $projectRoot init --initial-branch=main
    if ($LASTEXITCODE -ne 0) { throw 'git init falhou.' }
}

$currentBranch = (& $gitExe -C $projectRoot branch --show-current).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível consultar a branch atual.' }
if (-not $currentBranch) {
    throw 'HEAD está sem uma branch local (por exemplo, checkout detached). Nenhuma alteração foi feita.'
}
if ($currentBranch -and $currentBranch -ne 'main') {
    throw "Branch atual '$currentBranch' não é main. Nenhuma branch foi alterada; revise manualmente antes de continuar."
}

$existingRemote = (& $gitExe -C $projectRoot remote get-url origin 2>$null)
if ($LASTEXITCODE -eq 0 -and $existingRemote) {
    if ($existingRemote.TrimEnd('/') -ne $targetRemote.TrimEnd('/')) {
        throw "Já existe origin apontando para '$($existingRemote.Trim())'. Nenhuma alteração foi feita."
    }
    Write-Host "origin já aponta para $targetRemote"
} else {
    & $gitExe -C $projectRoot remote add origin $targetRemote
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível configurar origin.' }
    Write-Host "origin configurado para $targetRemote"
}

Write-Host 'Remote local preparado. Nenhum commit ou push foi executado.'
