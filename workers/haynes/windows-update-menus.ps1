$ErrorActionPreference = 'Stop'
try {
  Write-Host 'VECTA Haynes menu update'
  Write-Host 'Close the running Haynes black window before continuing.'
  [void](Read-Host 'Press Enter once that window is closed')
  $targetDir = Join-Path $env:LOCALAPPDATA 'VectaHaynes\app\workers\haynes'
  if (!(Test-Path (Join-Path $targetDir 'relay.mjs'))) {
    Add-Type -AssemblyName System.Windows.Forms
    $picker = New-Object System.Windows.Forms.FolderBrowserDialog
    $picker.Description = 'Select your existing Haynes worker folder (containing windows-connect.cmd and relay.mjs)'
    if ($picker.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'No worker folder selected. Nothing changed.' }
    $targetDir = $picker.SelectedPath
  }
  foreach ($name in @('relay.mjs','windows-connect.cmd','maintenance-menus.mjs')) {
    if (!(Test-Path (Join-Path $targetDir $name))) { throw "The selected folder is missing $name. Nothing changed." }
  }
  $source = Join-Path $PSScriptRoot 'maintenance-menus.mjs'
  $target = Join-Path $targetDir 'maintenance-menus.mjs'
  if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($target)) {
    $backup = $target + '.before-large-menu-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak'
    Copy-Item -LiteralPath $target -Destination $backup
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { Copy-Item -LiteralPath $backup -Destination $target -Force; throw 'Copy verification failed; previous file restored.' }
  }
  Write-Host 'Menu update installed. Your saved login and pairing have been kept.'
  Start-Process -FilePath (Join-Path $targetDir 'windows-connect.cmd') -WorkingDirectory $targetDir
  Write-Host 'The Haynes worker is starting. Refresh Workshop Pro and retry the lookup.'
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
}
[void](Read-Host 'Press Enter to close this update window')
