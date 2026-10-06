param([switch]$Startup)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path 'node_modules\playwright\package.json')) {
  & npm.cmd ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Trying direct installation of the pinned worker packages.'
    & npm.cmd install --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Install failed. Please report the error shown above.' }
  }
}
$configDir = Join-Path $env:LOCALAPPDATA 'VectaHaynes'
$configFile = Join-Path $configDir 'relay-token.txt'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
try {
  if ($Startup -and !(Test-Path $configFile)) { throw 'Pair this PC with windows-connect.cmd before enabling startup.' }
  if (Test-Path $configFile) {
    $secureToken = (Get-Content -Raw $configFile).Trim() | ConvertTo-SecureString
    $env:HAYNES_RELAY_TOKEN = (New-Object System.Net.NetworkCredential('', $secureToken)).Password
  } else {
    $pairCode = Read-Host 'Enter your Test pairing code'
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $workerToken = [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
    $body = @{action='pair'; code=$pairCode.Trim(); token=$workerToken} | ConvertTo-Json
    $result = Invoke-RestMethod -Uri 'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pc-relay' -Method Post -ContentType 'application/json' -Body $body
    if ($result.status -ne 'PAIRED') { throw 'Pairing failed. Request a new pairing code.' }
    ConvertTo-SecureString $workerToken -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -NoNewline $configFile
    $env:HAYNES_RELAY_TOKEN = $workerToken
    Write-Host 'PC paired with Test. Token saved using Windows account encryption.'
  }
  $workerMutex = New-Object System.Threading.Mutex($false, 'Local\VectaHaynesTestWorker')
  $ownsWorker = $false
  try {
    try { $ownsWorker = $workerMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsWorker = $true }
    if (!$ownsWorker) { Write-Host 'Haynes Test is already running in another window.'; return }
    do {
      & node relay.mjs
      if (!$Startup) {
        if ($LASTEXITCODE -ne 0) { throw 'Worker stopped with an error. Please report the message above.' }
        break
      }
      Write-Host 'Haynes Test stopped. Retrying in 15 seconds. Close this window to stop.'
      Start-Sleep -Seconds 15
    } while ($Startup)
  } finally {
    if ($ownsWorker) { $workerMutex.ReleaseMutex() }
    $workerMutex.Dispose()
  }
} finally { Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue }
