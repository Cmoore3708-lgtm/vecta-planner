$ErrorActionPreference = 'Stop'
$folder = Join-Path $env:LOCALAPPDATA 'VectaTyres'
$file = Join-Path $folder 'supplier-login.xml'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
Write-Host 'Enter your ESP / The Virtual Warehouse login. It is encrypted for this Windows user on this PC.'
$credential = Get-Credential -Message 'The Virtual Warehouse / ESP sign-in'
if (!$credential -or [string]::IsNullOrWhiteSpace($credential.UserName) -or $credential.Password.Length -eq 0) { throw 'No login saved.' }
$credential | Export-Clixml -LiteralPath $file
Write-Host 'Login saved. Close the existing tyre worker, then run START-LIVE-TYRE-PRICES.cmd.'
Write-Host 'To remove the saved login, delete supplier-login.xml from LocalAppData\VectaTyres.'
