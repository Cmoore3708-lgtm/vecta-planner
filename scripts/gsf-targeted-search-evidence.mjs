// Read-only targeted collector. Run only after the controller safely stops GSF.
// Uses the existing supplier profile; never reads pairing files or submits orders.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {captureServiceCategory,readServiceCategory} from '../workers/gsf/service-capture.mjs';
import {catalogueSelection} from '../workers/gsf/live-service.mjs';
import {diagnosticProduct} from '../workers/gsf/diagnostic-product.mjs';
import {cleanEvidence,safeCode} from '../lib/worker-tests.js';
const [release,output]=process.argv.slice(2);
if(!release||!output||!process.env.LOCALAPPDATA)throw Error('Installed release and output path required on workshop PC');
const profile=path.join(process.env.LOCALAPPDATA,'VectaGSF/EdgeProfile');
if(!existsSync(profile))throw Error('Existing supplier profile required');
const require=createRequire(path.join(path.resolve(release),'workers/gsf/package.json'));
const {chromium}=require('playwright');
const tasks=[['K600RJF','Oil Filter','oil_filter'],['M26JKM','Oil Filter','oil_filter'],['PO11YFC','Oil Filter','oil_filter'],['S11PTD','Fuel Filter','fuel_filter'],['LS10PET','Air Filter','air_filter']];
const results=[];
const save=()=>writeFileSync(output,JSON.stringify({purpose:'Read-only targeted search evidence; not a new cohort run or published quote',sourceRun:'3a2b7412-4a85-4593-aa36-dd46a03bbdbd',results},null,2));
const context=await chromium.launchPersistentContext(profile,{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
try{
 for(const [registration,category,kind] of tasks){
  const page=await context.newPage();let stage='CATEGORY_CAPTURE',capture,selected;
  try{
   capture=await captureServiceCategory(page,registration,category);
   stage='CATALOGUE_SELECTION';selected=catalogueSelection(capture,kind,registration);
   stage='PRODUCT_DETAILS';const product=await diagnosticProduct(page,selected);
   results.push({registration,category,status:'OBSERVED',evidence:cleanEvidence({stage,sku:product.sku,brand:product.brand,observedDescription:product.description})});
  }catch(error){
   const reason=safeCode(error.diagnosticReason,safeCode(error.message,error.name==='TimeoutError'?'LOOKUP_TIMEOUT':'CAPTURE_FAILED'));
   if(reason==='LOGIN_REQUIRED')throw Error('Supplier sign-in required');
   // Established extractor saves bounded visible main text and scrubs email/VIN.
   // It excludes inputs, cookies, navigation, scripts and browser secrets.
   const observed=await page.evaluate(readServiceCategory,{registration,category}).catch(()=>null);
   results.push({registration,category,status:'REVIEW',evidence:cleanEvidence({...error.evidence,stage:error.stage||stage,reason}),capture,observed});
  }finally{save();await page.close().catch(()=>{});}
 }
}finally{save();await context.close();}
