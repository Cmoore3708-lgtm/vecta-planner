import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {SUPPLIER} from './browser.mjs';
import {ensureEnquiry} from './esp-enquiry.mjs';
import {testEspSearch} from './esp-search.mjs';
import {readEspSettings,requireEspSettings} from './esp-settings.mjs';
import {cleanTyreCatalogue} from '../../lib/tyre-relay-contract.js';
import {createSessionRecovery,isLoginPage} from './session-recovery.mjs';
const recoverSession=createSessionRecovery();
const endpoint='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/tyre-pc-relay';
const token=process.env.HAYNES_RELAY_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('Run START-LIVE-TYRE-PRICES.cmd on the paired Haynes PC.');
async function rpc(body){const r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(r.status===401)throw Error('PAIRING_REQUIRED');if(!r.ok)throw Error('RELAY_UNAVAILABLE');return r.json()}
const profile=process.env.TYRE_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaTyres','EdgeProfile');
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false});
let stopped=false;context.on('close',()=>stopped=true);
const terminal=createInterface({input:process.stdin,output:process.stdout});
try{
 const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER,{timeout:20000});
 console.log('Sign into ESP if needed. Open Enquiry, select Vecta, show Sellout and include VAT. Keep multiplier at 1. Leave the Addons setting as you normally use it.');
 const signedIn=await recoverSession(page).catch(()=>false);
 if(!signedIn) await terminal.question('Sign in manually, open Enquiry, then press Enter here to connect live website searches: ');
 await ensureEnquiry(page);
 if(new URL(page.url()).origin!==new URL(SUPPLIER).origin||/\/Account\/LogOn/i.test(page.url()))throw Error('SUPPLIER_LOGIN_REQUIRED');
 requireEspSettings(await page.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString()));
 let firstTask=await rpc({action:'pull'});if(!['JOB','IDLE'].includes(firstTask.status))throw Error('RELAY_NOT_READY');
 let lastSessionCheck=Date.now();
 console.log('LIVE TYRE WORKER READY. Keep this window and Edge open. Website searches are read-only; no tyres will be ordered.');
 while(!stopped){
  if(Date.now()-lastSessionCheck>=60000){
   lastSessionCheck=Date.now();
   try{await page.goto(SUPPLIER,{waitUntil:'domcontentloaded',timeout:10000});if(isLoginPage(page.url())){if(await recoverSession(page)){await ensureEnquiry(page);console.log('Supplier session restored.')}else console.log('Supplier sign-in needed; automatic recovery is unavailable or cooling down.');}}
   catch{console.log('Supplier session check unavailable; will retry later.');}
  }
  let task;
  try{task=firstTask||await rpc({action:'pull'});firstTask=null}catch(e){if(e.message==='PAIRING_REQUIRED')throw e;console.log('Connection unavailable; retrying.');await new Promise(r=>setTimeout(r,5000));continue}
  if(task.status==='JOB'){
   let tab,timer;
   try{
    tab=await context.newPage();
    const lookup=async()=>{await tab.goto(SUPPLIER,{waitUntil:'domcontentloaded',timeout:10000});if(!await recoverSession(tab))throw Error('SUPPLIER_LOGIN_REQUIRED');await ensureEnquiry(tab);requireEspSettings(await tab.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString()));const found=await testEspSearch(tab,task.size,{trackRefresh:true});return cleanTyreCatalogue({size:found.requestedSize,checkedAt:new Date().toISOString(),catalogue:found.guideCatalogue,settings:found.settings},task.size)};
    const result=await Promise.race([lookup(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),20000)})]);
    const saved=await rpc({action:'complete',id:task.id,lease:task.lease,status:'MATCHED',result});if(saved.status!=='SAVED')throw Error('RESULT_NOT_SAVED');console.log('Guide updated: '+task.size);
   }catch(e){const status=/LOGIN_REQUIRED/.test(e.message)?'LOGIN_REQUIRED':/SETTINGS_NOT_VERIFIED/.test(e.message)?'SETTINGS_REQUIRED':'UNAVAILABLE';console.log('Guide unavailable: '+task.size+' ('+status+').');try{await rpc({action:'complete',id:task.id,lease:task.lease,status})}catch{console.log('Result could not be delivered.')}}
   finally{clearTimeout(timer);await tab?.close().catch(()=>{})}
  }
  await new Promise(r=>setTimeout(r,2000));
 }
}finally{terminal.close();await context.close().catch(()=>{})}
