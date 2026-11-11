// Diagnostic only: verify live Haynes search/time without GSF or a quote.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupGeneralHaynes} from './general-haynes.mjs';
import {promptInitialRepairRequest} from './checker-input.mjs';
import {repairRequest,repairScope} from '../../lib/repair-quote.js';
import {captureHaynesDiagnostics} from './haynes-page.mjs';
import {repairBrowserReason} from './browser-errors.mjs';
const terminal=createInterface({input:process.stdin,output:process.stdout}),here=path.dirname(fileURLToPath(import.meta.url));
let context,page;
try{
 console.log('VECTA — HAYNES ONLY — v13. GSF can keep running. This does not calculate or save a quote.');
 const input=await promptInitialRepairRequest(terminal);
 if(input){
  const request=repairRequest({registration:input.registration,work:input.work});
  const report={readOnly:true,labourOnly:true,checkerVersion:'2026-11-11-haynes-search-v13',request,startedAt:new Date().toISOString()};
  let timer;
  try{
   const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run on the workshop Windows PC.');
   context=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
   page=await context.newPage();
   for(let attempt=0;attempt<3;attempt++){
    try{
     const result=await Promise.race([lookupGeneralHaynes(page,request),new Promise((_,reject)=>{timer=setTimeout(()=>{void page.close().finally(()=>reject(Object.assign(Error('LOOKUP_TIMEOUT'),{code:'LOOKUP_TIMEOUT'})));},90000);})]);
     report.status='PASSED_LABOUR_ONLY';report.labour=result.labour;report.variant=result.variant;
     console.log(result.labour.operationLabel+' — '+(result.labour.hoursMilli/1000)+' hours from Haynes.');break;
    }catch(error){
     clearTimeout(timer);
     if(error.code==='LOGIN_REQUIRED'&&attempt<2){const answer=await terminal.question('Sign in to Haynes in its window, then press Enter (or Q to stop): ');if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_LOGIN';break;}continue;}
     throw error;
    }finally{clearTimeout(timer);}
   }
  }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||repairBrowserReason(error);report.detail=error.detail||'';console.log('Haynes stopped: '+(report.detail||report.reason));}
  if(page&&!page.isClosed()){
   try{report.haynes=await captureHaynesDiagnostics(page,repairScope.resolve(request.work).query);}catch{report.diagnosticCaptureUnavailable=true;}
  }
  const output=path.join(here,'haynes-search-result.local.json');
  writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(report.status+' — '+output);
  await terminal.question('Report saved. Press Enter to close this check: ');
 }
}finally{await context?.close();terminal.close();}
