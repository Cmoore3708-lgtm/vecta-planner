@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" goto missingfiles
if not exist "package-lock.json" goto missingfiles
if not exist "inspect.mjs" goto missingfiles
where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "if(Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 goto oldnode
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const l=JSON.parse(fs.readFileSync('package-lock.json','utf8'));if(p.name!=='vecta-tyre-guide-worker'||l.lockfileVersion<1)process.exit(1)"
if errorlevel 1 goto badfiles
call npm ci --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto installfailed
node inspect.mjs
if errorlevel 1 goto lookupfailed
exit /b 0
:missingfiles
echo.
echo The setup files are not together in this folder.
echo Close this window. Right-click the downloaded ZIP and choose Extract All.
echo Then open the extracted folder and run START-TYRE-SETUP.cmd from there.
echo Do not run the launcher from inside the ZIP.
pause
exit /b 1
:badfiles
echo The setup package files could not be read. Download and Extract All again.
pause
exit /b 1
:nonode
echo Node.js is required. Use the workshop PC where the Haynes worker runs.
pause
exit /b 1
:oldnode
echo This setup requires Node.js 22 or newer.
node --version
pause
exit /b 1
:installfailed
echo Dependency setup failed. No supplier lookup has been run.
echo Send the error text in our tyre chat.
pause
exit /b 1
:lookupfailed
echo Setup could not finish. Send the error text in our tyre chat.
pause
exit /b 1
