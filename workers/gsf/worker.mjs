import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {lookupService,SUPPLIER} from './supplier.mjs';

const setup=process.argv.includes('--setup');
const token=process.env.GSF_WORKER_TOKEN;
const site=process.env.GSF_WORKSHOP_ORIGIN;
if(!setup && (!/^[a-f0-9]{64}$/.test(token||'') || !site))throw Error('Set GSF_WORKSHOP_ORIGIN and GSF_WORKER_TOKEN in the local PC environment.');
if(site && (!/^https:\/\/[a-z0-9.-]+$/.test(site) || !/(?:\.vercel\.app|\.vectamotors\.co\.uk)$/.test(new URL(site).hostname)))throw Error('Invalid workshop origin.');
const config=setup?null:JSON.parse(readFileSync(process.env.GSF_CONFIG_FILE||resolve('gsf-config.local.json'),'utf8'));
if(!setup && (config.calibrationApproved!==true || !config.selectedVehicleCss))throw Error('Complete the GSF catalogue calibration before starting the worker.');
const profile=process.env.GSF_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile');
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
let stopped=false;context.on('close',()=>stopped=true);
process.on('SIGINT',()=>{stopped=true;void context.close();});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function rpc(body) {
  const response=await fetch(site+'/api/gsf-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(response.status===401)throw Error('PAIRING_REQUIRED');
  if(!response.ok)throw Error('RELAY_UNAVAILABLE');
  return response.json();
}
try {
  if(setup) {
    const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER);
    console.log('Sign in to GSF in this Edge window. No password is read or stored by this script.');
    const terminal=createInterface({input:process.stdin,output:process.stdout});
    try {await terminal.question('Once signed in, press Enter to close and save the dedicated browser session: ');}finally{terminal.close();}
  } else {
    console.log('GSF service worker started. Catalogue reads only; no basket or ordering actions.');
    while(!stopped) {
      let task;
      try {task=await rpc({action:'pull'});}catch(error){if(error.message==='PAIRING_REQUIRED')throw error;console.log('Workshop connection unavailable; retrying.');await sleep(5000);continue;}
      if(task.status==='DISABLED') {console.log('GSF service pricing is disabled on this deployment.');await sleep(15000);continue;}
      if(task.status==='JOB') {
        let page,timer,completion;
        try {
          page=await context.newPage();
          const result=await Promise.race([lookupService(page,task.request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),60000);})]);
          completion={action:'complete',id:task.id,lease:task.lease,request:task.request,status:'MATCHED',result};
        } catch(error) {
          const status=['LOGIN_REQUIRED','SETTINGS_REQUIRED','REVIEW_REQUIRED'].includes(error.message)?error.message:'UNAVAILABLE';
          completion={action:'complete',id:task.id,lease:task.lease,request:task.request,status};
          console.log(status==='LOGIN_REQUIRED'?'GSF sign-in expired. Stop the worker and run SIGN-IN-GSF.cmd.':'Lookup ended: '+status);
        } finally {clearTimeout(timer);await page?.close().catch(()=>{});}
        for(let attempt=0;attempt<2;attempt++) {
          try {const saved=await rpc(completion);console.log(saved.status==='SAVED'?'Result delivered.':'Result expired or unavailable.');break;}
          catch {if(attempt===1)console.log('Result delivery failed; website will retain its guide price.');else await sleep(1000);}
        }
      }
      await sleep(2000);
    }
  }
} finally {await context.close().catch(()=>{});}
