@echo off
title VECTA Tyre Auto-Login Update V4
echo Downloading the Vecta tyre-only installer from GitHub...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $url='https://raw.githubusercontent.com/Cmoore3708-lgtm/vecta-planner/d1c995dadd403a3e6b499bd3b7dd9e8f43d54c81/tools/install-esp-auto-login.ps1'; $target=Join-Path $env:TEMP 'vecta-esp-auto-login-installer-v4.ps1'; Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing -TimeoutSec 30; & $target; if (!$?) { exit 1 }"
if errorlevel 1 (
 echo.
 echo UPDATE FAILED. No restart needed. Please send a photo of this window.
) else (
 echo.
 echo If SUCCESS appears above, restart ONLY Tyres in VECTA Workshop Connections.
)
echo.
pause
