@echo off
title VECTA GSF Recovery Update
echo Downloading GSF-only installer from GitHub...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $url='https://raw.githubusercontent.com/Cmoore3708-lgtm/vecta-planner/9ee99778b4ef7a9c26c70974b521cf4fd496dde9/tools/install-gsf-login-recovery.ps1'; $target=Join-Path $env:TEMP 'vecta-gsf-recovery-install-1.ps1'; Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30; & $target; if (!$?) { exit 1 }"
if errorlevel 1 (
 echo.
 echo UPDATE FAILED. Do not restart. Send a photo of this window.
) else (
 echo.
 echo If SUCCESS appears above, restart GSF ONLY in VECTA Workshop Connections.
)
echo.
pause
