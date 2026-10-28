# Native Windows tests use synthetic pairing and local stub workers only.
# No supplier websites, real profiles or production relay endpoints are opened.
$ErrorActionPreference = 'Stop'
function Assert-True($Condition, [string]$Message) { if (!$Condition) { throw $Message } }
$repository = Split-Path -Parent $PSScriptRoot
$controller = Join-Path $repository 'workers\control\workshop-workers.ps1'
$bootstrap = Join-Path $repository 'workers\control\permanent-start.ps1'
foreach ($file in @($controller,$bootstrap)) {
    $tokens=$null; $errors=$null
    $ast=[System.Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
    Assert-True ($errors.Count -eq 0) ('PowerShell parse failed: ' + $file)
}
$oldAppData=$env:LOCALAPPDATA
$oldPreview=$env:GSF_PREVIEW_COOKIE
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('VECTA worker test ' + [Guid]::NewGuid().ToString('N'))
$children=@()
try {
    $env:LOCALAPPDATA=Join-Path $testRoot 'Local AppData'
    $env:GSF_PREVIEW_COOKIE='synthetic-old-preview'
    $root=Join-Path $env:LOCALAPPDATA 'VectaWorkers'
    $version='a' * 40
    $release=Join-Path $root ('releases\' + $version)
    New-Item -ItemType Directory -Force -Path (Join-Path $root 'runtime'),(Join-Path $env:LOCALAPPDATA 'VectaHaynes'),(Join-Path $root 'data') | Out-Null
    ConvertTo-SecureString ('1' * 64) -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -NoNewline -LiteralPath (Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt')
    @{format=1;active=$version;previous=$null;blocked=@()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'state.json')
    $stub=@'
import fs from 'node:fs';
const file=process.env.VECTA_WORKER_STATUS_FILE;
const record={pid:process.pid,version:process.env.VECTA_WORKER_VERSION,data:process.env.VECTA_WORKER_DATA_DIR,hasPairing:/^[a-f0-9]{64}$/.test(process.env.HAYNES_RELAY_TOKEN||''),hasPreview:!!process.env.GSF_PREVIEW_COOKIE};
fs.writeFileSync(file,JSON.stringify(record));
const timer=setInterval(()=>{if(fs.existsSync(process.env.VECTA_WORKER_STOP_FILE))clearInterval(timer)},50);
'@
    foreach ($relative in @('workers\haynes\relay.mjs','workers\tyres\live-worker.mjs','workers\repair-quotes\start-paired.mjs')) {
        $file=Join-Path $release $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
        Set-Content -LiteralPath $file -Value $stub -Encoding UTF8
    }
    foreach ($name in @('Haynes','Tyres','GSF')) {
        $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $controller + '"'),'-Root',('"' + $root + '"'),'-Worker',$name)
        $runner=Start-Process powershell.exe -ArgumentList $arguments -PassThru -WindowStyle Hidden
        $children+= $runner
        $statusFile=Join-Path $root ('runtime\' + $name + '.json')
        $watch=[Diagnostics.Stopwatch]::StartNew()
        while (!(Test-Path -LiteralPath $statusFile) -and $watch.Elapsed.TotalSeconds -lt 15) { Start-Sleep -Milliseconds 100 }
        Assert-True (Test-Path -LiteralPath $statusFile) ($name + ' did not start')
        $status=Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json
        Assert-True ($status.version -eq $version) 'Runner used the wrong release'
        Assert-True ($status.data -eq (Join-Path $root 'data')) 'Runner lost persistent settings path'
        Assert-True (!$status.hasPreview) 'Runner inherited preview state'
        Assert-True ($status.hasPairing -eq ($name -ne 'GSF')) 'Pairing was absent or leaked to the GSF runner'
        $duplicate=Start-Process powershell.exe -ArgumentList $arguments -PassThru -WindowStyle Hidden
        $children+= $duplicate
        Assert-True ($duplicate.WaitForExit(10000)) 'Duplicate worker did not exit'
        Assert-True ($duplicate.ExitCode -eq 0) 'Duplicate worker failed unexpectedly'
        Assert-True ((Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json).pid -eq $status.pid) 'Duplicate worker replaced the original'
        Set-Content -LiteralPath (Join-Path $root ('runtime\' + $name + '.stop')) -Value 'stop'
        Assert-True ($runner.WaitForExit(10000)) 'Worker did not stop cooperatively'
        Assert-True ($runner.ExitCode -eq 0) 'Worker exit failed'
        Write-Output ('PASS: ' + $name + ' migration paths, protected environment, duplicate prevention and cooperative stop')
    }
    $shortcutPath=Join-Path $testRoot 'Permanent shortcut.lnk'
    $shell=New-Object -ComObject WScript.Shell
    $link=$shell.CreateShortcut($shortcutPath)
    $link.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $stable=Join-Path $root 'Start-VECTA.ps1'
    $link.Arguments='-NoProfile -ExecutionPolicy Bypass -File "' + $stable + '"'
    $link.Save()
    $before=Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256
    @{format=1;active=('b' * 40);previous=$version;blocked=@()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'state.json')
    Assert-True ((Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256).Hash -eq $before.Hash) 'Version switch changed permanent shortcut'
    Assert-True ($shell.CreateShortcut($shortcutPath).Arguments.Contains($stable)) 'Shortcut targets a versioned folder'
    Write-Output 'PASS: permanent shortcut survives version switching'
    if ($env:GITHUB_ACTIONS -eq 'true') {
        # Exercise the complete installer on an ephemeral GitHub Windows runner,
        # including DPAPI, ACLs, UTF-8 BOM from Windows PowerShell and npm layout.
        $oldFolder=Join-Path $testRoot 'Old Downloads\workers\repair-quotes'
        New-Item -ItemType Directory -Force -Path $oldFolder | Out-Null
        @{origin='https://vecta-planner.vercel.app';token=('1' * 64)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $oldFolder 'repair-connection.local.json') -Encoding UTF8
        '{"calibrationApproved":true,"vehicles":[]}' | Set-Content -LiteralPath (Join-Path $oldFolder 'repair-config.local.json') -Encoding UTF8
        @{GSF=$oldFolder} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'workers.json') -Encoding UTF8
        $fakeEdge=Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application'
        New-Item -ItemType Directory -Force -Path $fakeEdge | Out-Null
        Set-Content -LiteralPath (Join-Path $fakeEdge 'msedge.exe') -Value 'synthetic marker - never executed'
        $setup=Join-Path $testRoot 'One time setup'
        & node (Join-Path $repository 'scripts\package-workshop-workers.mjs') $setup ('c' * 40)
        Assert-True ($LASTEXITCODE -eq 0) 'Installer build failed'
        $desktop=[Environment]::GetFolderPath('Desktop')
        Assert-True (![string]::IsNullOrEmpty($desktop)) 'Windows test Desktop is unavailable'
        New-Item -ItemType Directory -Force -Path $desktop | Out-Null
        $desktopLink=Join-Path $desktop 'Start VECTA Workers.lnk'
        $oldDesktopBytes=$null
        if (Test-Path -LiteralPath $desktopLink) { $oldDesktopBytes=[IO.File]::ReadAllBytes($desktopLink) }
        $startup=Join-Path ([Environment]::GetFolderPath('Startup')) 'Vecta Haynes Test.lnk'
        Assert-True (!(Test-Path -LiteralPath $startup)) 'Refusing to modify an existing startup shortcut in test'
        # The earlier state was a synthetic runner fixture, not an installation.
        Remove-Item -LiteralPath (Join-Path $root 'state.json')
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $setup 'workers\control\workshop-workers.ps1') -Install -Root $root
            Assert-True ($LASTEXITCODE -eq 0) 'Complete Windows installation failed'
            $installed=Get-Content -Raw -LiteralPath (Join-Path $root 'state.json') | ConvertFrom-Json
            Assert-True ($installed.active -eq ('c' * 40)) 'Installer did not activate its prepared version'
            Assert-True (Test-Path -LiteralPath (Join-Path $root 'data\repair-quotes\repair-config.local.json')) 'Persistent settings were not migrated'
            $link=$shell.CreateShortcut($desktopLink)
            Assert-True ($link.Arguments.Contains((Join-Path $root 'Start-VECTA.ps1'))) 'Installed Desktop link is not permanent'
            Remove-Item -LiteralPath (Join-Path $testRoot 'Old Downloads') -Recurse -Force
            Assert-True (Test-Path -LiteralPath (Join-Path $root 'data\repair-quotes\repair-connection.local.json')) 'Settings depend on Downloads after migration'
            # Re-running an old installer must keep the active version without
            # reading a removed source folder or reinstalling dependencies.
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $setup 'workers\control\workshop-workers.ps1') -Install -Root $root
            Assert-True ($LASTEXITCODE -eq 0) 'Reinstall depended on removed Downloads'
            Assert-True ((Get-Content -Raw -LiteralPath (Join-Path $root 'state.json') | ConvertFrom-Json).active -eq ('c' * 40)) 'Reinstall replaced the active release'
            Write-Output 'PASS: complete Windows migration, private ACL, pinned dependencies and permanent desktop shortcut'
        } finally {
            if ($null -ne $oldDesktopBytes) { [IO.File]::WriteAllBytes($desktopLink,$oldDesktopBytes) }
            else { Remove-Item -LiteralPath $desktopLink -ErrorAction SilentlyContinue }
        }
    }
} finally {
    foreach ($child in $children) {
        if (!$child.HasExited) {
            # Only terminate synthetic test process trees owned by this test.
            & taskkill.exe /PID $child.Id /T /F 2>$null | Out-Null
        }
        $child.Dispose()
    }
    $env:LOCALAPPDATA=$oldAppData; $env:GSF_PREVIEW_COOKIE=$oldPreview
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
