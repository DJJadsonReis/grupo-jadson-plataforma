$root='T:\grupo-jadson-ai'; $o="$root\docs\_orq"
while(-not (Select-String -Path "$o\loop.log" -Pattern 'ok codex-74|falhou codex-74|TRAVOU' -Quiet)){ Start-Sleep 20 }
"inicio $(Get-Date -Format HH:mm:ss)" | Out-File "$o\rebuild-teste.log"
Set-Location "$root\apps\backend"; $env:PATH="$o\shim;$env:PATH"
corepack pnpm build *>> "$o\rebuild-teste.log"
& "$root\scripts\restart-backend.ps1"
if (-not $?) { throw 'Falha ao reiniciar o backend pela configuração local.' }
Get-Process grupo-jadson -ErrorAction SilentlyContinue | Stop-Process -Force
& powershell -NoProfile -ExecutionPolicy Bypass -File "$o\build-exe.ps1"
"build exit $LASTEXITCODE $(Get-Date -Format HH:mm:ss)" | Out-File "$o\rebuild-teste.log" -Append
Start-Process "$root\apps\desktop\src-tauri\target\release\grupo-jadson.exe"
'FIM' | Out-File "$o\rebuild-teste.done"
