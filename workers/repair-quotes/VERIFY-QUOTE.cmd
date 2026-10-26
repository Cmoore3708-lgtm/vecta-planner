@echo off
title VECTA - VERIFY PART AND LABOUR
cd /d "%~dp0"
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
node finish-setup.mjs --verify-quote
if exist "repair-setup-result.local.json" start "" explorer.exe /select,"%~dp0repair-setup-result.local.json"
echo.
echo The result file is highlighted in File Explorer. Upload it to ChatGPT.
pause
