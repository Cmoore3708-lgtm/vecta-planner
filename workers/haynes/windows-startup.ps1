param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Vecta Haynes Test.lnk'
if ($Remove) {
  Remove-Item $shortcutPath -ErrorAction SilentlyContinue
  Write-Host 'Automatic Haynes Test startup removed. Close its window to stop the current worker.'
  exit
}
$configDir = Join-Path $env:LOCALAPPDATA 'VectaHaynes'
if (!(Test-Path (Join-Path $configDir 'relay-token.txt'))) { throw 'First run windows-login.cmd and windows-connect.cmd on this PC.' }
$sourceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$installRoot = Join-Path $configDir 'app'
$workerDir = Join-Path $installRoot 'workers\haynes'
$libDir = Join-Path $installRoot 'lib'
New-Item -ItemType Directory -Force -Path $workerDir, $libDir | Out-Null
Set-Content -Path (Join-Path $installRoot 'package.json') -Value '{"private":true,"type":"module"}'
if ([IO.Path]::GetFullPath($PSScriptRoot) -ne [IO.Path]::GetFullPath($workerDir)) {
  Get-ChildItem $PSScriptRoot -File | Where-Object { $_.Extension -in '.mjs','.cmd','.ps1','.json' } | Copy-Item -Destination $workerDir -Force
  Copy-Item (Join-Path $sourceRoot 'lib\haynes-vehicle.js') $libDir -Force
}
Push-Location $workerDir
try {
  & npm.cmd ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Worker installation failed. Startup has not been enabled.' }
} finally { Pop-Location }
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $workerDir 'windows-connect.ps1') + '" -Startup'
$shortcut.WorkingDirectory = $workerDir
$shortcut.WindowStyle = 1
$shortcut.Description = 'Vecta Haynes Test worker'
$shortcut.Save()
Write-Host 'Automatic startup installed for this Windows account.'
Write-Host 'At your next Windows sign-in, the Haynes Test window will open automatically.'
Write-Host 'Keep the PC switched on, signed in, connected to the internet and awake.'
Write-Host 'Close the Haynes window to stop it. No administrator password is needed.'
