# Stable bootstrap: the Desktop shortcut always targets this file, never a
# downloaded folder or a particular worker version.
$ErrorActionPreference = 'Stop'
try {
    $root = Join-Path $env:LOCALAPPDATA 'VectaWorkers'
    $state = Get-Content -Raw -LiteralPath (Join-Path $root 'state.json') | ConvertFrom-Json
    if ($state.format -ne 1 -or $state.active -notmatch '^[a-f0-9]{40}$') { throw 'Installed worker release is invalid.' }
    $entry = Join-Path $root ('releases\' + $state.active + '\workers\control\workshop-workers.ps1')
    if (!(Test-Path -LiteralPath $entry)) { throw 'The installed worker manager is missing.' }
    & $entry -Root $root
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'VECTA Workers') | Out-Null
    exit 1
}
