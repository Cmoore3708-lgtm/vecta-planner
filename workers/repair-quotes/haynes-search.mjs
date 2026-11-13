import {readHaynesRepairPage} from './haynes-page.mjs';
const origin='https://www.workshopdata.com';
const fail=detail=>{throw Object.assign(Error('LABOUR_REVIEW_REQUIRED'),{code:'LABOUR_REVIEW_REQUIRED',supplier:'Haynes',detail});};
export function haynesSearchUrl(current,typeId,query){
 const u=new URL(current);
 if(u.origin!==origin||u.username||u.password||u.pathname!=='/touch/site/layout/repairTimes'||u.searchParams.get('typeId')!==typeId||u.searchParams.get('groupId')!=='QUICKGUIDES')fail('VEHICLE_CHANGED');
 if(!query?.trim()||query.length>150)fail('INVALID_REPAIR_SEARCH');
 // This is the search destination observed on the workshop's repair page.
 // Preserve the independently verified vehicle; never hardcode a part/type.
 u.searchParams.set('searchedKey',query.trim());u.hash='';return u.href;
}
export async function searchHaynesRepair(page,typeId,query){
 const target=haynesSearchUrl(page.url(),typeId,query);
 if(new URL(page.url()).searchParams.get('searchedKey')===query.trim())return;
 let searches=[];
 for(let attempt=0;attempt<5;attempt++){
  haynesSearchUrl(page.url(),typeId,query);searches=[];let busy=false;
  for(const frame of page.frames()){
   if(!frame.url().startsWith(origin+'/'))continue;
   const frameType=new URL(frame.url()).searchParams.get('typeId');if(frameType&&frameType!==typeId)fail('VEHICLE_CHANGED');
   let state;try{state=await frame.evaluate(readHaynesRepairPage,{query});}catch(error){if(/Execution context was destroyed|Cannot find context|detached/i.test(error.message||'')){busy=true;continue;}throw error;}
   if(state.login)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'Haynes'});
   busy||=state.busy||state.readyState==='loading';
   searches.push(...state.searches.filter(s=>s.submitSelector).map(s=>({...s,frame})));
  }
  if(!busy&&searches.length)break;
  if(attempt<4)await page.waitForTimeout(200);
 }
 if(searches.length>1)fail('HAYNES_SEARCH_CONTROL_AMBIGUOUS');
 if(searches.length===1){
  const s=searches[0];await s.frame.locator(s.selector).fill(query.trim());await s.frame.locator(s.submitSelector).click({timeout:8000});
  for(let attempt=0;attempt<60;attempt++){
   haynesSearchUrl(page.url(),typeId,query);
   if(new URL(page.url()).searchParams.get('searchedKey')===query.trim())return;
   await page.waitForTimeout(200);
  }
  fail('HAYNES_SEARCH_NOT_APPLIED');
 }
 // The photographed search result exposes this GET route. It also supports
 // inaccessible/unlabelled controls without guessing a CSS ID or clicking notes.
 await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});
 haynesSearchUrl(page.url(),typeId,query);
 if(new URL(page.url()).searchParams.get('searchedKey')!==query.trim())fail('HAYNES_SEARCH_NOT_APPLIED');
}
