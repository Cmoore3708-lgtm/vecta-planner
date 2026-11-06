import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {captureServices,captureRegistrations} from './service-capture.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {lookupService,SUPPLIER} from './supplier.mjs';

import {closeOwned,createQuoteDelivery,restartRequired} from './quote-delivery.mjs';
const runtime=process.env.VECTA_MANAGED_WORKERS==='1'
 ? (await import('../../lib/worker-runtime.js')).createWorkerRuntime('GSF')
 : {set(){},stopRequested(){return false;},close(){}};

const here=path.dirname(fileURLToPath(import.meta.url));
const setup=process.argv.includes('--setup');
const captureIndex=process.argv.indexOf('--service-check');
const serviceCheck=captureIndex!==-1;
const captureRegs=serviceCheck?captureRegistrations(process.argv.slice(captureIndex+1)):[];
const token=process.env.GSF_WORKER_TOKEN;
const site=process.env.GSF_WORKSHOP_ORIGIN;
const repairEnabled=!!(process.env.REPAIR_QUOTE_ORIGIN||process.env.REPAIR_QUOTE_WORKER_TOKEN);
const serviceEnabled=!!(site||token);
if(!setup && !serviceCheck && !repairEnabled && !serviceEnabled)throw Error('Configure service pricing or repair quotes first.');
if(!setup && !serviceCheck && serviceEnabled && (!/^[a-f0-9]{64}$/.test(token||'') || !site))throw Error('Set GSF_WORKSHOP_ORIGIN and GSF_WORKER_TOKEN in the local PC environment.');
if(site && (!/^https:\/\/[a-z0-9.-]+$/.test(site) || !/(?:\.vercel\.app|\.vectamotors\.co\.uk)$/.test(new URL(site).hostname)))throw Error('Invalid workshop origin.');
const config=setup||serviceCheck||!serviceEnabled?null:JSON.parse(readFileSync(process.env.GSF_CONFIG_FILE||resolve(here,'gsf-config.local.json'),'utf8'));
if(!setup && !serviceCheck && serviceEnabled && (config.calibrationApproved!==true || (!['approved-skus','vehicle-catalogue'].includes(config.lookupMode) && !config.selectedVehicleCss)))throw Error('Complete the GSF catalogue calibration before starting the worker.');
const profile=process.env.GSF_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile');
let context;
try{context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});}
catch(error){if(!serviceCheck)throw error;console.error('Cannot open the dedicated GSF browser. If the shared GSF worker is running, stop only that worker and try again. Leave tyre and Haynes workers running. No settings were changed.');process.exit(1);}
let repair=null;
const serviceDelivery=createQuoteDelivery(rpc);

