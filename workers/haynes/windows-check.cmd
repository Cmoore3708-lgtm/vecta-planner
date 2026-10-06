@echo off
setlocal
cd /d "%~dp0"
echo Stop windows-connect with Ctrl+C before running this check.
if not exist node_modules\playwright\package.json (
  call npm install --ignore-scripts
  if errorlevel 1 (
    echo Installation failed. Please report the error.
    pause
    exit /b 1
  )
)
node check.mjs
pause
