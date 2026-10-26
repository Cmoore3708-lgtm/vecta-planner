import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {repairBrowserReason} from './browser-errors.mjs';
import {repairTimeDiagnostics} from './repair-time-reader.mjs';
import {analyseAlternatorOptions} from '../gsf/alternator-options.mjs';
import {navigateGSFAlternator} from './gsf-navigation.mjs';
import {expandGSFAlternatives} from './gsf-alternatives.mjs';
import {inspectRepairCatalogue} from './catalogue-structure.mjs';
import {navigateHaynesRepair} from './haynes-navigation.mjs';
import {readReviewedHaynesOperation} from './catalogue.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),contexts=[];
const terminal=createInterface({input:process.stdin,output:process.stdout});
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
const output=path.join(here,'repair-setup-result.local.json');
const report={version:'2026-10-26.7',checkedAt:new Date().toISOString(),registration:'FV65JTY',purpose:'Read-only setup check; does not enable pricing',fitmentConfirmed:false};
async function open(name,url){const ctx=await chromium.launchPersistentContext((name==='GSF'?path.join(process.env.LOCALAPPDATA||here,'VectaGSF','EdgeProfile'):path.join(base,name)),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(ctx);const page=ctx.pages()[0]||await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});return page;}
const reason=repairBrowserReason;
const haynesOnly=process.argv.includes('--haynes-only'),gsfOnly=process.argv.includes('--gsf-only');
console.log('VECTA REPAIR QUOTE - FINISH SETUP - 2026-10-26.7');
console.log('This checks only. It does not place orders or activate live pricing.');
try{
 if(!haynesOnly){
 try{
  const page=await open('GSF','https://trade.gsfcarparts.com');
  let navigation;
  if(gsfOnly){
   console.log('Sign in to GSF if asked. This check will then try FV65 JTY and the alternator category automatically.');
   await terminal.question('When GSF is signed in, press Enter here to start: ');
   try{navigation=await navigateGSFAlternator(page,report.registration);console.log('GSF category navigation completed.');}
   catch(error){navigation={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'GSF_START'};console.log('GSF stopped at '+navigation.stage+'. Select FV65 JTY and Electrical > Rotating > Alternator manually in this same window.');await terminal.question('When the alternator prices are showing, press Enter to capture them: ');}
  }else{
   console.log('GSF: sign in if asked. Enter FV65 JTY, select the vehicle, then Electrical > Rotating > Alternator. Leave the part choices and prices showing; close any Part Details popup.');
   await terminal.question('When the GSF alternator list is ready, press Enter here: ');
  }
  if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com')throw Error('LOGIN_REQUIRED');
  let captured;try{captured=await expandGSFAlternatives(page,report.registration);}catch(error){captured={...await page.evaluate(inspectRepairCatalogue,{registration:report.registration}),expansionReason:reason(error)};}
  report.gsf={status:captured.candidateCount?'STRUCTURE_CAPTURED':'NEEDS_REVIEW',navigation,...captured};
  if(captured.candidateCount){try{report.gsf.optionAnalysis=analyseAlternatorOptions(captured);}catch{report.gsf.optionAnalysis={status:'REVIEW_REQUIRED'};}}
  console.log('GSF: saved '+captured.candidateCount+' catalogue sections for review.');
 }catch(error){report.gsf={status:'NEEDS_REVIEW',reason:reason(error)};console.log('GSF: '+report.gsf.reason);}
 }
 if(!gsfOnly){
 let haynesPage;
 try{
  const page=haynesPage=await open('Haynes','https://www.workshopdata.com/touch/site/layout/makesOverview');
  console.log('Haynes: sign in if asked. This test will enter FV65 JTY and try to open Alternator automatically.');
  await terminal.question('When Haynes is signed in, press Enter here to test automatic navigation: ');
  const mapping={registration:report.registration,haynesTypeId:'t_317000375',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
  const vehicle=await navigateHaynesRepair(page,{registration:report.registration},mapping);
  const operation=await readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com');
  report.haynes={status:'AUTOMATIC_CAPTURED',...vehicle,...operation};
  console.log('Haynes: registration and vehicle type matched; captured '+operation.hoursMilli/1000+' hours automatically.');
 }catch(error){report.haynes={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'READ_OPERATION',captureReason:error.detail||''};if(haynesPage&&new URL(haynesPage.url()).origin==='https://www.workshopdata.com'){try{report.haynes.diagnostics=await haynesPage.evaluate(repairTimeDiagnostics);}catch{}}console.log('Haynes: '+report.haynes.reason+' at '+report.haynes.stage+'. The result file records this; no labour time has been assumed.');}
 }
}catch(error){report.error=reason(error);process.exitCode=1;}
finally{
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Saved: '+output);
 console.log('Send repair-setup-result.local.json to this ChatGPT conversation.');
 await terminal.question('Result saved. Press Enter when ready to close this test browser: ').catch(()=>{});
 terminal.close();await Promise.allSettled(contexts.map(c=>c.close()));
}
