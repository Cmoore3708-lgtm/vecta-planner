import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {lookupRepair,GSF_ORIGIN} from './catalogue.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const setup=process.argv.includes('--setup');
const origin=process.env.REPAIR_QUOTE_ORIGIN,token=process.env.REPAIR_QUOTE_WORKER_TOKEN;
if(!setup&&(!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/.test(origin||'')||!/^[a-f0-9]{64}$/.test(token||'')))throw Error('Configure the repair quote origin and private worker token first.');
const local=path.join(here,'repair-config.local.json');
let config=fs.existsSync(local)?JSON.parse(fs.readFileSync(local,'utf8')):{calibrationApproved:false};
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
const contexts=[];
async function pageFor(name){const context=await chromium.launchPersistentContext(path.join(base,name),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(context);return context.pages()[0]||await context.newPage();}
let stopping=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;Promise.allSettled(contexts.map(c=>c.close()));});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function rpc(body){const r=await fetch(origin+'/api/repair-quote-worker',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(r.status===401)throw Error('PAIRING_REQUIRED');if(!r.ok)throw Error('RELAY_UNAVAILABLE');return r.json();}
try{
 const gsfPage=await pageFor('GSF'),haynesPage=await pageFor('Haynes');
 if(setup){
  await gsfPage.goto(GSF_ORIGIN);await haynesPage.goto(config.haynes?.startUrl||'https://www.workshopdata.com');
  console.log('Sign in directly in both Edge windows. Passwords remain in the dedicated local browser profiles. This does not activate pricing.');
  const terminal=createInterface({input:process.stdin,output:process.stdout});try{await terminal.question('Press Enter after signing in to close setup.');}finally{terminal.close();}
 }else{
  console.log('VECTA repair quotes: 50% parts markup, £50/hour, excluding VAT. No orders are placed.');
  let completion=null;
  while(!stopping){
   try{
    if(completion){const saved=await rpc(completion);if(saved.status==='SAVED'||saved.status==='EXPIRED')completion=null;else throw Error('RELAY_UNAVAILABLE');}
    const job=await rpc({action:'pull'});
    if(job.status==='DISABLED'){console.log('Repair quotes are not enabled on this deployment.');break;}
    if(job.status==='JOB'){
     let status='MATCHED',result=null;
     try{config=JSON.parse(fs.readFileSync(local,'utf8'));result=await lookupRepair({gsfPage,haynesPage},job.request,config);}
     catch(e){status=['LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','OUT_OF_STOCK'].includes(e.code)?e.code:(e.code==='SETTINGS_REQUIRED'||e.code==='ENOENT')?'SETTINGS_REQUIRED':'UNAVAILABLE';console.log('Repair lookup: '+status);}
     completion={action:'complete',id:job.id,lease:job.lease,request:job.request,status,result};
     // Retain completion across network retries so a claimed job is not lost.
     const saved=await rpc(completion);if(saved.status==='SAVED'||saved.status==='EXPIRED')completion=null;
    }
   }catch(e){if(e.message==='PAIRING_REQUIRED'){console.log('Worker pairing needs updating.');break;}console.log('Repair connection unavailable; retrying.');}
   if(!stopping)await sleep(2500);
  }
 }
}finally{await Promise.allSettled(contexts.map(c=>c.close()));}
