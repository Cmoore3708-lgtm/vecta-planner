@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22 or later first.
 pause
 exit /b 1
)
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
node pc-check.mjs --haynes-only
pause
