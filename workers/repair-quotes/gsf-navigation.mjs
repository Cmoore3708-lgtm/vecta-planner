import {inspectRepairCatalogue} from './catalogue-structure.mjs';
const ORIGIN='https://trade.gsfcarparts.com';
export const ALTERNATOR_CATEGORY_URL=ORIGIN+'/parts/Alternator';
const fail=()=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED'});};
async function unique(locator){await locator.waitFor({state:'visible',timeout:12000});if(await locator.count()!==1)fail();return locator;}
// Uses only registration/category controls observed in the PC capture.
// This is navigation calibration, not approval of compatibility or completeness.
export async function navigateGSFAlternator(page,registration){
 let stage='GSF_REGISTRATION';
 try{
  if(new URL(page.url()).origin!==ORIGIN)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
  if(!/^[A-Z0-9]{5,8}$/.test(registration))fail();
  await (await unique(page.getByPlaceholder('ENTER REG / VIN',{exact:true}))).fill(registration);
  await (await unique(page.getByRole('button',{name:'Search VRM Button',exact:true}))).click({timeout:10000});
  stage='GSF_SELECTED_VEHICLE';
  let selected=false;
  for(let i=0;i<60;i++){
   if(new URL(page.url()).origin!==ORIGIN)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
   const evidence=await page.evaluate(inspectRepairCatalogue,{registration});
   if(evidence.identities.length===1){selected=true;break;}
   await page.waitForTimeout(200);
  }
  if(!selected)fail();
  // Exact category route supplied by Chris from the signed-in GSF page.
  // Registration remains browser session state; never treat this URL as fitment.
  stage='GSF_ALTERNATOR_CATEGORY';
  await page.goto(ALTERNATOR_CATEGORY_URL,{waitUntil:'domcontentloaded',timeout:15000});
  if(new URL(page.url()).origin!==ORIGIN)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
  if(new URL(page.url()).pathname!=='/parts/Alternator')fail();
  stage='GSF_CATALOGUE_READY';
  let ready=false;for(let i=0;i<60;i++){const evidence=await page.evaluate(inspectRepairCatalogue,{registration});if(evidence.candidateCount>0&&evidence.identities.length===1){ready=true;break;}await page.waitForTimeout(200);}
  if(!ready)fail();
  return {status:'AUTOMATIC_CATEGORY_REACHED',fitmentConfirmed:false,catalogueComplete:false};
 }catch(error){error.stage=stage;throw error;}
}
