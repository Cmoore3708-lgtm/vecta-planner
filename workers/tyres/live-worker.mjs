import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {createSessionRecovery,timeout} from './session-recovery.mjs';
import {SUPPLIER} from './browser.mjs';
import {ensureEnquiry} from './esp-enquiry.mjs';
import {testEspSearch} from './esp-search.mjs';
import {readEspSettings,requireEspSettings} from './esp-settings.mjs';
import {cleanTyreCatalogue} from '../../lib/tyre-relay-contract.js';
const endpoint='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/tyre-pc-relay';
const token=process.env.HAYNES_RELAY_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Run START-LIVE-TYRE-PRICES.cmd on the paired Haynes PC.');
async function rpc(body){const r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(r.status===401)throw Error('PAIRING_REQUIRED');if(!r.ok)throw Error('RELAY_UNAVAILABLE');return r.json()}
const profile=process.env.TYRE_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaTyres','EdgeProfile');
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false});
let stopped=false;context.on('close',()=>stopped=true);
const recovery=createSessionRecovery({supplier:SUPPLIER,username:process.env.ESP_USERNAME,password:process.env.ESP_PASSWORD});
let browserFailures=0,lastRecovery=0;
const report=error=>/LOGIN_REQUIRED/.test(error.message)?'LOGIN_REQUIRED':/SETTINGS_NOT_VERIFIED/.test(error.message)?'SETTINGS_REQUIRED':'UNAVAILABLE';
try{
 const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER,{timeout:20000});
 console.log('Automatic recovery active. Sign into ESP if requested; select Vecta, Sellout, VAT and multiplier 1. The worker resumes automatically, with no Enter key needed.');
 try{await recovery.ensure(page);await ensureEnquiry(page);}catch{console.log('Supplier needs attention. Waiting for login or connection recovery.');}
 let firstTask=await rpc({action:'pull'});if(!['JOB','IDLE'].includes(firstTask.status))throw Error('RELAY_NOT_READY');
 console.log('LIVE TYRE WORKER READY. Keep this window and Edge open. Website searches are read-only; no tyres will be ordered.');
 while(!stopped){
  let task;
  try{task=firstTask||await rpc({action:'pull'});firstTask=null}catch(e){if(e.message==='PAIRING_REQUIRED')throw e;console.log('Connection unavailable; retrying.');await new Promise(r=>setTimeout(r,5000));continue}
  if(task.status==='JOB'){
   let tab;
   try{
    tab=await context.newPage();
    const lookup=async()=>{await recovery.ensure(tab);await ensureEnquiry(tab);requireEspSettings(await tab.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString()));const found=await testEspSearch(tab,task.size,{trackRefresh:true});return cleanTyreCatalogue({size:found.requestedSize,checkedAt:new Date().toISOString(),catalogue:found.guideCatalogue,settings:found.settings},task.size)};
    const result=await timeout(lookup(),35000);
    const saved=await rpc({action:'complete',id:task.id,lease:task.lease,status:'MATCHED',result});if(saved.status!=='SAVED')throw Error('RESULT_NOT_SAVED');browserFailures=0;console.log('Guide updated: '+task.size);
   }catch(e){const status=report(e);if(status==='UNAVAILABLE')browserFailures++;else browserFailures=0;console.log('Guide unavailable: '+task.size+' ('+status+').');try{await rpc({action:'complete',id:task.id,lease:task.lease,status})}catch{console.log('Result could not be delivered.')}}
   finally{if(tab)await timeout(tab.close().catch(()=>{}),5000,'BROWSER_RESTART_REQUIRED');}
   if(browserFailures>=3)throw Error('BROWSER_RESTART_REQUIRED');
  }
  // Refresh the keeper tab periodically while idle so a saved session can recover.
  if(task.status!=='JOB'&&Date.now()-lastRecovery>60000){lastRecovery=Date.now();try{await recovery.ensure(page);await ensureEnquiry(page);}catch{ /* A real supplier login still needs valid saved credentials or a person. */ }}
  await new Promise(r=>setTimeout(r,2000));
 }
}finally{await context.close().catch(()=>{})}
