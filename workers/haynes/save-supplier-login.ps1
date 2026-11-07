$ErrorActionPreference='Stop'
Write-Host 'Optional automatic Haynes sign-in for vehicle and service lookups.'
Write-Host 'Credentials stay encrypted for this Windows account on this PC.'
$user=Read-Host 'Haynes username (leave blank to cancel)'
if ([string]::IsNullOrWhiteSpace($user)) { return }
$password=Read-Host 'Haynes password' -AsSecureString
$credential=New-Object System.Management.Automation.PSCredential($user,$password)
$folder=Join-Path $env:LOCALAPPDATA 'VectaHaynes'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$credential | Export-Clixml (Join-Path $folder 'supplier-login.xml')
Remove-Item -LiteralPath (Join-Path $folder 'login-attempt.json') -ErrorAction SilentlyContinue
Write-Host 'Saved. Start the updated Haynes worker. Verification challenges still need you.'
