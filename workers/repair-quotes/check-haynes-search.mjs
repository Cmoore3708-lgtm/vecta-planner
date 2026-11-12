// Diagnostic only: verify live Haynes search/time without GSF or a quote.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHaynesLabourCheck} from './haynes-labour-check.mjs';
import {promptInitialRepairRequest,promptHaynesLabourChoice} from './checker-input.mjs';
import {repairRequest,repairScope} from '../../lib/repair-quote.js';
import {captureHaynesDiagnostics} from './haynes-page.mjs';
import {repairBrowserReason} from './browser-errors.mjs';
const terminal=createInterface({input:process.stdin,output:process.stdout}),here=path.dirname(fileURLToPath(import.meta.url));
let context,page;
try{
 console.log('VECTA — HAYNES ONLY — v17. GSF can keep running. Choose the correct fitting operation; this does not calculate or save a quote.');
 const input=await promptInitialRepairRequest(terminal);
 if(input){
  const request=repairRequest({registration:input.registration,work:input.work});
  const report={readOnly:true,labourOnly:true,checkerVersion:'2026-11-12-product-results-first-v17',request,startedAt:new Date().toISOString(),steps:[]};
  const output=path.join(here,'haynes-search-result.local.json');
  const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  let timer;
  try{
   const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run on the workshop Windows PC.');
   context=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
   page=await context.newPage();
   let session,choices={},loginRetries=0;
   for(let attempt=0;attempt<20;attempt++){
    try{
     const result=await Promise.race([(async()=>{session||=await createHaynesLabourCheck(page,request);return session(choices);})(),new Promise((_,reject)=>{timer=setTimeout(()=>{void Promise.allSettled([page.close()]).then(()=>reject(Object.assign(Error('LOOKUP_TIMEOUT'),{code:'LOOKUP_TIMEOUT'})));},90000);})]);
     report.status='PASSED_LABOUR_ONLY';report.labour=result.labour;report.variant=result.variant;
     console.log(result.labour.operationLabel+' — '+(result.labour.hoursMilli/1000)+' hours from Haynes.');break;
    }catch(error){
     clearTimeout(timer);
     if(error.code==='LOGIN_REQUIRED'&&loginRetries++<2){session=undefined;choices={};const answer=await terminal.question('Sign in to Haynes in its window, then press Enter (or Q to stop): ');if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_LOGIN';break;}continue;}
     if(error.code==='CHOICE_REQUIRED'){
      const result=error.result;report.steps.push(result);report.status='AWAITING_LABOUR_CHOICE';save();
      console.log('\nChoose the correct Haynes fitting operation or repair group:');
      result.options.forEach((o,i)=>console.log((i+1)+'. '+o.label+(o.hoursMilli?' — '+(o.hoursMilli/1000)+' hours':'')));
      const next=await promptHaynesLabourChoice(terminal,choices,result);
      if(!next){report.status='STOPPED_FOR_REVIEW';break;}
      choices=next;report.lastChoices=choices;continue;
     }
     throw error;
    }finally{clearTimeout(timer);}
   }
   if(report.status==='AWAITING_LABOUR_CHOICE'||!report.status)report.status='STOPPED_FOR_REVIEW';
  }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||repairBrowserReason(error);report.detail=error.detail||'';console.log('Haynes stopped: '+(report.detail||report.reason));}
  if(page&&!page.isClosed()){
   try{report.haynes=await captureHaynesDiagnostics(page,report.lastChoices?.labourSearch||repairScope.resolve(request.work).query);}catch{report.diagnosticCaptureUnavailable=true;}
  }
  save();
  console.log(report.status+' — '+output);
  await terminal.question('Report saved. Press Enter to close this check: ');
 }
}finally{await context?.close();terminal.close();}
