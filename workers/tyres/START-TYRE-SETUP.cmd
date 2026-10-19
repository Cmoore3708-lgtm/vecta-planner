@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required. Use the workshop PC where the Haynes worker runs.
 pause
 exit /b 1
)
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 (
 echo Dependency setup failed. No lookup has been run.
 pause
 exit /b 1
)
node inspect.mjs
if errorlevel 1 (
 echo Setup could not finish. Send the error text in our tyre chat.
 pause
 exit /b 1
)
