// Read-only PC check of the general catalogue path. Never enqueues, publishes,
// saves a job, changes configuration, orders a part or installs a worker.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupGeneralRepair} from './general-repair.mjs';
import {repairScope,calculateRepairQuote,cleanRepairChoices} from '../../lib/repair-quote.js';
import {captureCatalogueDiagnostics} from './catalogue-diagnostics.mjs';
import {repairBrowserReason} from './browser-errors.mjs';
import {captureHaynesDiagnostics} from './haynes-page.mjs';
import {promptInitialRepairRequest,promptRepairChoice} from './checker-input.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout});
const checkerVersion='2026-11-12-supply-fit-actions-v15';
let gsf,haynes,gsfPage,haynesPage;
try{
 console.log('VECTA parts and fitting check — '+checkerVersion+'. For supply checks, stop GSF safely in Workshop Connections first.');
 console.log('This checks current GSF and Haynes screens. It does not save or send prices.');
 let request=await promptInitialRepairRequest(terminal);
 if(request){
 const report={readOnly:true,checkerVersion,request,startedAt:new Date().toISOString()};
 try{
  const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run this check on the workshop Windows PC.');
  report.steps=[];let loginRetries=0;
  for(let step=0;step<20;step++){
   let timer,timedOut=false;
   try{
    if(request.lookup!=='labour'&&!gsfPage){gsf=await chromium.launchPersistentContext(process.env.GSF_PROFILE_DIR||path.join(local,'VectaGSF','EdgeProfile'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});gsfPage=await gsf.newPage();}
    if(request.lookup!=='parts'&&!haynesPage){haynes=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});haynesPage=await haynes.newPage();}
    console.log(request.lookup==='labour'?'Searching Haynes for fitting time...':request.lookup==='parts'?'Searching GSF for the part...':request.choices.part?'Rechecking your GSF part, then finding its Haynes fitting operation...':'Selecting '+request.registration+' in GSF, then searching for the part...');
    const evidence=await Promise.race([lookupGeneralRepair({gsfPage,haynesPage},request),new Promise((_,reject)=>{timer=setTimeout(()=>{timedOut=true;void Promise.allSettled([gsfPage?.close(),haynesPage?.close()]).then(()=>reject(Error('LOOKUP_TIMEOUT')));},120000);})]);
    report.status='PASSED_READ_ONLY';report.quote=calculateRepairQuote(evidence,request);report.evidence=evidence;console.log((request.lookup==='labour'?'Fitting':request.lookup==='parts'?'Parts':'Parts and fitting')+': £'+(report.quote.totalIncVatPence/100).toFixed(2)+' including VAT. '+(report.quote.part?(report.quote.part.inStock?'In stock at last check.':'Out of stock — price available; confirm supply before booking.'):'No parts charge.'));break;
   }catch(error){
    // Close timed-out lookup pages before any manual inspection; an abandoned
    // lookup must not continue clicking while the mechanic reviews a failure.
    if(timedOut){await Promise.allSettled([gsfPage?.close(),haynesPage?.close()]);throw Object.assign(Error('LOOKUP_TIMEOUT'),{code:'LOOKUP_TIMEOUT'});}
    if(error.code==='LOGIN_REQUIRED'&&loginRetries<2){
     clearTimeout(timer);loginRetries++;
     const answer=await terminal.question('Sign in to '+(error.supplier||'the supplier')+' in its Edge window, then press Enter to retry (or Q to finish): ');
     if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_LOGIN';break;}
     continue;
    }
    if(error.code!=='CHOICE_REQUIRED')throw error;
    if(error.observed){report.diagnostics||=[];report.diagnostics.push(error.observed);}
    const result=cleanRepairChoices(error.result,request);report.steps.push(result);
    if(result.stage==='GSF_CATEGORY'&&!result.options.length){
     report.status='NEEDS_CHECK';report.reason='GSF_RESULTS_NEED_REVIEW';report.detail='The search ran, but no selectable category was captured. The report includes the visible search-result labels and controls.';
     console.log(report.detail);break;
    }
    console.log('\n'+result.stage.replaceAll('_',' '));
    if(result.selectedPart)console.log('GSF part: '+result.selectedPart.description+' '+result.selectedPart.sku+(result.selectedPart.inStock===false?' — Out of stock':result.selectedPart.inStock===true?' — In stock':''));
    result.options.forEach((o,i)=>console.log((i+1)+'. '+o.label+' — '+o.detail+(o.costPence?' — £'+(o.costPence/100).toFixed(2)+' each ex VAT':'')+(o.inStock===false?' — Out of stock':o.inStock===true?' — In stock':'')+(o.hoursMilli?' — '+o.hoursMilli/1000+' hours':'')));
    // End the lookup timer before waiting for the mechanic's choice.
    clearTimeout(timer);
    const next=await promptRepairChoice(terminal,request,result);
    if(!next){report.status='STOPPED_FOR_REVIEW';break;}
    request=next;
   }finally{clearTimeout(timer);}
  }
  report.status||='STOPPED_FOR_REVIEW';
 }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||repairBrowserReason(error);report.detail=error.detail||'';report.supplier=error.supplier||'';if(error.observed)report.observed=error.observed;console.log('The '+(report.supplier||'supplier')+' check stopped: '+(report.detail||report.reason)+'. Send the report back so this step can be checked.');}
 // Retain bounded page-state evidence for every unfinished run, including
 // failures after category discovery. Never store input values or page HTML.
 if(report.status!=='PASSED_READ_ONLY'&&gsfPage&&!gsfPage.isClosed()){
  try{
   report.lastGsfPage=await captureCatalogueDiagnostics(gsfPage,repairScope.resolve(request.work).query);
  }
  catch{report.diagnosticCaptureUnavailable=true;}
 }
 if(report.status!=='PASSED_READ_ONLY'&&haynesPage&&!haynesPage.isClosed()){
  try{report.lastHaynesPage=await captureHaynesDiagnostics(haynesPage,request.choices.labourSearch||repairScope.resolve(request.work).query);}catch{report.haynesDiagnosticCaptureUnavailable=true;}
 }
 report.lastRequest=request;
 const output=path.join(here,'catalogue-check-result.local.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const haynesReview=report.supplier?report.supplier==='Haynes':report.steps?.at(-1)?.stage?.startsWith('HAYNES_'),reviewPage=haynesReview?haynesPage:gsfPage;
 if(report.status==='NEEDS_CHECK'&&reviewPage&&!reviewPage.isClosed()){
  const supplier=haynesReview?'Haynes':'GSF';
  const answer=await terminal.question('The report is saved and '+supplier+' is staying open. '+(haynesReview?'If needed, open the repair group and fitting operation manually.':'If needed, select the vehicle and part manually as normal.')+' Press Enter to capture that screen and close, or Q to close without another capture: ');
  if(answer.trim().toUpperCase()!=='Q'){
   try{if(haynesReview)report.manualHaynesReview={diagnosticOnly:true,...await captureHaynesDiagnostics(reviewPage,request.choices.labourSearch||repairScope.resolve(request.work).query)};else report.manualPageReview={diagnosticOnly:true,...await captureCatalogueDiagnostics(reviewPage,repairScope.resolve(request.work).query)};}
   catch{report.manualReviewUnavailable=true;}
   writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
 }
 console.log(report.status+' — report saved beside this checker. Restart GSF in Workshop Connections if you stopped it.');
 }else console.log('Check cancelled. Restart GSF in Workshop Connections if you stopped it.');
}finally{await Promise.allSettled([gsf?.close(),haynes?.close()]);terminal.close();}
