import {readServiceCategory} from '../gsf/service-capture.mjs';
const ORIGIN='https://trade.gsfcarparts.com';
const failure=(detail,observed)=>Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',supplier:'GSF',detail,observed});
function check(page){const url=new URL(page.url());if(url.origin!==ORIGIN||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});}

// Catalogue discovery needs the requested vehicle context. This uses the same
// visible registration controls as the service reader, before searching parts.
// A recent-vehicle card or a filled input is not selected-vehicle evidence.
export async function selectCatalogueVehicle(page,registration,{attempts=75}={}){
 check(page);
 const field=page.getByPlaceholder('ENTER REG / VIN',{exact:true});
 try{await field.waitFor({state:'visible',timeout:12000});}catch{check(page);throw failure('VEHICLE_SEARCH_UNAVAILABLE',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});}
 check(page);
 if(await field.count()!==1)throw failure('VEHICLE_SEARCH_AMBIGUOUS',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});
 const clear=page.getByRole('button',{name:'Clear',exact:true});
 if(await clear.count()>1)throw failure('VEHICLE_SELECTION_AMBIGUOUS',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});
 if(await clear.count()===1&&await clear.isVisible())await clear.click({timeout:10000});
 check(page);await field.fill(registration,{timeout:10000});
 await page.getByRole('button',{name:'Search VRM Button',exact:true}).click({timeout:10000});
 let state;
 for(let i=0;i<attempts;i++){
  check(page);
  try{state=await page.evaluate(readServiceCategory,{registration,category:'Catalogue search'});}
  catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message||''))throw error;state=null;}
  if(state?.selectedRegistration===true&&state.registration===registration)return {registration,selectedRegistration:true};
  if(i+1<attempts)await page.waitForTimeout(200);
 }
 throw failure('VEHICLE_NOT_CONFIRMED_BEFORE_SEARCH',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false,reason:state?.reason||'SELECTION_NOT_READY'});
}
