import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {confirmExpandedGSF} from './gsf-live-reader.mjs';
import {repairBrowserReason} from './browser-errors.mjs';
import {repairTimeDiagnostics} from './repair-time-reader.mjs';
import {verifyRepairSelection} from '../gsf/verify-repair-selection.mjs';
import {repairLookupPreview} from './quote-preview.mjs';
import {analyseAlternatorOptions} from '../gsf/alternator-options.mjs';
import {navigateGSFAlternator} from './gsf-navigation.mjs';
import {expandGSFAlternatives} from './gsf-alternatives.mjs';
import {inspectRepairCatalogue} from './catalogue-structure.mjs';
import {navigateHaynesRepair} from './haynes-navigation.mjs';
import {readReviewedHaynesOperation,lookupRepair} from './catalogue.mjs';
import {calculateRepairQuote} from '../../lib/repair-quote.js';
let testGSFPage,testHaynesPage;
const here=path.dirname(fileURLToPath(import.meta.url)),contexts=[];
const terminal=createInterface({input:process.stdin,output:process.stdout});
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
const output=path.join(here,'repair-setup-result.local.json');
const report={version:'2026-10-26.12',checkedAt:new Date().toISOString(),registration:'FV65JTY',purpose:'Read-only setup check; does not enable pricing',fitmentConfirmed:false};
async function open(name,url){const ctx=await chromium.launchPersistentContext((name==='GSF'?path.join(process.env.LOCALAPPDATA||here,'VectaGSF','EdgeProfile'):path.join(base,name)),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(ctx);const page=ctx.pages()[0]||await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000});return page;}
const reason=repairBrowserReason;
const haynesOnly=process.argv.includes('--haynes-only'),gsfOnly=process.argv.includes('--gsf-only'),verifyBoth=process.argv.includes('--verify-quote');
console.log('VECTA REPAIR QUOTE - FINISH SETUP - 2026-10-26.12');
console.log('This checks only. It does not place orders or activate live pricing.');
try{
 if(!haynesOnly){
 try{
  const page=testGSFPage=await open('GSF','https://trade.gsfcarparts.com');
  let navigation;
  if(gsfOnly||verifyBoth){
   console.log('Sign in to GSF if asked. This check will then try FV65 JTY and the alternator category automatically.');
   await terminal.question('When GSF is signed in, press Enter here to start: ');
   try{navigation=await navigateGSFAlternator(page,report.registration,{log:console.log});console.log('GSF category navigation completed.');}
   catch(error){navigation={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'GSF_START',detail:error.detail||'',registrationSubmitted:error.registrationSubmitted===true,observed:error.observed||null};console.log('GSF stopped at '+navigation.stage+'. Select FV65 JTY and Electrical > Rotating > Alternator manually in this same window.');await terminal.question('When the alternator prices are showing, press Enter to capture them: ');}
  }else{
   console.log('GSF: sign in if asked. Enter FV65 JTY, select the vehicle, then Electrical > Rotating > Alternator. Leave the part choices and prices showing; close any Part Details popup.');
   await terminal.question('When the GSF alternator list is ready, press Enter here: ');
  }
  if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com')throw Error('LOGIN_REQUIRED');
  let captured;try{captured=await expandGSFAlternatives(page,report.registration);}catch(error){captured={...await page.evaluate(inspectRepairCatalogue,{registration:report.registration}),expansionReason:reason(error)};}
  report.gsf={status:captured.candidateCount?'STRUCTURE_CAPTURED':'NEEDS_REVIEW',navigation,...captured};
  if(captured.candidateCount){try{report.gsf.optionAnalysis=analyseAlternatorOptions(captured);}catch{report.gsf.optionAnalysis={status:'REVIEW_REQUIRED'};}}
  try{report.gsf.completeness={status:'CONFIRMED',...confirmExpandedGSF(captured,report.gsf.optionAnalysis,'DREA8828')};}catch(error){report.gsf.completeness={status:'NEEDS_REVIEW',reason:error.detail||reason(error)};}
  console.log('GSF: saved '+captured.candidateCount+' catalogue sections for review.');
  if(verifyBoth){
   console.log('GSF: verifying the selected alternator SKU, net price, stock and photo.');
   const reviewedPart={searchTerm:'DREA8828',searchUrl:'https://trade.gsfcarparts.com/enhancedSearch/DREA8828',sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp'};
   try{report.gsf.selectedPart={status:'VERIFIED',registration:report.registration,...await verifyRepairSelection(page,report.gsf.optionAnalysis,reviewedPart)};}catch(error){report.gsf.selectedPart={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'GSF_SKU_START'};}
  }
 }catch(error){report.gsf={status:'NEEDS_REVIEW',reason:reason(error)};console.log('GSF: '+report.gsf.reason);}
 }
 if(!gsfOnly&&(!verifyBoth||report.gsf?.selectedPart?.status==='VERIFIED')){
 let haynesPage;
 try{
  const page=testHaynesPage=haynesPage=await open('Haynes','https://www.workshopdata.com/touch/site/layout/makesOverview');
  console.log('Haynes: sign in if asked. This test will enter FV65 JTY and try to open Alternator automatically.');
  const needsLogin=new URL(page.url()).origin!=='https://www.workshopdata.com'||/login|sign-?in/i.test(new URL(page.url()).pathname)||await page.locator('input[type="password"]').count()>0;
  if(!verifyBoth||needsLogin)await terminal.question('When Haynes is signed in, press Enter here to test automatic navigation: ');
  const mapping={registration:report.registration,haynesTypeId:'t_317000375',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
  const vehicle=await navigateHaynesRepair(page,{registration:report.registration},mapping);
  const operation=await readReviewedHaynesOperation(page,mapping,'https://www.workshopdata.com');
  report.haynes={status:'AUTOMATIC_CAPTURED',...vehicle,...operation,checkedAt:new Date().toISOString()};
  console.log('Haynes: registration and vehicle type matched; captured '+operation.hoursMilli/1000+' hours automatically.');
 }catch(error){report.haynes={status:'NEEDS_REVIEW',reason:reason(error),stage:error.stage||'READ_OPERATION',captureReason:error.detail||''};if(haynesPage&&new URL(haynesPage.url()).origin==='https://www.workshopdata.com'){try{report.haynes.diagnostics=await haynesPage.evaluate(repairTimeDiagnostics);}catch{}}console.log('Haynes: '+report.haynes.reason+' at '+report.haynes.stage+'. The result file records this; no labour time has been assumed.');}
 }
}catch(error){report.error=reason(error);process.exitCode=1;}
finally{
 if(verifyBoth&&report.gsf?.navigation?.status==='AUTOMATIC_CATEGORY_REACHED'&&report.gsf?.selectedPart?.status==='VERIFIED'&&report.haynes?.status==='AUTOMATIC_CAPTURED'){try{report.quotePreview=repairLookupPreview(report.gsf.selectedPart,report.haynes);console.log('Read-only calculation: £'+(report.quotePreview.totalIncVatPence/100).toFixed(2)+' including VAT. Automatic quoting remains disabled pending review.');}catch{report.quotePreview={status:'REVIEW_REQUIRED'};}}
 if(verifyBoth&&report.gsf?.completeness?.status==='CONFIRMED'&&report.gsf?.navigation?.status==='AUTOMATIC_CATEGORY_REACHED'&&report.haynes?.status==='AUTOMATIC_CAPTURED'){
  console.log('Checking the actual worker lookup and quote calculation. This is read-only and does not save settings or enable live prices.');
  const variant='Honda CR-V 1.6 i-DTEC (N16A4) 2015–2017';
  const mapping={registration:report.registration,approved:true,reviewedAt:new Date().toISOString(),variant,fitmentEvidence:'GSF registration-filtered alternator group DREA8828; matching Haynes type t_317000375',gsfIdentity:report.gsf.identities[0].text,gsfPart:{searchTerm:'DREA8828',searchUrl:'https://trade.gsfcarparts.com/enhancedSearch/DREA8828',sku:'A8828',brand:'DriveTec',description:'Alternator - 150 Amp'},haynesIdentity:variant,haynesTypeId:'t_317000375',haynesOperationId:'1E02944501WV0',haynesOperationLabel:'Renew the alternator'};
  const config={calibrationApproved:true,vehicles:[mapping],gsf:{readerMode:'verified-alternator-options',completionMode:'single-expanded-group'},haynes:{startUrl:'https://www.workshopdata.com',navigationMode:'workshopdata-registration'}};
  try{const request={registration:report.registration,work:'Supply and fit alternator'},evidence=await lookupRepair({gsfPage:testGSFPage,haynesPage:testHaynesPage},request,config);report.liveQuoteValidation={status:'PASSED_READ_ONLY',quote:calculateRepairQuote(evidence,request)};console.log('Actual worker lookup and quote validation passed. Live pricing remains disabled.');}
  catch(error){report.liveQuoteValidation={status:'NEEDS_REVIEW',reason:reason(error),detail:error.detail||'',identityCheck:error.identityCheck||null};console.log('Actual worker lookup needs review: '+report.liveQuoteValidation.reason+' '+report.liveQuoteValidation.detail);}
 }
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Saved: '+output);
 console.log('Send repair-setup-result.local.json to this ChatGPT conversation.');
 await terminal.question('Result saved. Press Enter when ready to close this test browser: ').catch(()=>{});
 terminal.close();await Promise.allSettled(contexts.map(c=>c.close()));
}
