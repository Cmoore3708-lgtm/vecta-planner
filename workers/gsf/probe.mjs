// Read-only PC check: no relay configuration or website activation required.
import {chromium} from 'playwright';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import {readProductDialog} from './product-dialog.mjs';
import {SUPPLIER,readProductBySku} from './supplier.mjs';
const profile=process.env.GSF_PROFILE_DIR||resolve(process.env.LOCALAPPDATA||'.','VectaGSF','EdgeProfile');
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
const terminal=createInterface({input:process.stdin,output:process.stdout});
let stage='open_supplier';
try {
  const page=context.pages()[0]||await context.newPage();await page.goto(SUPPLIER);
  const manual=process.argv.includes('--manual');
  console.log(manual?'Sign in, search for a part, click it and leave its full product page or Part Details popup open.':'Sign into GSF in this Edge window if needed. The script will find the known UFI test filter automatically.');
  console.log('Nothing will be added to a basket or ordered.');
  await terminal.question(manual?'When Part Details is open, press Enter here: ':'Once signed in, press Enter here to run the automatic price check: ');
  stage='check_supplier';
  if(new URL(page.url()).origin!==SUPPLIER)throw Error('WRONG_SUPPLIER_PAGE');
  stage=manual?'read_product_details':'automatic_product_search';
  if(!manual)await readProductBySku(page,{kind:'oil_filter',sku:'23.265.00',searchTerm:'UFI23.265.00',brand:'UFI',
    description:'Oil Filter - Spin-on Filter',quantityMilli:1000,packQuantityMilli:1000});
  stage='read_product_details';
  const product=await page.evaluate(readProductDialog);
  const capture={source:'GSF rendered product details',checkedAt:new Date().toISOString(),product,
    fitmentVerified:false,note:'A product price check does not establish compatibility with any registration.'};
  writeFileSync('gsf-product-capture.local.json',JSON.stringify(capture,null,2)+'\n',{mode:0o600});
  console.log(product.brand+' '+product.sku+': £'+(product.unitNetPence/100).toFixed(2)+' excluding VAT.');
  console.log('Check passed. Saved the selected product fields to gsf-product-capture.local.json. No login data or page HTML was saved.');
} catch(error) {
  const reason=['LOGIN_REQUIRED','SETTINGS_REQUIRED','REVIEW_REQUIRED','UNAVAILABLE','PRODUCT_DETAILS_NOT_OPEN','WRONG_SUPPLIER_PAGE'].find(code=>new RegExp('(?:^|[:\\s])'+code+'$').test(error.message))||'CHECK_FAILED';
  writeFileSync('gsf-check-diagnostic.local.json',JSON.stringify({status:'FAILED',reason,stage,checkVersion:3,checkedAt:new Date().toISOString(),node:process.versions.node,platform:process.platform},null,2)+'\n',{mode:0o600});
  console.error('Check could not complete ('+reason+') at '+stage+'. Saved a diagnostic file with no login data.');
  if(reason==='PRODUCT_DETAILS_NOT_OPEN')console.error('Click the part and leave its full product page or Part Details popup open before pressing Enter.');
  process.exitCode=1;
} finally {terminal.close();await context.close().catch(()=>{});}

