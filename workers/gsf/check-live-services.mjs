import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {lookupLiveService} from './live-service.mjs';
import {calculateServicePrice,serviceRequiredKinds,COMPARISON_SERVICES} from '../../lib/service-pricing.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const policy=JSON.parse(readFileSync(path.join(here,'pricing-policy.example.json'),'utf8'));
const registrations=['NU67VSE','FV65JTY'];
const report={checkedAt:new Date().toISOString(),source:'live-gsf-pc-read',websiteUpdated:false,rows:[]};
let context;
try{
 context=await chromium.launchPersistentContext(path.resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
 for(const registration of registrations){
  const page=await context.newPage();
  try{
   console.log('Checking real GSF parts for '+registration+'...');
   const request={registration,service:'Major Service',mileage:null,range:'Mid Range'};
   const costs=await lookupLiveService(page,request);
   const prices=COMPARISON_SERVICES.map(service=>{
    const requiredKinds=serviceRequiredKinds(service,costs.fuelType);
    const selected={...costs,request:{...request,service},requiredKinds,items:costs.items.filter(item=>requiredKinds.includes(item.kind))};
    const price=calculateServicePrice(selected,selected.request,policy);
    console.log(registration+' | '+service+' | GBP '+(price.totalPence/100).toFixed(2)+' including VAT');
    return {service,totalPence:price.totalPence};
   });
   report.rows.push({registration,status:'MATCHED',costs,prices});
  }catch(error){
   const status=['LOGIN_REQUIRED','REVIEW_REQUIRED','SETTINGS_REQUIRED'].includes(error.message)?error.message:'UNAVAILABLE';
   report.rows.push({registration,status});console.log(registration+': '+status+' — no price generated.');
   if(status==='LOGIN_REQUIRED')break;
  }finally{await page.close().catch(()=>{});}
 }
}catch{
 console.error('Cannot open the shared GSF browser. Stop only the GSF worker and retry. Leave tyre and Haynes workers running.');
 process.exitCode=1;
}finally{
 await context?.close().catch(()=>{});
 writeFileSync(path.join(here,'live-service-test-result.local.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Read-only test finished. Website prices were not changed.');
}
