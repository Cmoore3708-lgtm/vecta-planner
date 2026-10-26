import {inspectRepairCatalogue} from './catalogue-structure.mjs';
const ORIGIN='https://trade.gsfcarparts.com';
export const ALTERNATOR_CATEGORY_URL=ORIGIN+'/parts/Alternator';
const fail=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail});};
async function unique(locator){await locator.waitFor({state:'visible',timeout:12000});if(await locator.count()!==1)fail('AMBIGUOUS_CONTROL');return locator;}
// Category first, then a fresh registration lookup. Never reload after selection:
// GSF retains the selected vehicle in browser state, not in the category URL.
export async function navigateGSFAlternator(page,registration,{log=()=>{}}={}){
 let stage='GSF_CATEGORY_BEFORE_VRM',registrationSubmitted=false;
 try{
  const checkOrigin=()=>{if(new URL(page.url()).origin!==ORIGIN)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});};
  checkOrigin();if(!/^[A-Z0-9]{5,8}$/.test(registration))fail('INVALID_REGISTRATION');
  log('GSF: opening the alternator category before entering the registration.');
  await page.goto(ALTERNATOR_CATEGORY_URL,{waitUntil:'domcontentloaded',timeout:15000});checkOrigin();
  if(new URL(page.url()).pathname!=='/parts/Alternator')fail('CATEGORY_REDIRECTED');
  stage='GSF_CLEAR_VEHICLE';
  const clear=page.getByRole('button',{name:'Clear',exact:true});
  if(await clear.count()>1)fail('AMBIGUOUS_CLEAR_CONTROL');
  if(await clear.count()===1&&await clear.isVisible()){
   log('GSF: clearing the previous selected vehicle.');await clear.click({timeout:10000});
   // Clear may return to the overview. This is still before the new VRM lookup.
   if(new URL(page.url()).pathname!=='/parts/Alternator')await page.goto(ALTERNATOR_CATEGORY_URL,{waitUntil:'domcontentloaded',timeout:15000});
   checkOrigin();
  }
  let cleared=false;
  for(let i=0;i<60;i++){const before=await page.evaluate(inspectRepairCatalogue,{registration});if(!before.identities.length){cleared=true;break;}await page.waitForTimeout(200);}
  if(!cleared)fail('PREVIOUS_SELECTION_NOT_CLEARED');
  stage='GSF_REGISTRATION';
  log('GSF: entering '+registration+' and submitting the registration search.');
  const field=await unique(page.getByPlaceholder('ENTER REG / VIN',{exact:true}));
  await field.fill(registration);
  if((await field.inputValue()).toUpperCase().replace(/\s/g,'')!==registration)fail('REGISTRATION_INPUT_MISMATCH');
  await (await unique(page.getByRole('button',{name:'Search VRM Button',exact:true}))).click({timeout:10000});registrationSubmitted=true;
  stage='GSF_FILTER_READY';log('GSF: waiting for the selected registration and alternator prices together.');
  let observed={selectedRegistration:false,pricedOptions:0,categoryPathMatched:false};
  for(let i=0;i<100;i++){
   checkOrigin();const evidence=await page.evaluate(inspectRepairCatalogue,{registration});
   observed={selectedRegistration:evidence.identities.length===1,pricedOptions:evidence.candidateCount,categoryPathMatched:new URL(page.url()).pathname==='/parts/Alternator'};
   if(observed.selectedRegistration&&observed.pricedOptions>0&&observed.categoryPathMatched)return {status:'AUTOMATIC_CATEGORY_REACHED',registrationSubmitted,observed,fitmentConfirmed:false,catalogueComplete:false};
   await page.waitForTimeout(200);
  }
  const error=Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail:'FILTERED_CATEGORY_NOT_CONFIRMED',observed});throw error;
 }catch(error){error.stage=stage;error.registrationSubmitted=registrationSubmitted;throw error;}
}
