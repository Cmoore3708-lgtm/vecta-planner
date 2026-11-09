# Vecta tyre worker safe updater - never modifies GSF or Haynes.
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'VectaWorkers'
$state=Join-Path $root 'state.json'
if (!(Test-Path $state)) { throw 'VectaWorkers state.json not found. No changes made.' }
$releaseRoot=Join-Path $root 'releases'
$installed=Get-ChildItem $releaseRoot -Directory | Where-Object { $_.Name -like '20d5c2f8*' } | Select-Object -First 1
if (!$installed) { throw 'Expected Vecta Workers release not found. No changes made.' }
$tyres=Join-Path $installed.FullName 'tyres'
if (!(Test-Path (Join-Path $tyres 'startup.mjs'))) { throw 'Existing tyre startup not found. No changes made.' }
$download='https://raw.githubusercontent.com/Cmoore3708-lgtm/vecta-planner/main/workers/tyres/session-recovery.mjs'
$dest=Join-Path $env:TEMP 'vecta-tyre-recovery-new.mjs'
Invoke-WebRequest -Uri $download -OutFile $dest -UseBasicParsing
if (!(Select-String -Path $dest -Pattern 'createSessionRecovery' -Quiet)) { throw 'Downloaded file failed validation. No changes made.' }
Write-Host ''
Write-Host 'Downloaded and validated the updated ESP session recovery code.'
Write-Host 'Your installed tyre worker has a different startup layout.'
Write-Host 'No worker files were changed. A full compatible VectaWorkers release is required.'
Write-Host 'GSF and Haynes were not touched.'
Read-Host 'Press Enter to close'
