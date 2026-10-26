@echo off
title VECTA - SHARED GSF PRICING WORKER
cd /d "%~dp0..\gsf"
if not exist "node_modules\playwright\package.json" (
 call npm ci --ignore-scripts
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
node worker.mjs
pause
