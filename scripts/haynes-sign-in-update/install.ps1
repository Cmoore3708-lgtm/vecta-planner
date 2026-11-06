$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'VectaWorkers'
$mutex = $null
$owns = $false
try {
    if (!(Test-Path -LiteralPath (Join-Path $root 'state.json'))) { throw 'Run this on the workshop PC under the Windows account that runs Start VECTA Workers.' }
    $mutex = New-Object System.Threading.Mutex($false,'Local\VectaWorkerManager')
    try { $owns = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns = $true }
    if (!$owns) { throw 'Press Stop safely in Workshop Connections, wait for the workers to stop, then close the panel and run START-HERE again.' }
    $pattern = '(?i)(?:^|[\\/\s"''])(?:relay|live-worker|start-paired|start-website-test|probe|check-live-services|supervisor)\.mjs(?:[\s"'']|$)|workshop-workers\.ps1.+-Worker\s'
    $running = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(node|powershell|pwsh)(\.exe)?$' -and ($_.CommandLine -match $pattern -or ($_.CommandLine -and $_.CommandLine.Contains($root))) })
    if ($running.Count -gt 0) { throw 'Wait for the running workers to stop safely, then run START-HERE again.' }
    & node (Join-Path $PSScriptRoot 'install.mjs') $root
    if ($LASTEXITCODE -ne 0) { throw 'Installation stopped. See the message above.' }
    if (!(Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaHaynes\supplier-login.xml'))) {
        & (Join-Path $PSScriptRoot 'workers\haynes\save-login.ps1')
    }
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    if ($owns) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
$bootstrap = Join-Path $root 'Start-VECTA.ps1'
Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"' + $bootstrap + '"')) -WorkingDirectory $root
