$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Join-Path $env:LOCALAPPDATA 'VectaWorkers'
$power = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$restart = $false
function Start-Workers {
    $state = Get-Content -Raw -LiteralPath (Join-Path $root 'state.json') | ConvertFrom-Json
    if ($state.active -notmatch '^[a-f0-9]{40}$') { throw 'The installed worker location is invalid.' }
    $entry = Join-Path $root ('releases\' + $state.active + '\workers\control\workshop-workers.ps1')
    foreach ($name in @('Haynes','Tyres','GSF')) {
        Start-Process -FilePath $power -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $entry + '"'),'-Worker',$name,'-Root',('"' + $root + '"')) | Out-Null
    }
}
try {
    Write-Host 'VECTA - preparing your 100-vehicle test.'
    if (!(Test-Path -LiteralPath (Join-Path $root 'state.json'))) { throw 'The permanent VECTA Workers installation was not found. Nothing has been changed.' }
    $major = & node -p "process.versions.node.split('.')[0]"
    if ($LASTEXITCODE -ne 0 -or [int]$major -lt 22) { throw 'The existing Node.js installation needs attention. Nothing has been changed.' }
    $pairFile = Join-Path $env:LOCALAPPDATA 'VectaHaynes\relay-token.txt'
    if (!(Test-Path -LiteralPath $pairFile)) { throw 'The saved PC connection was not found. Nothing has been changed.' }
    $secure = (Get-Content -Raw -LiteralPath $pairFile).Trim() | ConvertTo-SecureString
    $token = (New-Object System.Net.NetworkCredential('', $secure)).Password
    if ($token -notmatch '^[a-f0-9]{64}$') { throw 'The saved PC connection is invalid. Nothing has been changed.' }
    # Verify the new private relay using the saved credential without printing it.
    $endpoint = 'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/worker-batch-tests'
    $headers = @{ Authorization = 'Bearer ' + $token }
    $check = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -ContentType 'application/json' -Body '{"action":"preflight"}' -TimeoutSec 20
    $token = $null; $headers = $null
    if ($check.status -notin @('READY','WORKER_OFFLINE','WORKER_CONFIGURATION_REQUIRED')) { throw 'The test connection is not ready. Your current workers have been kept.' }
    $artifact = Join-Path $PSScriptRoot 'workers.vecta.gz'
    $manifest = Join-Path $PSScriptRoot 'manifest.json'
    $installer = Join-Path $PSScriptRoot 'install.mjs'
    Write-Host 'Checking the update. Your saved settings and sign-ins will be kept.'
    & node $installer stage $root $artifact $manifest
    if ($LASTEXITCODE -ne 0) { throw 'The update did not pass its checks. Your current workers have been kept.' }
    # A worker started from an old Downloads folder cannot observe the managed
    # stop file. Do not kill it or start a competing browser profile.
    function Get-OlderGSF {
        $managedId = 0
        $statusFile = Join-Path $root 'runtime\GSF.json'
        if (Test-Path -LiteralPath $statusFile) {
            $saved = Get-Content -Raw -LiteralPath $statusFile | ConvertFrom-Json
            if ($saved.pid) { $managedId = [int]$saved.pid }
        }
        $pattern = '(?i)(?:^|[\\/\s"''])(?:worker|start-paired|start-website-test|probe|check-live-services)\.mjs(?:[\s"'']|$)'
        return @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne $managedId -and $_.CommandLine -match $pattern })
    }
    while (@(Get-OlderGSF).Count -gt 0) {
        Write-Host ''
        Write-Host 'Close the old GSF black worker window. Leave Haynes and tyres alone.' -ForegroundColor Yellow
        Read-Host 'Then press Enter here to continue the update' | Out-Null
    }
    # Existing managed workers stop cooperatively after an in-flight lookup.
    Write-Host 'Waiting for any current lookups to finish...'
    $runtime = Join-Path $root 'runtime'
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    foreach ($name in @('Haynes','Tyres','GSF')) { Set-Content -LiteralPath (Join-Path $runtime ($name + '.stop')) -Value 'batch-update' -Encoding ASCII }
    $restart = $true
    $deadline = [DateTime]::UtcNow.AddSeconds(190)
    do {
        $running = $false
        foreach ($name in @('Haynes','Tyres','GSF')) {
            $file = Join-Path $runtime ($name + '.json')
            if (Test-Path -LiteralPath $file) {
                $status = Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
                if ($status.pid -and (Get-Process -Id ([int]$status.pid) -ErrorAction SilentlyContinue)) { $running = $true }
            }
        }
        if (!$running) { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'A lookup has not finished yet. The previous worker version is retained.' }
        Start-Sleep -Seconds 2
    } while ($true)
    & node $installer activate $root $artifact $manifest
    if ($LASTEXITCODE -ne 0) { throw 'The update was not activated. The previous worker version is retained.' }
    Start-Workers
    $restart = $false
    Write-Host ''
    Write-Host 'UPDATE INSTALLED. The 100-vehicle test will be requested automatically.'
    Write-Host 'CM14 KEL is first. Leave the PC and its Edge windows open.'
    Write-Host 'If GSF asks you to sign in, sign in as usual. Do not open another worker.'
} catch {
    Write-Host ''
    Write-Host ('UPDATE NOT COMPLETED: ' + $_.Exception.Message) -ForegroundColor Yellow
    if ($restart) { try { Start-Workers } catch { Write-Host 'Open Start VECTA Workers on your desktop to restart the saved version.' } }
    exit 1
} finally { $token = $null; $headers = $null }