let stopped=false,lastRepairState='';context.on('close',()=>stopped=true);
process.on('SIGINT',()=>{stopped=true;void context.close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(body) {
  const response=await fetch(site+'/api/gsf-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(process.env.GSF_PREVIEW_COOKIE?{Cookie:process.env.GSF_PREVIEW_COOKIE}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(response.status===401)throw Error('PAIRING_REQUIRED');
  if(!response.ok)throw Error('RELAY_UNAVAILABLE');
  return response.json();
}
try {
 if(!setup&&!serviceCheck&&repairEnabled){
  const {createRepairBridge}=await import('../repair-quotes/shared-bridge.mjs');
  repair=createRepairBridge({origin:process.env.REPAIR_QUOTE_ORIGIN,token:process.env.REPAIR_QUOTE_WORKER_TOKEN,gsfContext:context,
 configPath:process.env.REPAIR_QUOTE_CONFIG_FILE||path.resolve(here,'../repair-quotes/repair-config.local.json'),
 openHaynesContext:()=>chromium.launchPersistentContext(path.join(process.env.LOCALAPPDATA||path.resolve(here,'../repair-quotes/profile'),'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true}),log:console.log});
 }
  if(serviceCheck) {
    console.log('Read-only service check in the existing shared GSF profile. No prices are published, and nothing is ordered.');
    const report=await captureServices(context,captureRegs,{log:console.log});
    const output=path.join(here,'service-check-result.local.json');
    writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log('Service evidence saved to '+output+'. Unconfirmed items are marked for review.');
  } else if(setup) {
    const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER);
    console.log('Sign in to GSF in this Edge window. No password is read or stored by this script.');
    const terminal=createInterface({input:process.stdin,output:process.stdout});
    try {await terminal.question('Once signed in, press Enter to close and save the dedicated browser session: ');}finally{terminal.close();}
  } else {
    console.log('VECTA shared GSF worker started. Service and repair pricing use one supplier browser, with separate pricing policies. No basket or ordering actions.');
    while(!stopped&&!runtime.stopRequested()) {
      if(serviceDelivery.pending||serviceDelivery.retiring){
       try{await serviceDelivery.flush();}
       catch(error){
        if([restartRequired,'PAIRING_REQUIRED'].includes(error.message))throw error;
        runtime.set('reconnecting','RELAY_UNAVAILABLE');await sleep(2000);continue;
       }
      }
      if(repair){
       try{
        runtime.set('working');
        const state=await repair.tick();
        const attention=['LOGIN_REQUIRED','SETTINGS_REQUIRED','PAIRING_REQUIRED'].includes(state);
        runtime.set(attention?'attention':'connected',attention?state:state==='MATCHED'?'LOOKUP_CONFIRMED':'RELAY_ONLY');
        if(state!==lastRepairState&&['IDLE','MATCHED','DISABLED'].includes(state))console.log('Repair quote connection: '+state);
        lastRepairState=state;
       }catch(error){
        if(error.message===restartRequired)throw error;
        runtime.set('reconnecting','RELAY_UNAVAILABLE');lastRepairState='';
        console.log('Repair quote connection unavailable; retrying.');
        if(repair.retiring){await sleep(2000);continue;}
       }
      }
      if(runtime.stopRequested())break;
      if(!serviceEnabled){await sleep(2000);continue;}
      let task;
      try {task=await rpc({action:'pull'});}catch(error){runtime.set(error.message==='PAIRING_REQUIRED'?'attention':'reconnecting',error.message==='PAIRING_REQUIRED'?'PAIRING_REQUIRED':'RELAY_UNAVAILABLE');if(error.message==='PAIRING_REQUIRED')throw error;console.log('Workshop connection unavailable; retrying.');await sleep(5000);continue;}
      if(task.status==='DISABLED') {console.log('GSF service pricing is disabled on this deployment.');await sleep(repair?2000:15000);continue;}
      if(task.status==='JOB') {
        runtime.set('working');
        let page,timer,completion;
        try {
          page=await context.newPage();
          const result=await Promise.race([lookupService(page,task.request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),150000);})]);
          completion={action:'complete',id:task.id,lease:task.lease,request:task.request,status:'MATCHED',result};
        } catch(error) {
          const status=['LOGIN_REQUIRED','SETTINGS_REQUIRED','REVIEW_REQUIRED'].includes(error.message)?error.message:'UNAVAILABLE';
          completion={action:'complete',id:task.id,lease:task.lease,request:task.request,status};
          console.log(status==='LOGIN_REQUIRED'?'GSF sign-in expired. Stop the worker and run SIGN-IN-GSF.cmd.':'Lookup ended: '+status);
          runtime.set('attention',status);
        } finally {clearTimeout(timer);}
        try{
         const ack=await serviceDelivery.finish(completion,[page]);
         if(ack==='SAVED'&&completion.status==='MATCHED')runtime.set('connected','LOOKUP_CONFIRMED');
         console.log(ack==='SAVED'?'Result delivered.':'Result expired.');
        }catch(error){
         if([restartRequired,'PAIRING_REQUIRED'].includes(error.message))throw error;
         runtime.set('reconnecting','RELAY_UNAVAILABLE');console.log('Retrying the same service result.');
        }
      }
      await sleep(2000);
    }
  }
} finally {
 try{await Promise.all([repair?.close(),closeOwned([context])]);}
 finally{runtime.close();}
}

