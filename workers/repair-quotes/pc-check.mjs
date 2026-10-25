import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {readProductDialog} from './product-dialog.mjs';
import {readAlternatorTime,repairTimeDiagnostics} from './repair-time-reader.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout}),contexts=[];
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
async function open(name,url){const ctx=await chromium.launchPersistentContext(path.join(base,name),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(ctx);const page=ctx.pages()[0]||await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});return page;}
const haynesOnly=process.argv.includes('--haynes-only');
const output=path.join(here,'repair-pc-check.local.json');
let previous={};if(haynesOnly&&fs.existsSync(output)){try{previous=JSON.parse(fs.readFileSync(output,'utf8'));}catch{}}
const report={...(previous.registration==='FV65JTY'?previous:{}),checkedAt:new Date().toISOString(),registration:'FV65JTY',purpose:'PC calibration only; does not enable pricing',fitmentConfirmed:false};
try{
 if(!haynesOnly){
 const gsf=await open('GSF','https://trade.gsfcarparts.com');
 console.log('Sign in to GSF in the Edge window if requested. Nothing will be ordered.');
 await terminal.question('Press Enter when the GSF home page is ready: ');
 try{
  const search=gsf.getByRole('textbox',{name:"Search for OE (cross ref), aftermarket or categories like 'Air filter'",exact:true});
  await search.fill('DREA8828');await search.press('Enter');
  await gsf.getByRole('heading',{name:'Search Results for "DREA8828"',exact:true}).waitFor({state:'visible',timeout:15000});
  const sku=gsf.getByText('A8828',{exact:true});if(await sku.count()!==1)throw Error('REVIEW_REQUIRED');await sku.click();
  await gsf.getByRole('dialog',{name:'Part Details',exact:true}).getByRole('heading',{level:5}).waitFor({state:'visible',timeout:15000});
  const part=await gsf.evaluate(readProductDialog);if(part.sku!=='A8828'||part.brand!=='DriveTec'||!/Alternator - 150 Amp/i.test(part.description))throw Error('REVIEW_REQUIRED');
  report.gsf={status:'CAPTURED',searchTerm:'DREA8828',...part};console.log('GSF read: '+part.brand+' '+part.sku+' £'+(part.unitNetPence/100).toFixed(2)+' excluding VAT.');
 }catch{report.gsf={status:'NEEDS_CHECK'};console.log('Automatic GSF read needs checking. The diagnostic contains no passwords or page HTML.');}
 }
 const haynes=await open('Haynes','https://www.workshopdata.com/touch/site/layout/makesOverview');
 console.log('In the Haynes Edge window: sign in, select FV65 JTY, open Repair Times, then expand Alternator so Renew the alternator and its hours are visible.');
 await terminal.question('Press Enter when that repair-time row is visible: ');
 const captures=[],reasons=[],diagnostics=[];
 for(const frame of haynes.frames()){
  try{const url=new URL(frame.url());if(!/(^|\.)workshopdata\.com$/.test(url.hostname))continue;
   captures.push(await frame.evaluate(readAlternatorTime));
  }catch(error){reasons.push(String(error.message||'').match(/LABOUR_REVIEW_REQUIRED:([A-Z_]+)/)?.[1]||'FRAME_UNAVAILABLE');try{diagnostics.push(await frame.evaluate(repairTimeDiagnostics));}catch{}}
 }
 if(captures.length===1){report.haynes={status:'CAPTURED',...captures[0]};console.log('Haynes read: '+report.haynes.hoursText+' hours. Vehicle fitment still requires review.');}
 else{report.haynes={status:'NEEDS_CHECK',reason:captures.length?'MULTIPLE_FRAME_MATCHES':reasons[0]||'PAGE_NOT_READY',frameReasons:[...new Set(reasons)],diagnostics};console.log('Haynes check: '+report.haynes.reason+'. No time has been assumed.');}
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Saved repair-pc-check.local.json. Send that file back to Chris’s ChatGPT conversation. This check has not activated Workshop Pro pricing.');
 await terminal.question('Press Enter to close the test browser windows: ');
}finally{terminal.close();await Promise.allSettled(contexts.map(c=>c.close()));}
