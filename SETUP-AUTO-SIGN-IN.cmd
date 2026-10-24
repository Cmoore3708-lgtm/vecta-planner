@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workers\tyres\setup-auto-sign-in.ps1"
pause
