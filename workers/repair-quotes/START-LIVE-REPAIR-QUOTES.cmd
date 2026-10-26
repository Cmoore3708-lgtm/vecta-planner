@echo off
title VECTA - LIVE REPAIR QUOTE WORKER
cd /d "%~dp0..\gsf"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or later is required.
 pause
 exit /b 1
)
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  echo Dependencies could not install.
  pause
  exit /b 1
 )
)
node ..\repair-quotes\start-paired.mjs
pause
