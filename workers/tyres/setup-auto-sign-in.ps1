$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try {
  Write-Host 'VECTA - TYRE SUPPLIER AUTO SIGN-IN SETUP' -ForegroundColor Cyan
  Write-Host 'Keep Haynes running. First close the OLD tyre worker and its separate supplier Edge window.'
  $major = & node -p "process.versions.node.split('.')[0]"
  if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'Node.js 22 or newer is required. Use the same PC as your current tyre worker.' }
  $tokenFile = Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'
  if (!(Test-Path $tokenFile)) { throw 'This Windows user is not paired with Haynes. Run setup using your usual worker Windows login on the workshop PC.' }
  $mutex = New-Object System.Threading.Mutex($false, 'Local\VectaTyreLiveWorker')
  $owns = $false
  try {
    try { $owns = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns = $true }
    if (!$owns) { throw 'The old tyre worker is still running. Close that worker and its supplier Edge window, then run this setup again. Leave Haynes running.' }
  } finally {
    if ($owns) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
  }
  if (!(Test-Path 'node_modules\playwright\package.json')) {
    Write-Host 'Installing the pinned worker dependency. Please wait...'
    & npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check the PC internet connection and run setup again.' }
  }
  & (Join-Path $PSScriptRoot 'save-login.ps1')
  Write-Host 'Starting the updated tyre worker...' -ForegroundColor Green
  & (Join-Path $PSScriptRoot 'start-live.ps1')
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  exit 1
}
