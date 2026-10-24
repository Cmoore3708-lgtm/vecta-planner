// Read-only PC check: no relay configuration or website activation required.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import {readProductDialog} from './product-dialog.mjs';
import {SUPPLIER} from './supplier.mjs';
const profile=process.env.GSF_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile');
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
const terminal=createInterface({input:process.stdin,output:process.stdout});
try {
  const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER);
  console.log('Sign into GSF if needed. Search for a part, click it, and leave its Part Details window open. Nothing will be added to a basket or ordered.');
  await terminal.question('When Part Details is open, press Enter here: ');
  if(new URL(page.url()).origin!==SUPPLIER)throw Error('Wrong supplier page.');
  const product=await page.evaluate(readProductDialog);
  const capture={source:'GSF rendered Part Details',checkedAt:new Date().toISOString(),product,
    fitmentVerified:false,note:'A product price check does not establish compatibility with any registration.'};
  writeFileSync('gsf-product-capture.local.json',JSON.stringify(capture,null,2)+'\n',{mode:0o600});
  console.log(product.brand+' '+product.sku+': £'+(product.unitNetPence/100).toFixed(2)+' excluding VAT.');
  console.log('Check passed. Saved the selected product fields to gsf-product-capture.local.json. No login data or page HTML was saved.');
} finally {terminal.close();await context.close().catch(()=>{});}
