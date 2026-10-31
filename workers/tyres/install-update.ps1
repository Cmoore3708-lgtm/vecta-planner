$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'workers\tyres'
$targetRoot = Join-Path $env:LOCALAPPDATA 'VectaTyres\Worker'
$target = Join-Path $targetRoot 'workers\tyres'
if (!(Test-Path (Join-Path $source 'live-worker.mjs'))) { throw 'Extract All before running INSTALL-UPDATE.cmd.' }
if (!(Test-Path (Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'))) { throw 'Install on the existing paired workshop PC.' }
# Stop the tyre supervisor first so it cannot relaunch during the update.
Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -match '(?i)[\\/]tyres[\\/]start-live\.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
# Stop only explicitly identified tyre-worker processes. Leave GSF and Haynes alone.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match '(?i)(?:^|[\\/\s\"''])live-worker\.mjs(?:[\s\"'']|$)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
if (Test-Path $targetRoot) {
 $backup = $targetRoot + '-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
 Copy-Item $targetRoot $backup -Recurse
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item (Join-Path $source '*') $target -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $targetRoot 'lib') | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'lib\tyre-relay-contract.js') (Join-Path $targetRoot 'lib') -Force
Copy-Item (Join-Path $PSScriptRoot 'package.json') $targetRoot -Force
$launcher = Join-Path $targetRoot 'START-TYRES.cmd'
$cmd = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$target\start-live.ps1`"`r`npause`r`n"
[IO.File]::WriteAllText($launcher, $cmd, [Text.Encoding]::ASCII)
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'VECTA Tyre Worker.lnk'))
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $targetRoot
$shortcut.Save()
Write-Host 'Installed. Use VECTA Tyre Worker on the desktop. Your existing browser profile and pairing are retained.'
Write-Host 'Optional: run SAVE-SUPPLIER-LOGIN.cmd once to enable encrypted automatic sign-in.'
Start-Process $launcher
