@echo off
title VECTA - REAL SERVICE PRICE TEST
cd /d "%~dp0"
echo Stop only the shared GSF worker before this test.
echo Leave tyre and Haynes workers running. Nothing is ordered or published.
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or later is required.
 pause
 exit /b 1
)
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  echo Dependencies could not install. Keep this window open.
  pause
  exit /b 1
 )
)
node check-live-services.mjs
if exist "live-service-test-result.local.json" start "" explorer.exe /select,"%~dp0live-service-test-result.local.json"
echo Upload the highlighted result file for verification.
pause
