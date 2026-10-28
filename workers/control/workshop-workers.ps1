param([switch]$Install, [ValidateSet('Haynes','Tyres','GSF')][string]$Worker)
$ErrorActionPreference = 'Stop'
$controlDir = Join-Path $env:LOCALAPPDATA 'VectaWorkers'
$settingsFile = Join-Path $controlDir 'workers.json'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Read-Settings {
    if (!(Test-Path -LiteralPath $settingsFile)) { throw 'The desktop shortcut has not been set up on this Windows account.' }
    return Get-Content -Raw -LiteralPath $settingsFile | ConvertFrom-Json
}

function Assert-Installation($settings, [string]$name) {
    $directory = [string]$settings.$name
    if (![IO.Path]::IsPathRooted($directory) -or !(Test-Path -LiteralPath $directory -PathType Container)) {
        throw "$name installation folder is missing. Run shortcut setup to select the existing installation."
    }
    $required = switch ($name) {
        'Haynes' { @('windows-connect.ps1','relay.mjs','node_modules\playwright\package.json','..\..\lib\haynes-vehicle.js') }
        'Tyres' { @('start-live.ps1','live-worker.mjs','node_modules\playwright\package.json','..\..\lib\tyre-relay-contract.js') }
        'GSF' { @('start-paired.mjs','repair-connection.local.json','repair-config.local.json','..\gsf\worker.mjs','..\gsf\node_modules\playwright\package.json') }
    }
    foreach ($file in $required) {
        if (!(Test-Path -LiteralPath (Join-Path $directory $file) -PathType Leaf)) {
            throw "$name needs its existing complete, paired installation. Missing: $file. Nothing has been downloaded or installed."
        }
    }
    if ($name -ne 'GSF' -and !(Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'))) {
        throw 'The existing Haynes PC pairing is missing for this Windows account.'
    }
}

function Find-ExistingWorker([string]$name) {
    # Older packages have no shared mutex. Conservatively skip any matching
    # runner, even if it is from a different installation; never kill it.
    $pattern = switch ($name) {
        'Haynes' { '(?i)(?:^|[\\/\s"''])relay\.mjs(?:[\s"'']|$)|windows-connect\.ps1' }
        'Tyres' { '(?i)(?:^|[\\/\s"''])live-worker\.mjs(?:[\s"'']|$)|start-live\.ps1' }
        'GSF' { '(?i)(?:^|[\\/\s"''])(?:worker|start-paired|start-website-test|probe|check-live-services)\.mjs(?:[\s"'']|$)' }
    }
    return @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
        $_.Name -match '^(node|powershell|pwsh)(\.exe)?$' -and $_.CommandLine -match $pattern
    }).Count -gt 0
}

