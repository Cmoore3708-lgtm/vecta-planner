$ErrorActionPreference = 'Stop'
Write-Host 'Save the HaynesPro login for this Windows account on the workshop PC.'
$user = Read-Host 'HaynesPro username'
if ([string]::IsNullOrWhiteSpace($user)) { throw 'A username is required.' }
$password = Read-Host 'HaynesPro password' -AsSecureString
if ($password.Length -eq 0) { throw 'A password is required.' }
$folder = Join-Path $env:LOCALAPPDATA 'VectaHaynes'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$target = Join-Path $folder 'supplier-login.xml'
$backup = Join-Path $folder ([Guid]::NewGuid().ToString() + '.bak')
$temp = Join-Path $folder ([Guid]::NewGuid().ToString() + '.tmp')
try {
    $credential = New-Object System.Management.Automation.PSCredential($user.Trim(), $password)
    $credential | Export-Clixml -LiteralPath $temp
    if ([IO.File]::Exists($target)) { [IO.File]::Replace($temp, $target, $backup) }
    else { [IO.File]::Move($temp, $target) }
    Remove-Item -LiteralPath (Join-Path $folder 'last-sign-in.json') -Force -ErrorAction SilentlyContinue
    Write-Host 'HaynesPro login saved for automatic sign-in.'
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    $password.Dispose()
}
