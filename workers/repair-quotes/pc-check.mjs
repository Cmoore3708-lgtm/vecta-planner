import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {chromium} from 'playwright';
import {readProductDialog} from './product-dialog.mjs';
import {readAlternatorTime} from './repair-time-reader.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout}),contexts=[];
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA||here,'VectaRepairQuotes'):path.join(here,'profile');
async function open(name,url){const ctx=await chromium.launchPersistentContext(path.join(base,name),{headless:false,acceptDownloads:false,...(process.platform==='win32'?{channel:'msedge'}:{})});contexts.push(ctx);const page=ctx.pages()[0]||await ctx.newPage();await page.goto(url,{waitUntil:'domcontentloaded'});return page;}
const report={checkedAt:new Date().toISOString(),registration:'FV65JTY',purpose:'PC calibration only; does not enable pricing',fitmentConfirmed:false};
try{
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
 const haynes=await open('Haynes','https://www.workshopdata.com/touch/site/layout/makesOverview');
 console.log('In the Haynes Edge window: sign in, select FV65 JTY, open Repair Times, then expand Alternator so Renew the alternator and its hours are visible.');
 await terminal.question('Press Enter when that repair-time row is visible: ');
 try{report.haynes={status:'CAPTURED',...await haynes.evaluate(readAlternatorTime)};console.log('Haynes read: '+report.haynes.hoursText+' hours. Vehicle fitment still requires review.');}
 catch{report.haynes={status:'NEEDS_CHECK'};console.log('The Haynes row needs further calibration; no time has been assumed.');}
 const output=path.join(here,'repair-pc-check.local.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('Saved repair-pc-check.local.json. Send that file back to Chris’s ChatGPT conversation. This check has not activated Workshop Pro pricing.');
 await terminal.question('Press Enter to close the two test browser windows: ');
}finally{terminal.close();await Promise.allSettled(contexts.map(c=>c.close()));}
