$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$owns=$false; $mutex=$null
try {
    $root=Join-Path $env:LOCALAPPDATA 'VectaWorkers'
    if (!(Test-Path -LiteralPath (Join-Path $root 'state.json'))) { throw 'The existing VECTA Workers installation was not found. Nothing was changed.' }
    $mutex=New-Object System.Threading.Mutex($false,'Local\VectaWorkerManager')
    try { $owns=$mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns=$true }
    if (!$owns) { throw 'In Workshop Connections, press Stop safely and wait for all workers to stop. Close just the panel, then run START-HERE again.' }
    $pattern='(?i)(?:^|[\\/\s"''])(?:relay|live-worker|start-paired|start-website-test|probe|check-live-services|supervisor)\.mjs(?:[\s"'']|$)|workshop-workers\.ps1.+-Worker\s'
    $running=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(node|powershell|pwsh)(\.exe)?$' -and ($_.CommandLine -match $pattern -or ($_.CommandLine -and $_.CommandLine.Contains($root))) })
    if ($running.Count -gt 0) { throw 'A VECTA worker is still running. Stop the workers safely before installing. No worker has been forcibly closed.' }
    foreach ($file in @('workshop-workers.ps1')) {
        $tokens=$null; $errors=$null
        [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
        if ($errors.Count -gt 0) { throw 'The update did not pass Windows validation. Nothing was changed.' }
    }
    $patchRoot=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    & node (Join-Path $PSScriptRoot 'recovery-update.mjs') $root $patchRoot
    if ($LASTEXITCODE -ne 0) { throw 'The update could not complete. Your previous active version has been kept; see the message in this window.' }
    $mutex.ReleaseMutex(); $owns=$false
    $bootstrap=Join-Path $root 'Start-VECTA.ps1'
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$bootstrap+'"')) -WorkingDirectory $root
    [System.Windows.Forms.MessageBox]::Show('Automatic worker recovery is installed. Your existing desktop shortcut and supplier settings are retained. Confirm one live lookup for Haynes, tyres and GSF.','VECTA update installed') | Out-Null
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'VECTA recovery update') | Out-Null
    exit 1
} finally {
    if ($owns) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
