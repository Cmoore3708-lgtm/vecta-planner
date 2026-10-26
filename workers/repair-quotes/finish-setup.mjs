import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {inspectRepairCatalogue} from './catalogue-structure.mjs';
import {navigateHaynesRepair} from './haynes-navigation.mjs';
import {readReviewedHaynesOperation} from './catalogue.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),contexts=[];
const terminal=createInterface({input:process.stdin,output:process.stdout});
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
const output=path.join(here,'repair-setup-result.local.json');
const report={version:'2026-10-26.1',checkedAt:new Date().toISOString(),registration:'FV65JTY',purpose:'Read-only setup check; does not enable pricing',fitmentConfirmed:false};
async function open(name,url){const ctx=await chromium.launchPersistentContext(path.join(base,name),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(ctx);const page=ctx.pages()[0]||await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});return page;}
const reason=error=>['LOGIN_REQUIRED','SETTINGS_REQUIRED','LABOUR_REVIEW_REQUIRED','REVIEW_REQUIRED'].includes(error.code||error.message)?error.code||error.message:/profile.*in use|ProcessSingleton/i.test(error.message||'')?'TEST_PROFILE_ALREADY_OPEN':error.name==='TimeoutError'?'PAGE_TIMEOUT':'PAGE_NOT_READY';
console.log('VECTA REPAIR QUOTE - FINISH SETUP - 2026-10-26.1');
console.log('This checks only. It does not place orders or activate live pricing.');
try{
 try{
  const page=await open('GSF','https://trade.gsfcarparts.com');
  console.log('GSF: sign in if asked. Enter FV65 JTY, select the vehicle, then Electrical > Rotating > Alternator. Leave the part choices and prices showing; close any Part Details popup.');
  await terminal.question('When the GSF alternator list is ready, press Enter here: ');
  if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com')throw Error('LOGIN_REQUIRED');
  const captured=await page.evaluate(inspectRepairCatalogue,{registration:report.registration});
  report.gsf={status:captured.candidateCount?'STRUCTURE_CAPTURED':'NEEDS_REVIEW',...captured};
  console.log('GSF: saved '+captured.candidateCount+' catalogue sections for review.');
 }catch(error){report.gsf={status:'NEEDS_REVIEW',reason:reason(error)};console.log('GSF: '+report.gsf.reason);}
 try{
  const page=await open('Haynes','https://www.workshopdata.com/touch/site/layout/makesOverview');
  console.log('Haynes: sign in if asked. This test will enter FV65 JTY and try to open Alternator automatically.');
  await terminal.question('When Haynes is signed in, press Enter here to test automatic navigation: ');
  const mapping={registration:report.registration,haynesTypeId:'t_317000375',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
  const vehicle=await navigateHaynesRepair(page,{registration:report.registration},mapping);
  const operation=await readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com');
  report.haynes={status:'AUTOMATIC_CAPTURED',...vehicle,...operation};
  console.log('Haynes: registration and vehicle type matched; captured '+operation.hoursMilli/1000+' hours automatically.');
 }catch(error){report.haynes={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'READ_OPERATION'};console.log('Haynes: '+report.haynes.reason+'. The result file records this; no labour time has been assumed.');}
}catch(error){report.error=reason(error);process.exitCode=1;}
finally{
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Saved: '+output);
 console.log('Send repair-setup-result.local.json to this ChatGPT conversation.');
 terminal.close();await Promise.allSettled(contexts.map(c=>c.close()));
}
