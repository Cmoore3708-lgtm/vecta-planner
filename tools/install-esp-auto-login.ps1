# Vecta ESP tyre worker hotfix for installed 20d5c2f8 release.
# Does not stop or alter GSF/Haynes. Restart Tyres from Vecta Connections after SUCCESS.
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'VectaWorkers\releases'
$release=Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -like '20d5c2f8*' } | Select-Object -First 1
if (!$release) { throw 'Expected VectaWorkers release 20d5c2f8 not found. Nothing changed.' }
$dir=Join-Path $release.FullName 'tyres'
$worker=Join-Path $dir 'live-worker.mjs'
$startup=Join-Path $dir 'startup.mjs'
$recovery=Join-Path $dir 'session-recovery.mjs'
if (!(Test-Path $worker) -or !(Test-Path $startup)) { throw 'Expected tyre worker files not found. Nothing changed.' }
$original=[IO.File]::ReadAllText($worker)
if ($original -notmatch "import \{prepareTyreStartup\} from './startup.mjs';" -or $original -notmatch "const runtime=createWorkerRuntime\('Tyres'\)") { throw 'Worker layout does not match the uploaded files. Nothing changed.' }
$source="https://raw.githubusercontent.com/Cmoore3708-lgtm/vecta-planner/11c6d0d98e9065ab9af17798d677b247fdb711ba/workers/tyres/session-recovery.mjs"
$temp=Join-Path $env:TEMP ('vecta-esp-recovery-'+[guid]::NewGuid().ToString('N')+'.mjs')
Invoke-WebRequest -Uri $source -OutFile $temp -UseBasicParsing -TimeoutSec 30
$recoveryCode=[IO.File]::ReadAllText($temp)
Remove-Item $temp -Force
if ($recoveryCode -notmatch 'createSessionRecovery' -or $recoveryCode -notmatch 'SUPPLIER_LOGIN_REQUIRED') { throw 'Recovery download failed validation. Nothing changed.' }
$updated=$original
function Replace-Once([string]$old,[string]$new) {
 if (!$script:updated.Contains($old)) { throw ('Expected code not found: '+$old.Substring(0,[Math]::Min(65,$old.Length))+'. Nothing changed.') }
 $script:updated=$script:updated.Replace($old,$new)
}
Replace-Once "import {prepareTyreStartup} from './startup.mjs';" "import {prepareTyreStartup} from './startup.mjs';`nimport {createSessionRecovery} from './session-recovery.mjs';"
Replace-Once "   await new Promise(r=>setTimeout(r,2000));" "   if(task.status!=='JOB'&&Date.now()-lastEspRecovery>60000){lastEspRecovery=Date.now();try{await recovery.ensure(page);await ensureEnquiry(page);}catch{ /* retry later without stopping relay */ }}`n   await new Promise(r=>setTimeout(r,2000));"
Replace-Once "const page=context.pages()[0]||await context.newPage();await openTyreSupplier(page, SUPPLIER);" "const page=context.pages()[0]||await context.newPage();await openTyreSupplier(page, SUPPLIER);`n try{await recovery.ensure(page,{keepLoginPage:true});await ensureEnquiry(page);}catch(e){console.log('ESP needs sign-in or enquiry settings: '+e.message);}"
Replace-Once "const lookup=async()=>{await tab.goto(SUPPLIER,{waitUntil:'domcontentloaded',timeout:10000});if(/\/Account\/LogOn/i.test(tab.url()))throw Error('SUPPLIER_LOGIN_REQUIRED');await ensureEnquiry(tab);" "const lookup=async()=>{await recovery.ensure(tab);await ensureEnquiry(tab);"
Replace-Once "let stopped=false;context.on('close',()=>stopped=true);" "let stopped=false;context.on('close',()=>stopped=true);`nlet lastEspRecovery=0;`nconst recovery=createSessionRecovery({supplier:SUPPLIER,username:process.env.ESP_USERNAME,password:process.env.ESP_PASSWORD});"
$node=(Get-Command node -ErrorAction SilentlyContinue)
if (!$node) { throw 'Node.js not found. Nothing changed.' }
$checkdir=Join-Path $env:TEMP ('vecta-esp-check-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkdir | Out-Null
try {
 $checkWorker=Join-Path $checkdir 'live-worker.mjs';$checkRecovery=Join-Path $checkdir 'session-recovery.mjs'
 [IO.File]::WriteAllText($checkWorker,$updated,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($checkRecovery,$recoveryCode,[Text.UTF8Encoding]::new($false))
 & node --check $checkWorker; if ($LASTEXITCODE -ne 0) { throw 'Worker syntax check failed. Nothing changed.' }
 & node --check $checkRecovery; if ($LASTEXITCODE -ne 0) { throw 'Recovery syntax check failed. Nothing changed.' }
} finally { Remove-Item $checkdir -Recurse -Force -ErrorAction SilentlyContinue }
$backup=Join-Path $dir ('backup-esp-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item $worker (Join-Path $backup 'live-worker.mjs') -ErrorAction Stop
Copy-Item $startup (Join-Path $backup 'startup.mjs') -ErrorAction Stop
if (Test-Path $recovery) { Copy-Item $recovery (Join-Path $backup 'session-recovery.mjs') }
try {
 [IO.File]::WriteAllText($recovery,$recoveryCode,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($worker,$updated,[Text.UTF8Encoding]::new($false))
} catch {
 Copy-Item (Join-Path $backup 'live-worker.mjs') $worker -Force
 if (!(Test-Path (Join-Path $backup 'session-recovery.mjs'))) { Remove-Item $recovery -Force -ErrorAction SilentlyContinue }
 throw
}
Write-Host ''
Write-Host 'SUCCESS: ESP auto-login patch installed in existing VectaWorkers tyre release.' -ForegroundColor Green
Write-Host ('Backup: '+$backup)
Write-Host 'GSF and Haynes files were not changed.'
Write-Host 'Now use VECTA Workshop Connections > Restart Tyres once.'
