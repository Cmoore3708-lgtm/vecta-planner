param([switch]$Install, [ValidateSet('Haynes','Tyres','GSF')][string]$Worker, [string]$Root)
$ErrorActionPreference = 'Stop'
if (!$Root) { $Root = Join-Path $env:LOCALAPPDATA 'VectaWorkers' }
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$names = @('Haynes','Tyres','GSF')

function Get-Release {
    $state = Get-Content -Raw -LiteralPath (Join-Path $Root 'state.json') | ConvertFrom-Json
    if ($state.format -ne 1 -or $state.active -notmatch '^[a-f0-9]{40}$') { throw 'Installed worker release is invalid.' }
    return Join-Path $Root ('releases\' + $state.active)
}
function Find-Runner([string]$Name, $Processes) {
    $pattern = switch ($Name) {
        'Haynes' { '(?i)(?:^|[\\/\s"''])relay\.mjs(?:[\s"'']|$)|windows-connect\.ps1' }
        'Tyres' { '(?i)(?:^|[\\/\s"''])live-worker\.mjs(?:[\s"'']|$)|start-live\.ps1' }
        'GSF' { '(?i)(?:^|[\\/\s"''])(?:worker|start-paired|start-website-test|probe|check-live-services)\.mjs(?:[\s"'']|$)' }
    }
    $managed = '(?i)workshop-workers\.ps1.+-Worker\s+"?' + $Name + '(?:\s|"|$)'
    return @($Processes | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(node|powershell|pwsh)(\.exe)?$' -and ($_.CommandLine -match $pattern -or $_.CommandLine -match $managed) })
}
function Get-Runners { return @(Get-CimInstance Win32_Process -ErrorAction Stop) }
function Any-Runner {
    $processes = Get-Runners
    foreach ($name in $names) { if (@(Find-Runner $name $processes).Count -gt 0) { return $true } }
    return $false
}
function Invoke-Maintenance([string]$Action, [string[]]$Extra = @()) {
    $release = Get-Release
    & node (Join-Path $release 'workers\control\release-cli.mjs') $Action $Root @Extra
    if ($LASTEXITCODE -ne 0) { throw 'Maintenance did not complete. The previous worker version is retained.' }
}

try {
    if ($Install) {
        Add-Type -AssemblyName System.Windows.Forms
        $major = & node -p "process.versions.node.split('.')[0]"
        if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'Node.js 22 or newer must already be installed on this PC.' }
        $edgeRoots = @(${env:ProgramFiles(x86)},$env:ProgramFiles,$env:LOCALAPPDATA) | Where-Object { $_ }
        $edge = @($edgeRoots | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft\Edge\Application\msedge.exe') })
        if (!$edge.Count) { throw 'Microsoft Edge was not found on this PC.' }
        if (Any-Runner) { throw 'Close the existing worker consoles before the one-time migration. Their profiles and settings will be preserved.' }
        $pairing = Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'
        if (!(Test-Path -LiteralPath $pairing)) { throw 'Use the Windows account that is already paired with Haynes.' }
        # Confirm that Windows can decrypt the existing pairing without exposing it.
        $secure = (Get-Content -Raw -LiteralPath $pairing).Trim() | ConvertTo-SecureString
        $token = (New-Object System.Net.NetworkCredential('', $secure)).Password
        if ($token -notmatch '^[a-f0-9]{64}$') { throw 'The existing PC pairing is invalid.' }
        $token = $null
        $artifact = Join-Path $PSScriptRoot '..\..\initial-release.vecta.gz'
        if (!(Test-Path -LiteralPath $artifact)) { throw 'Use the complete one-time VECTA Workers installer, extracted first.' }
        New-Item -ItemType Directory -Force -Path $Root | Out-Null
        # Keep the new private settings restricted to this Windows account and SYSTEM.
        $acl = New-Object System.Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        foreach ($identity in @($user, (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')))) {
            $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $Root -AclObject $acl
        if (Test-Path -LiteralPath (Join-Path $Root 'data\repair-quotes\repair-connection.local.json')) {
            $sources = @{ GSF = (Join-Path $Root 'data\repair-quotes') }
        } else {
            # Old shortcut-only setup may already identify the working installation.
            $oldSettings = Join-Path $Root 'workers.json'
            if (Test-Path -LiteralPath $oldSettings) {
                $old = Get-Content -Raw -LiteralPath $oldSettings | ConvertFrom-Json
                $sources = @{ GSF = [string]$old.GSF }
            } else {
                $dialog = New-Object System.Windows.Forms.OpenFileDialog
                try {
                    $dialog.Title = 'One-time setup: select repair-connection.local.json in the existing working GSF/repair folder'
                    $dialog.Filter = 'Existing live pairing|repair-connection.local.json'
                    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Setup cancelled. Existing installations are unchanged.' }
                    $sources = @{ GSF = (Split-Path -Parent $dialog.FileName) }
                } finally { $dialog.Dispose() }
            }
        }
        $sourceFile = Join-Path $Root 'migration-sources.tmp.json'
        try {
            $sources | ConvertTo-Json | Set-Content -LiteralPath $sourceFile -Encoding UTF8
            & node (Join-Path $PSScriptRoot 'release-cli.mjs') install $Root $artifact $sourceFile
            if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Existing workers and desktop shortcut have not been replaced.' }
        } finally { Remove-Item -LiteralPath $sourceFile -ErrorAction SilentlyContinue }
        $bootstrap = Join-Path $Root 'Start-VECTA.ps1'
        # Stable entrypoint is installed once. Future releases switch state.json.
        if (!(Test-Path -LiteralPath $bootstrap)) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'permanent-start.ps1') -Destination $bootstrap }
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Start VECTA Workers.lnk'))
        $shortcut.TargetPath = $powershell
        $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $bootstrap + '"'
        $shortcut.WorkingDirectory = $Root
        $shortcut.Description = 'Start and manage all VECTA supplier workers'
        $shortcut.Save()
        # Only retire the exact previous Haynes startup shortcut after migration
        # succeeded. Keep a restorable copy; do not alter any other startup task.
        $oldStartup = Join-Path ([Environment]::GetFolderPath('Startup')) 'Vecta Haynes Test.lnk'
        if (Test-Path -LiteralPath $oldStartup) {
            $backup = Join-Path $Root 'migration-backup'
            New-Item -ItemType Directory -Force -Path $backup | Out-Null
            Copy-Item -LiteralPath $oldStartup -Destination (Join-Path $backup ('Vecta-Haynes-startup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.lnk'))
            Remove-Item -LiteralPath $oldStartup
        }
        Write-Host 'Installed. Use Start VECTA Workers on your desktop from now on.'
        Write-Host 'Your Downloads folders are no longer used. Existing sign-ins and pairing were preserved.'
        Write-Host 'The manager checks approved worker releases when no workers are running.'
        return
    }

    if ($Worker) {
        $Host.UI.RawUI.WindowTitle = 'VECTA - ' + $Worker
        $mutex = New-Object System.Threading.Mutex($false, ('Local\VectaDesktop' + $Worker))
        $owns = $false
        try {
            try { $owns = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns = $true }
            if (!$owns -or @(Find-Runner $Worker (Get-Runners)).Count -gt 0) { Write-Host "$Worker is already running. No duplicate started."; return }
            if (Test-Path -LiteralPath (Join-Path $Root 'maintenance.lock')) { throw 'An update is being prepared. Start this worker from the manager when it finishes.' }
            $release = Get-Release
            $runtimeDir = Join-Path $Root 'runtime'
            New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
            $stopFile = Join-Path $runtimeDir ($Worker + '.stop')
            Remove-Item -LiteralPath $stopFile -ErrorAction SilentlyContinue
            foreach ($variable in @('HAYNES_RELAY_TOKEN','HAYNES_PROFILE_DIR','TYRE_PROFILE_DIR','GSF_PROFILE_DIR','GSF_PREVIEW_COOKIE','GSF_WORKSHOP_ORIGIN','GSF_WORKER_TOKEN','GSF_CONFIG_FILE','REPAIR_QUOTE_ORIGIN','REPAIR_QUOTE_WORKER_TOKEN','REPAIR_QUOTE_CONFIG_FILE')) {
                Remove-Item ('Env:' + $variable) -ErrorAction SilentlyContinue
            }
            $env:VECTA_MANAGED_WORKERS = '1'
            $env:VECTA_WORKER_DATA_DIR = Join-Path $Root 'data'
            $env:VECTA_WORKER_STATUS_FILE = Join-Path $runtimeDir ($Worker + '.json')
            $env:VECTA_WORKER_STOP_FILE = $stopFile
            $env:VECTA_WORKER_VERSION = Split-Path -Leaf $release
            if ($Worker -ne 'GSF') {
                $secure = (Get-Content -Raw -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt')).Trim() | ConvertTo-SecureString
                $env:HAYNES_RELAY_TOKEN = (New-Object System.Net.NetworkCredential('', $secure)).Password
            }
            $entry = switch ($Worker) { 'Haynes' { 'workers\haynes\relay.mjs' }; 'Tyres' { 'workers\tyres\live-worker.mjs' }; 'GSF' { 'workers\repair-quotes\start-paired.mjs' } }
            Set-Location -LiteralPath $release
            & node (Join-Path $release $entry)
            if ($LASTEXITCODE -ne 0) { throw "$Worker needs attention. Read the message above; your settings have been kept." }
        } finally {
            Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue
            if ($owns) { $mutex.ReleaseMutex() }
            $mutex.Dispose()
        }
        return
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $managerMutex = New-Object System.Threading.Mutex($false, 'Local\VectaWorkerManager')
    $ownsManager = $false
    try { $ownsManager = $managerMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsManager = $true }
    if (!$ownsManager) { [System.Windows.Forms.MessageBox]::Show('VECTA Workers is already open. Look for its window on the taskbar.', 'VECTA Workers') | Out-Null; return }
    try {
        $script:busy = $false
        $script:maintenanceProcess = $null
        $script:labels = @{}
        $form = New-Object System.Windows.Forms.Form
        $form.Text = 'VECTA | Workshop Connections'
        $form.Size = New-Object System.Drawing.Size(650,430)
        $form.MinimumSize = $form.Size
        $form.MaximumSize = $form.Size
        $form.StartPosition = 'CenterScreen'
        $form.BackColor = [System.Drawing.Color]::FromArgb(22,24,28)
        $form.ForeColor = [System.Drawing.Color]::WhiteSmoke
        $form.Font = New-Object System.Drawing.Font('Segoe UI',11)
        $heading = New-Object System.Windows.Forms.Label
        $heading.Text = 'VECTA  /  WORKSHOP CONNECTIONS'
        $heading.Location = New-Object System.Drawing.Point(26,23)
        $heading.Size = New-Object System.Drawing.Size(590,30)
        $heading.Font = New-Object System.Drawing.Font('Segoe UI Semibold',14)
        $form.Controls.Add($heading)
        $index = 0
        foreach ($name in $names) {
            $label = New-Object System.Windows.Forms.Label
            $label.Text = $name + '  -  Checking...'
            $label.Location = New-Object System.Drawing.Point(28,(80 + 43 * $index))
            $label.Size = New-Object System.Drawing.Size(570,36)
            $form.Controls.Add($label); $script:labels[$name] = $label; $index++
        }
        $notice = New-Object System.Windows.Forms.Label
        $notice.Text = 'Starting your workshop connections...'
        $notice.Location = New-Object System.Drawing.Point(28,215)
        $notice.Size = New-Object System.Drawing.Size(570,63)
        $notice.ForeColor = [System.Drawing.Color]::Silver
        $form.Controls.Add($notice)
        function New-Button([string]$Text,[int]$Left,[int]$Width) {
            $button = New-Object System.Windows.Forms.Button
            $button.Text = $Text; $button.Location = New-Object System.Drawing.Point($Left,294)
            $button.Size = New-Object System.Drawing.Size($Width,42)
            $button.FlatStyle = 'Flat'; $button.BackColor = [System.Drawing.Color]::FromArgb(40,43,49)
            $form.Controls.Add($button); return $button
        }
        $start = New-Button 'Start all' 28 125
        $stop = New-Button 'Stop safely' 163 135
        $update = New-Button 'Check updates' 308 145
        $restore = New-Button 'Restore previous' 463 145
        $footer = New-Object System.Windows.Forms.Label
        $footer.Location = New-Object System.Drawing.Point(28,352)
        $footer.Size = New-Object System.Drawing.Size(570,25)
        $footer.Font = New-Object System.Drawing.Font('Segoe UI',9)
        $footer.ForeColor = [System.Drawing.Color]::Silver
        $form.Controls.Add($footer)
        function Start-All {
            if ($script:busy) { return }
            $processes = Get-Runners
            $scriptPath = Join-Path (Get-Release) 'workers\control\workshop-workers.ps1'
            foreach ($name in $names) {
                if (@(Find-Runner $name $processes).Count -gt 0) { continue }
                Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $scriptPath + '"'),'-Root',('"' + $Root + '"'),'-Worker',$name) -WorkingDirectory $Root -WindowStyle Normal | Out-Null
            }
            $notice.Text = 'Workers are starting. Keep their windows and Edge open. If a supplier asks you to sign in, use its window.'
        }
        function Begin-Maintenance([string]$Action) {
            if ($script:busy) { return }
            if (Any-Runner) {
                $notice.Text = 'Workers are running. Updates wait until they stop, so a lookup is never interrupted.'
                if ($Action -eq 'update') { Start-All }
                return
            }
            $script:busy = $true
            foreach ($button in @($start,$stop,$update,$restore)) { $button.Enabled = $false }
            $notice.Text = 'Checking the approved release. Any update is prepared separately; your working version and sign-ins are kept.'
            $process = New-Object System.Diagnostics.Process
            $process.StartInfo.FileName = (Get-Command node -CommandType Application).Source
            $cli = Join-Path (Get-Release) 'workers\control\release-cli.mjs'
            $process.StartInfo.Arguments = '"' + $cli + '" ' + $Action + ' "' + $Root + '"'
            $process.StartInfo.UseShellExecute = $false
            $process.StartInfo.CreateNoWindow = $true
            $process.StartInfo.RedirectStandardOutput = $true
            $process.StartInfo.RedirectStandardError = $true
            [void]$process.Start()
            $script:maintenanceOutput = $process.StandardOutput.ReadToEndAsync()
            $script:maintenanceError = $process.StandardError.ReadToEndAsync()
            $script:maintenanceProcess = $process
            $script:maintenanceAction = $Action
        }
        $start.Add_Click({ try { Start-All } catch { $notice.Text = $_.Exception.Message } })
        $stop.Add_Click({
            try {
                $runtimeDir = Join-Path $Root 'runtime'
                New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
                foreach ($name in $names) { Set-Content -LiteralPath (Join-Path $runtimeDir ($name + '.stop')) -Value 'stop' }
                $notice.Text = 'Stop requested. Current lookups finish first. Older unmanaged workers may need their consoles closed.'
            } catch { $notice.Text = $_.Exception.Message }
        })
        $update.Add_Click({ try { Begin-Maintenance 'update' } catch { $notice.Text = $_.Exception.Message; $script:busy = $false } })
        $restore.Add_Click({ try { Begin-Maintenance 'rollback' } catch { $notice.Text = $_.Exception.Message; $script:busy = $false } })
        $timer = New-Object System.Windows.Forms.Timer
        $timer.Interval = 1500
        $timer.Add_Tick({
            try {
                if ($script:maintenanceProcess -and $script:maintenanceProcess.HasExited) {
                    $process = $script:maintenanceProcess
                    $success = $process.ExitCode -eq 0
                    $result = $script:maintenanceOutput.GetAwaiter().GetResult()
                    $errorResult = $script:maintenanceError.GetAwaiter().GetResult()
                    $process.Dispose(); $script:maintenanceProcess = $null; $script:busy = $false
                    foreach ($button in @($start,$stop,$update,$restore)) { $button.Enabled = $true }
                    if ($success) { Start-All; $notice.Text = 'Approved release checked. Starting your connections using the installed version.' }
                    else {
                        Start-All
                        $notice.Text = 'Update check could not complete. Your installed version is being used. No new files are needed from you.'
                        # Record maintenance failures privately for support, never supplier tokens.
                        Set-Content -LiteralPath (Join-Path $Root 'last-maintenance-error.txt') -Value $errorResult
                    }
                }
                $processes = Get-Runners
                $footer.Text = 'Installed ' + (Split-Path -Leaf (Get-Release)).Substring(0,8) + '  |  Keep the PC awake and online'
                foreach ($name in $names) {
                    $text = 'Stopped'; $colour = [System.Drawing.Color]::Silver
                    if (@(Find-Runner $name $processes).Count -gt 0) {
                        $text = 'Starting / existing runner'; $colour = [System.Drawing.Color]::Khaki
                        $file = Join-Path $Root ('runtime\' + $name + '.json')
                        try {
                            $status = Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
                            $fresh = ([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($status.updatedAt)).TotalSeconds -lt 60
                            if ($fresh -and @($processes | Where-Object { $_.ProcessId -eq $status.pid }).Count -gt 0) {
                                $text = switch ($status.state) {
                                    'connected' { 'Relay reachable - waiting for requests' }
                                    'working' { 'Checking requests' }
                                    'attention' { 'Needs attention - see supplier window' }
                                    'reconnecting' { 'Reconnecting' }
                                    default { 'Starting' }
                                }
                                if ($status.state -eq 'connected') { $colour = [System.Drawing.Color]::LightGreen }
                                if ($status.state -eq 'attention') { $colour = [System.Drawing.Color]::Salmon }
                            }
                        } catch {}
                    }
                    $script:labels[$name].Text = $name + '  -  ' + $text
                    $script:labels[$name].ForeColor = $colour
                }
            } catch { $notice.Text = $_.Exception.Message }
        })
        $form.Add_Shown({ try { Begin-Maintenance 'update' } catch { $notice.Text = $_.Exception.Message; $script:busy = $false; Start-All } })
        $form.Add_FormClosing({ param($sender,$eventArgs) if ($script:busy) { $eventArgs.Cancel = $true; $notice.Text = 'An update is being prepared. Please leave this window open until it finishes.' } })
        $timer.Start()
        try { [void]$form.ShowDialog() } finally { $timer.Stop(); $timer.Dispose(); $form.Dispose() }
    } finally { if ($ownsManager) { $managerMutex.ReleaseMutex() }; $managerMutex.Dispose() }
} catch {
    if ($Worker) {
        Write-Host $_.Exception.Message -ForegroundColor Red
        try {
            $runtimeDir = Join-Path $Root 'runtime'
            New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
            @{name=$Worker;pid=$PID;state='attention';reason='WORKER_STOPPED';updatedAt=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir ($Worker + '.json')) -Encoding UTF8
        } catch {}
        Read-Host 'Press Enter to close' | Out-Null
    }
    else { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'VECTA Workers') | Out-Null }
    exit 1
}
