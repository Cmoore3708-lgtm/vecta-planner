@echo off
title VECTA - WEBSITE SERVICE TEST AND REPAIR WORKER
cd /d "%~dp0"
echo Stop only the existing GSF worker before starting this window.
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
node start-website-test.mjs
pause
