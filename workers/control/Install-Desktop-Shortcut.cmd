@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0workshop-workers.ps1" -Install
pause
