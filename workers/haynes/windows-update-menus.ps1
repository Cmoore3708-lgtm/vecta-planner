$ErrorActionPreference = 'Stop'
$changes = @()
$installed = $false
try {
  Write-Host 'VECTA Haynes worker repair'
  Write-Host 'Close all Haynes black worker windows before continuing.'
  [void](Read-Host 'Press Enter once those windows are closed')
  $payload = Join-Path $PSScriptRoot 'payload'
  if (!(Test-Path (Join-Path $payload 'lib\haynes-service.js'))) { throw 'Extract All from the complete repair ZIP first, then run REPAIR-HAYNES.cmd.' }
  $targetDir = Join-Path $env:LOCALAPPDATA 'VectaHaynes\app\workers\haynes'
  if (!(Test-Path (Join-Path $targetDir 'relay.mjs'))) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Select the existing Haynes worker folder containing relay.mjs and windows-connect.cmd'
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No folder selected. Nothing changed.' }
    $targetDir = $picker.SelectedPath
  }
  if (!(Test-Path (Join-Path $targetDir 'relay.mjs')) -or !(Test-Path (Join-Path $targetDir 'windows-connect.cmd'))) { throw 'This is not the existing Haynes worker folder. Nothing changed.' }
  $installRoot = Split-Path (Split-Path $targetDir -Parent) -Parent
  $backupRoot = Join-Path $env:LOCALAPPDATA ('VectaHaynes\RepairBackups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
  $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
  foreach ($entry in $manifest) {
    if ($entry.path -notmatch '^(workers/haynes/[^/]+\.(mjs|cmd|ps1|json)|lib/haynes-(vehicle|service)\.js)$') { throw 'Invalid repair file list. Nothing changed.' }
    $source = Join-Path $payload $entry.path
    if (!(Test-Path -LiteralPath $source) -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'The repair ZIP is incomplete or damaged. Download and Extract All again.' }
  }
  foreach ($entry in $manifest) {
    $source = Join-Path $payload $entry.path
    $target = Join-Path $installRoot $entry.path
    $backup = Join-Path $backupRoot $entry.path
    $existed = Test-Path -LiteralPath $target
    New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent), (Split-Path $backup -Parent) | Out-Null
    if ($existed) { Copy-Item -LiteralPath $target -Destination $backup }
    $changes += [pscustomobject]@{ Target = $target; Backup = $backup; Existed = $existed }
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256) { throw 'Installed file verification failed.' }
  }
  $rootPackage = Join-Path $installRoot 'package.json'
  if (!(Test-Path -LiteralPath $rootPackage)) {
    $changes += [pscustomobject]@{ Target = $rootPackage; Backup = ''; Existed = $false }
    Set-Content -LiteralPath $rootPackage -Value '{"private":true,"type":"module"}' -Encoding ASCII
  }
  Push-Location $targetDir
  try {
    if (!(Test-Path 'node_modules\playwright\package.json')) {
      & npm.cmd ci --ignore-scripts
      if ($LASTEXITCODE -ne 0) { throw 'Worker dependencies could not be installed.' }
    }
    & node --check relay.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Worker syntax check failed.' }
    & node --input-type=module --eval "await import('./service-browser.mjs'); await import('./browser-recovery.mjs'); await import('./service-task.mjs'); await import('./relay-poll.mjs'); await import('./service.mjs'); console.log('All worker modules loaded successfully.');"
    if ($LASTEXITCODE -ne 0) { throw 'Worker module check failed. See the error above.' }
  } finally { Pop-Location }
  $installed = $true
  Write-Host 'Repair installed and module checks passed. Your saved login and pairing have been kept.'
  Write-Host ('Previous files saved in: ' + $backupRoot)
  Start-Process -FilePath (Join-Path $targetDir 'windows-connect.cmd') -WorkingDirectory $targetDir
  Write-Host 'The Haynes worker is starting. Refresh Workshop Pro and retry your lookup.'
} catch {
  $failure = $_.Exception.Message
  if (!$installed) {
    for ($i = $changes.Count - 1; $i -ge 0; $i--) {
      $change = $changes[$i]
      if ($change.Existed) { Copy-Item -LiteralPath $change.Backup -Destination $change.Target -Force }
      elseif (Test-Path -LiteralPath $change.Target) { Remove-Item -LiteralPath $change.Target }
    }
  }
  Write-Host $failure -ForegroundColor Red
  if (!$installed -and $changes.Count -gt 0) { Write-Host 'Code files were restored to their previous state.' }
}
[void](Read-Host 'Press Enter to close this repair window')
