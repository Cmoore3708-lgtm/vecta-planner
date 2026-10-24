$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$file = Join-Path $env:LOCALAPPDATA 'VectaTyres\supplier-login.xml'
if (!(Test-Path -LiteralPath $file)) { exit 1 }
$credential = Import-Clixml -LiteralPath $file
if ($credential -isnot [System.Management.Automation.PSCredential]) { exit 1 }
# Output goes only to the worker's captured child-process pipe. Never run this as a diagnostic.
@{ username = $credential.UserName; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
