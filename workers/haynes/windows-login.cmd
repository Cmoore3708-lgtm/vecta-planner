@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js version 22 or later, then run this file again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 (
  echo Node.js version 22 or later is required.
  pause
  exit /b 1
)
if not exist node_modules\playwright\package.json (
  call npm ci --ignore-scripts
  if errorlevel 1 (
    echo Trying direct installation of the pinned worker packages.
    call npm install --ignore-scripts
    if errorlevel 1 (
      echo Dependency installation failed. Please report the error shown above.
      pause
      exit /b 1
    )
  )
)
echo This opens a separate Edge window for the Haynes worker.
echo Sign in directly in that window, then follow the terminal prompt.
call npm run login
if errorlevel 1 (
  echo Haynes login was not saved successfully.
) else (
  echo Haynes login saved. This step does not yet connect the PC to Test.
)
pause
