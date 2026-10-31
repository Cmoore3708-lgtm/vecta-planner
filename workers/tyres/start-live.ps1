$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$major = & node -p "process.versions.node.split('.')[0]"
if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'Node.js 22 or newer is required on the workshop PC.' }
$tokenFile = Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'
if (!(Test-Path $tokenFile)) { throw 'Run this on the workshop PC already paired with Haynes. Leave your existing Haynes worker running.' }
$mutex = New-Object System.Threading.Mutex($false, 'Local\VectaTyreLiveWorker')
$owns = $false
try {
 try { $owns = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns = $true }
 if (!$owns) { Write-Host 'The live tyre worker is already running.'; return }
 if (!(Test-Path 'node_modules\playwright\package.json')) {
  & npm.cmd ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Package installation failed. Send the error text.' }
 }
 $secure = (Get-Content -Raw $tokenFile).Trim() | ConvertTo-SecureString
 $env:HAYNES_RELAY_TOKEN = (New-Object System.Net.NetworkCredential('', $secure)).Password
 $loginFile = Join-Path $env:LOCALAPPDATA 'VectaTyres\supplier-login.xml'
 if (Test-Path $loginFile) {
  $login = Import-Clixml $loginFile
  $env:ESP_USERNAME = $login.UserName
  $env:ESP_PASSWORD = $login.GetNetworkCredential().Password
 }
 $failures = 0
 while ($true) {
  & node live-worker.mjs
  $failures++
  $delay = [Math]::Min(300, 5 * [Math]::Pow(2, [Math]::Min($failures - 1, 6)))
  Write-Host "Tyre browser stopped. Restarting automatically in $delay seconds. Close this window to stop."
  Start-Sleep -Seconds $delay
 }
} finally {
 Remove-Item Env:ESP_USERNAME -ErrorAction SilentlyContinue
 Remove-Item Env:ESP_PASSWORD -ErrorAction SilentlyContinue
 Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue
 if ($owns) { $mutex.ReleaseMutex() }
 $mutex.Dispose()
}
