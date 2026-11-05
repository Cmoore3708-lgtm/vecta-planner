@echo off
title VECTA - REPAIR CATALOGUE INSPECTION
cd /d "%~dp0..\gsf"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22 or later is required.
 pause
 exit /b 1
)
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 exit /b 1
)
node ..\repair-quotes\discover-catalogues.mjs
pause
