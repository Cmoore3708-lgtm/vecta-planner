# Vecta GSF shared-worker login recovery patch for installed 20d5c2f8 release.
# Does not touch tyre/Haynes files or the repair-quote bridge.
$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA 'VectaWorkers\releases'
$candidates=@(Get-ChildItem -LiteralPath $root -Directory | Where-Object {$_.Name -like '20d5c2f8*'})
$matches=@(foreach($release in $candidates){$folder=Join-Path $release.FullName 'workers\gsf';if((Test-Path (Join-Path $folder 'worker.mjs')) -and (Test-Path (Join-Path $folder 'supplier.mjs'))){$folder}})
if($matches.Count -ne 1){throw 'Cannot uniquely locate installed shared GSF worker. Nothing changed.'}
$dir=$matches[0];$worker=Join-Path $dir 'worker.mjs';$helper=Join-Path $dir 'gsf-session-recovery.mjs'
$original=[IO.File]::ReadAllText($worker)
if($original -notmatch "createWorkerRuntime\('GSF'\)" -or $original -notmatch "createRepairBridge" -or $original -notmatch "lookupService\(page,task.request,config\)") {throw 'Installed worker differs from the uploaded files. Nothing changed.'}
if($original.Contains("createGsfRecovery")) {Write-Host 'GSF login patch already installed. No changes made.';return}
$source='https://raw.githubusercontent.com/Cmoore3708-lgtm/vecta-planner/95dab4bcc490fb5e01d35021c0f871ca8d4153e3/tools/gsf-session-recovery.mjs'
$temp=Join-Path $env:TEMP ('vecta-gsf-'+[guid]::NewGuid().ToString('N')+'.mjs')
Invoke-WebRequest -Uri $source -OutFile $temp -UseBasicParsing -TimeoutSec 30
$helperCode=[IO.File]::ReadAllText($temp);Remove-Item $temp -Force
if(!$helperCode.Contains('createGsfRecovery')){throw 'GSF helper download failed validation. Nothing changed.'}
$updated=$original
function Replace-Once([string]$old,[string]$new) {
 if(!$script:updated.Contains($old)){throw ('GSF worker code mismatch: '+$old.Substring(0,[Math]::Min(60,$old.Length))+'. Nothing changed.')}
 $script:updated=$script:updated.Replace($old,$new)
}
Replace-Once "import {lookupService,SUPPLIER} from './supplier.mjs';" "import {lookupService,SUPPLIER} from './supplier.mjs';`nimport {createGsfRecovery} from './gsf-session-recovery.mjs';"
Replace-Once "const runtime=createWorkerRuntime('GSF');" "const runtime=createWorkerRuntime('GSF');`nconst gsfRecovery=createGsfRecovery();"
Replace-Once "const result=await Promise.race([lookupService(page,task.request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),150000);})]);" "const lookup=async()=>{try{return await lookupService(page,task.request,config);}catch(e){if(e.message!=='LOGIN_REQUIRED')throw e;await gsfRecovery.ensure(page);return lookupService(page,task.request,config);}};`n           const result=await Promise.race([lookup(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),150000);})]);"
$node=Get-Command node -ErrorAction SilentlyContinue
if(!$node){throw 'Node.js unavailable. Nothing changed.'}
$checkDir=Join-Path $env:TEMP ('vecta-gsf-check-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkDir | Out-Null
try {
 $w=Join-Path $checkDir 'worker.mjs';$h=Join-Path $checkDir 'gsf-session-recovery.mjs'
 [IO.File]::WriteAllText($w,$updated,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($h,$helperCode,[Text.UTF8Encoding]::new($false))
 & node --check $w;if($LASTEXITCODE -ne 0){throw 'GSF worker syntax check failed. Nothing changed.'}
 & node --check $h;if($LASTEXITCODE -ne 0){throw 'GSF recovery syntax check failed. Nothing changed.'}
} finally {Remove-Item $checkDir -Recurse -Force -ErrorAction SilentlyContinue}
$backup=Join-Path $dir ('backup-gsf-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item $worker (Join-Path $backup 'worker.mjs') -ErrorAction Stop
if(Test-Path $helper){Copy-Item $helper (Join-Path $backup 'gsf-session-recovery.mjs')}
try {
 [IO.File]::WriteAllText($helper,$helperCode,[Text.UTF8Encoding]::new($false))
 [IO.File]::WriteAllText($worker,$updated,[Text.UTF8Encoding]::new($false))
} catch {
 Copy-Item (Join-Path $backup 'worker.mjs') $worker -Force
 if(!(Test-Path (Join-Path $backup 'gsf-session-recovery.mjs'))){Remove-Item $helper -Force -ErrorAction SilentlyContinue}
 throw
}
Write-Host ''
Write-Host 'SUCCESS: GSF browser sign-in recovery installed in existing shared worker.' -ForegroundColor Green
Write-Host ('Backup: '+$backup)
Write-Host 'Tyres and Haynes unchanged. Restart GSF ONLY in Workshop Connections.'
