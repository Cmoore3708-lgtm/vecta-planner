@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or newer is required. Install it from https://nodejs.org
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
 echo Please update Node.js to version 22 or newer.
 pause
 exit /b 1
)
node readiness.mjs
if errorlevel 1 (
 pause
 exit /b 1
)
call npm ci --ignore-scripts
if errorlevel 1 (
 echo Dependency installation failed. Keep this window open to show the error.
 pause
 exit /b 1
)
node self-check.mjs
if errorlevel 1 (
 echo The offline package check failed. Keep this window open to show the error.
 pause
 exit /b 1
)
node probe.mjs
pause
