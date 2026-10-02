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
  if (Test-Path $configFile) {
    $secureToken = Get-Content -Raw $configFile | ConvertTo-SecureString
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
    ConvertTo-SecureString $workerToken -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $configFile
    $env:HAYNES_RELAY_TOKEN = $workerToken
    Write-Host 'PC paired with Test. Token saved using Windows account encryption.'
  }
  & node relay.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Worker stopped with an error. Please report the message above.' }
} finally { Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue }
