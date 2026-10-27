import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {pricingPolicy} from '../../lib/service-pricing.js';
import {lookupService,SUPPLIER} from './supplier.mjs';
import {comparisonVehicles,compareServices,comparisonMarkdown,comparisonCsv} from './comparison.mjs';

let context,terminal;
try {
  const policy=pricingPolicy(JSON.parse(readFileSync(new URL('./pricing-policy.example.json',import.meta.url),'utf8')));
  const vehicles=comparisonVehicles(JSON.parse(readFileSync('comparison-input.local.json','utf8')));
  const config=JSON.parse(readFileSync('gsf-config.local.json','utf8'));
  if(config.calibrationApproved!==true)throw Error('Approve the vehicle/filter/oil mappings before running live comparisons.');
  const profile=process.env.GSF_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile');
  context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  const login=context.pages()[0]||await context.newPage();await login.goto(SUPPLIER);
  terminal=createInterface({input:process.stdin,output:process.stdout});
  await terminal.question('Sign into GSF if needed, then press Enter to compare the ten cars (read-only): ');
  const rows=await compareServices(vehicles,policy,async request=>{
    let page,timer;
    console.log('Checking '+request.registration+' / '+request.service+'...');
    try {
      page=await context.newPage();
      return await Promise.race([lookupService(page,request,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('UNAVAILABLE')),60000);})]);
    } finally {clearTimeout(timer);await page?.close().catch(()=>{});}
  });
  writeFileSync('service-comparison.local.json',JSON.stringify({createdAt:new Date().toISOString(),policy,rows},null,2)+'\n',{mode:0o600});
  writeFileSync('service-comparison.local.md',comparisonMarkdown(rows,policy),{mode:0o600});
  writeFileSync('service-comparison.local.csv',comparisonCsv(rows),{mode:0o600});
  console.log('Saved the comparison as JSON, a readable table and CSV. Missing data is marked Needs verification, never priced as zero.');
} catch(error) {
  console.error(error.code==='ENOENT'?'Comparison setup is incomplete. The ten registrations and approved filter/oil mappings must be prepared first.':error.message);
  process.exitCode=1;
} finally {terminal?.close();await context?.close().catch(()=>{});}