try {
    if ($Install) {
        Add-Type -AssemblyName System.Windows.Forms
        $settings = [ordered]@{}
        $choices = @(
            @('Haynes','windows-connect.cmd'),
            @('Tyres','START-LIVE-TYRE-PRICES.cmd'),
            @('GSF','START-LIVE-REPAIR-QUOTES.cmd')
        )
        foreach ($choice in $choices) {
            $dialog = New-Object System.Windows.Forms.OpenFileDialog
            try {
                $dialog.Title = 'Select the EXISTING ' + $choice[0] + ' launcher: ' + $choice[1]
                $dialog.Filter = 'Existing VECTA launcher (' + $choice[1] + ')|' + $choice[1]
                if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { throw 'Setup cancelled. Existing workers and shortcuts were not changed.' }
                if ([IO.Path]::GetFileName($dialog.FileName) -ne $choice[1]) { throw 'Select the named launcher from the working installation.' }
                $directory = Split-Path -Parent $dialog.FileName
                # Download packages also contain a root shortcut forwarding to
                # the real worker directory. Support both locations.
                $folder = switch ($choice[0]) { 'Haynes' { 'haynes' }; 'Tyres' { 'tyres' }; 'GSF' { 'repair-quotes' } }
                $nested = Join-Path $directory ('workers\' + $folder)
                if (Test-Path -LiteralPath $nested -PathType Container) { $directory = $nested }
                $settings[$choice[0]] = $directory
            } finally { $dialog.Dispose() }
        }
        foreach ($name in @('Haynes','Tyres','GSF')) { Assert-Installation ([pscustomobject]$settings) $name }
        New-Item -ItemType Directory -Force -Path $controlDir | Out-Null
        $installedScript = Join-Path $controlDir 'workshop-workers.ps1'
        if ([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($installedScript)) {
            Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force
        }
        $settings | ConvertTo-Json | Set-Content -LiteralPath $settingsFile -Encoding UTF8
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Start VECTA Workers.lnk'))
        $shortcut.TargetPath = $powershell
        $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $installedScript + '"'
        $shortcut.WorkingDirectory = $controlDir
        $shortcut.Description = 'Start the existing Haynes, tyre and shared GSF workers'
        $shortcut.Save()
        Write-Host 'Desktop shortcut created: Start VECTA Workers.'
        Write-Host 'Keep the selected installation folders. Your existing sign-ins and pairing have been preserved.'
        Write-Host 'No automatic Windows startup or software updates have been enabled.'
        return
    }

    $settings = Read-Settings
    if ($Worker) {
        $Host.UI.RawUI.WindowTitle = 'VECTA - ' + $Worker
        $mutex = New-Object System.Threading.Mutex($false, ('Local\VectaDesktop' + $Worker))
        $owns = $false
        try {
            try { $owns = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $owns = $true }
            if (!$owns -or (Find-ExistingWorker $Worker)) { Write-Host "$Worker already has a runner open. No duplicate started."; return }
            Assert-Installation $settings $Worker
            # Do not inherit a preview, supplier token, or profile override from
            # the calling shell. Existing launchers load their own pairing.
            foreach ($variable in @('HAYNES_RELAY_TOKEN','HAYNES_PROFILE_DIR','TYRE_PROFILE_DIR','GSF_PROFILE_DIR','GSF_PREVIEW_COOKIE','GSF_WORKSHOP_ORIGIN','GSF_WORKER_TOKEN','GSF_CONFIG_FILE','REPAIR_QUOTE_ORIGIN','REPAIR_QUOTE_WORKER_TOKEN','REPAIR_QUOTE_CONFIG_FILE')) {
                Remove-Item ('Env:' + $variable) -ErrorAction SilentlyContinue
            }
            Set-Location -LiteralPath $settings.$Worker
            switch ($Worker) {
                'Haynes' { & (Join-Path $settings.Haynes 'windows-connect.ps1') }
                'Tyres' { & (Join-Path $settings.Tyres 'start-live.ps1') }
                'GSF' { & node (Join-Path $settings.GSF 'start-paired.mjs'); if ($LASTEXITCODE -ne 0) { throw 'GSF stopped with an error. Read the message above.' } }
            }
            Write-Host "$Worker stopped. This window is not proof that the supplier is connected."
        } finally {
            if ($owns) { $mutex.ReleaseMutex() }
            $mutex.Dispose()
        }
        Read-Host 'Press Enter to close' | Out-Null
        return
    }

    $launcherMutex = New-Object System.Threading.Mutex($false, 'Local\VectaDesktopLauncher')
    $ownsLauncher = $false
    try {
        try { $ownsLauncher = $launcherMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsLauncher = $true }
        if (!$ownsLauncher) { Write-Host 'The desktop launcher is already starting your workers.'; return }
        $nodeMajor = & node -p "process.versions.node.split('.')[0]"
        if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 22) { throw 'The existing Node.js 22 or newer installation is required.' }
        foreach ($name in @('Haynes','Tyres','GSF')) {
            try {
                if (Find-ExistingWorker $name) { Write-Host "$name : runner already open; skipped."; continue }
                Assert-Installation $settings $name
                Start-Process -FilePath $powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Worker',$name) -WorkingDirectory $controlDir | Out-Null
                Write-Host "$name : start requested. Check its window for connection or sign-in messages."
            } catch { Write-Host ($name + ' : ' + $_.Exception.Message) -ForegroundColor Red }
        }
    } finally {
        if ($ownsLauncher) { $launcherMutex.ReleaseMutex() }
        $launcherMutex.Dispose()
    }
    Write-Host 'Keep the worker and supplier windows open. The PC must stay awake and connected.'
    Read-Host 'Press Enter to close this summary' | Out-Null
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    if (!$Install) { Read-Host 'Press Enter to close' | Out-Null }
    exit 1
}
