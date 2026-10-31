$ErrorActionPreference = 'Stop'
Write-Host 'Optional ESP automatic sign-in. Credentials are encrypted for this Windows account on this PC.'
Write-Host 'Only use your existing ESP account. Nothing is sent to Vecta servers.'
$user = Read-Host 'ESP username (leave blank to cancel)'
if ([string]::IsNullOrWhiteSpace($user)) { return }
$password = Read-Host 'ESP password' -AsSecureString
$credential = New-Object System.Management.Automation.PSCredential($user, $password)
$folder = Join-Path $env:LOCALAPPDATA 'VectaTyres'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$credential | Export-Clixml (Join-Path $folder 'supplier-login.xml')
Write-Host 'Saved securely. Restart only the tyre worker to enable automatic sign-in.'
