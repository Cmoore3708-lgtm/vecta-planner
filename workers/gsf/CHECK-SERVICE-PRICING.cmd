@echo off
title VECTA - READ ONLY SERVICE PRICING CHECK
cd /d "%~dp0"
echo This uses the existing shared GSF profile. Stop only the GSF worker first.
echo Leave tyre and Haynes workers alone. No orders or website prices are created.
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or later is required.
 pause
 exit /b 1
)
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  echo Dependencies could not install. Keep this window open to show the error.
  pause
  exit /b 1
 )
)
node worker.mjs --service-check NU67VSE FV65JTY
if errorlevel 1 (
 echo Check did not complete. Keep this window open to show the error.
) else (
 if exist "service-check-result.local.json" start "" explorer.exe /select,"%~dp0service-check-result.local.json"
 echo The result file is highlighted. Upload this one file for review.
)
pause
