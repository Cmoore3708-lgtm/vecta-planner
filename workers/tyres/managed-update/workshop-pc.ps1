param([switch]$Repair)
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'VectaWorkers'
$stateFile=Join-Path $root 'state.json'
$pattern='(?i)(?:^|[\\/\s"''])(?:relay|live-worker|start-paired|start-website-test|supervisor)\.mjs(?:[\s"'']|$)|workshop-workers\.ps1.+-Worker\s'
function Get-Runners {
    @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -match '^(node|powershell|pwsh)(\.exe)?$' -and $_.CommandLine -match $pattern
    })
}
function Show-Diagnostic {
    Write-Host 'VECTA tyre connection check'
    Write-Host ('PC time: '+(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
    $standalone = Join-Path $env:LOCALAPPDATA 'VectaTyres\Worker\START-TYRES.cmd'
    Write-Host ('Standalone tyre launcher installed: '+(Test-Path -LiteralPath $standalone))
    Write-Host ('Saved ESP sign-in file present: '+(Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaTyres\supplier-login.xml')))
    if (!(Test-Path -LiteralPath $stateFile)) {
        Write-Host 'Managed Workshop Connections installation not found for this Windows account.'
        return
    }
    $state=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($state.active -notmatch '^[a-f0-9]{40}$') { throw 'Release identity unreadable.' }
    $release=Join-Path (Join-Path $root 'releases') $state.active
    $reader=Get-Content -LiteralPath (Join-Path $release 'workers\tyres\live-worker.mjs') -Raw
    $controller=Get-Content -LiteralPath (Join-Path $release 'workers\control\workshop-workers.ps1') -Raw
    Write-Host ('Managed release: '+$state.active)
    Write-Host ('Managed tyre reader can pause for Enter: '+[bool]($reader -match 'terminal\.question'))
    Write-Host ('Managed launcher loads the saved ESP login: '+[bool]($controller -match 'read-esp-login\.ps1|supplier-login\.xml'))
    $runners=@(Get-Runners)
    $tyres=@($runners | Where-Object {$_.Name -eq 'node.exe' -and $_.CommandLine -match '(?i)live-worker\.mjs'})
    Write-Host ('Running tyre reader processes: '+$tyres.Count)
    $statusFile=Join-Path $root 'runtime\Tyres.json'
    if (Test-Path -LiteralPath $statusFile) {
        $s=Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
        Write-Host ('Recorded tyre state: '+$s.state+' '+$s.attentionReason+' '+$s.reason)
        Write-Host ('Last local update: '+$s.updatedAt+' | Last confirmed lookup: '+$s.lookupConfirmedAt)
    }
    Write-Host ('Manual stop flag: '+(Test-Path -LiteralPath (Join-Path $root 'runtime\Tyres.stop')))
    Write-Host 'Use one launcher. In Workshop Connections, Start all starts any missing reader.'
}
try {
    Show-Diagnostic
    if (!$Repair) { exit 0 }
    if (!(Test-Path -LiteralPath $stateFile)) { throw 'Repair requires the managed installation. Keep the check output for Chris.' }
    $bootstrap=Join-Path $root 'Start-VECTA.ps1'
    if (!(Test-Path -LiteralPath $bootstrap)) { throw 'The managed startup script is missing. No changes made.' }
    $mutex=New-Object System.Threading.Mutex($false,'Local\VectaWorkerManager')
    $owns=$false
    try {
        try { $owns=$mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns=$true }
        if (!$owns -or @(Get-Runners).Count -gt 0) { throw 'Use Stop safely in Workshop Connections, wait for the readers to stop, close the panel and re-run APPLY-REPAIR. No processes were stopped by this update.' }
        & node (Join-Path $PSScriptRoot 'patch-release.mjs') $root
        if ($LASTEXITCODE -ne 0) { throw 'The managed release was not switched. Read the message above.' }
    } finally {
        if ($owns) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $startup=[Environment]::GetFolderPath('Startup')
    $shell=New-Object -ComObject WScript.Shell
    $existing=@(Get-ChildItem -LiteralPath $startup -Filter '*.lnk' | Where-Object {
        $link=$shell.CreateShortcut($_.FullName)
        ($link.TargetPath+' '+$link.Arguments) -match '(?i)(VectaWorkers|Start-VECTA|VectaHaynes|VectaTyres|start-live\.ps1|workers[\\/]control|windows-connect\.ps1)'
    })
    if ($existing.Count -eq 0) {
        $name=Join-Path $startup 'VECTA Workshop Connections.lnk'
        if (!(Test-Path -LiteralPath $name)) {
            $link=$shell.CreateShortcut($name)
            $link.TargetPath=$powershell
            $link.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$bootstrap+'"'
            $link.WorkingDirectory=$root
            $link.Save()
            Write-Host 'Workshop Connections will also open when this Windows user signs in.'
        }
    } else { Write-Host 'Existing worker startup shortcut detected and retained. Verify the managed panel opens after Windows sign-in.' }
    Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$bootstrap+'"')) -WorkingDirectory $root
    Write-Host 'Verify an actual fresh tyre lookup from the website before treating the connection as restored.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
