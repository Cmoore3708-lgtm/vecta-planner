import {readAlternatorTime} from './repair-time-reader.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {choiceId,requireChoice} from './choice-result.mjs';
import {searchHaynesRepair} from './haynes-search.mjs';
const origin='https://www.workshopdata.com';
const reject=detail=>{throw Object.assign(Error('LABOUR_REVIEW_REQUIRED'),{code:'LABOUR_REVIEW_REQUIRED',detail});};

import {readHaynesRepairPage} from './haynes-page.mjs';
export {readRepairMenus} from './haynes-page.mjs';

export function haynesLabourOptions(captures,request,query){
 const scope=repairScope.resolve(request.work),terms=repairScope.words(query),unique=new Map(),ids=new Map();
 for(const c of captures){
  if(!c.operationId||c.registrationVisible&&c.registrationVisible!==request.registration)reject('WRONG_VEHICLE_OPERATION');
  if(ids.has(c.operationId)&&ids.get(c.operationId)!==c.hoursMilli)reject('CONFLICTING_OPERATION_TIMES');ids.set(c.operationId,c.hoursMilli);
  if(scope.axle&&new RegExp('\\b'+(scope.axle==='front'?'rear':'front')+'\\b','i').test(c.operationText)||scope.side&&new RegExp('\\b'+(scope.side==='left'?'right':'left')+'\\b','i').test(c.operationText))continue;
  // Different multi-part quantities must be explicit in the supplier operation.
  if(request.quantity>1){
   const counted=new RegExp('\\b'+request.quantity+'\\s*(?:x|off)\\b','i').test(c.operationText);
   const pair=request.quantity===2&&(/\b(?:both|pair)\b/i.test(c.operationText)||scope.part==='brake discs'&&/\bdiscs\b/i.test(c.operationText));
   if(!counted&&!pair)continue;
  }
  const id=choiceId(request.registration,c.operationId,c.operationText,c.hoursMilli);
  unique.set(id,{id,label:c.operationText,detail:'Haynes operation '+c.operationId,hoursMilli:c.hoursMilli,capture:c,score:terms.filter(t=>repairScope.words(c.operationText).includes(t)).length});
 }
 return [...unique.values()].sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).slice(0,40);
}
export async function lookupHaynesChoices(page,request,{vehicle,selectedPart,now=Date.now}){
 if(!request.choices?.part||!selectedPart)reject('PART_SELECTION_REQUIRED');
 const query=request.choices.labourSearch||selectedPart.description.split(/\s+[-–]\s+|\s*\(/)[0];
 return lookupHaynesLabourChoices(page,request,{vehicle,selectedPart,query,choices:request.choices,now});
}
// Shared read-only labour selection. The pricing entry point above still
// requires a verified GSF selection; the standalone diagnostic never prices.
export async function lookupHaynesLabourChoices(page,request,{vehicle,query,choices={},selectedPart,now=Date.now}){
 const check=()=>{const u=new URL(page.url());if(u.origin!==origin||u.pathname!=='/touch/site/layout/repairTimes'||u.searchParams.get('typeId')!==vehicle.typeId)reject('VEHICLE_CHANGED');};
 await searchHaynesRepair(page,vehicle.typeId,query);
 // Navigation and tree expansion fetch content asynchronously. Read every
 // same-origin frame, waiting for stable nonempty content before offering it.
 const wait=async({changedFrom='',allowSearch=false,attempts=60}={})=>{
  let previous='',stable=0,lastReadReason='';
  for(let attempt=0;attempt<attempts;attempt++){
   check();const available=[],captures=[],searches=[];let busy=false;
   for(const frame of page.frames()){
    if(!frame.url().startsWith(origin+'/'))continue;
    const frameType=new URL(frame.url()).searchParams.get('typeId');if(frameType&&frameType!==vehicle.typeId)reject('VEHICLE_CHANGED');
    let state;try{state=await frame.evaluate(readHaynesRepairPage,{query});}
    catch(error){if(/Execution context was destroyed|Cannot find context|detached/i.test(error.message||'')){busy=true;continue;}throw error;}
    if(state.login)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'Haynes'});
    busy||=state.busy||state.readyState==='loading';
    available.push(...state.menus.map(m=>({...m,frame})));searches.push(...state.searches.map(s=>({...s,frame})));
    try{captures.push(...await frame.evaluate(readAlternatorTime,{operationPattern:'\\b(?:Renew|Replace|Remove\\s+and\\s+refit)\\b',allowMultiple:true}));}
    catch(error){
     const reason=(error.message||'').match(/LABOUR_REVIEW_REQUIRED:([A-Z_]+)/)?.[1];
     if(reason==='MULTIPLE_TIMES')reject('AMBIGUOUS_TIME_ROW');
     if(reason==='INVALID_TIME')reject('HAYNES_INVALID_TIME_ROW');
     if(['TIME_NOT_FOUND','HOURS_UNIT_NOT_CONFIRMED'].includes(reason)){lastReadReason=reason;busy=true;}
    }
   }
   check();const options=haynesLabourOptions(captures,request,query),signature=JSON.stringify([available.map(({frame,...m})=>m),options.map(o=>o.id)]),contentSignature=JSON.stringify([available.map(({label,selector})=>({label,selector})),options.map(o=>o.id)]);
   if(!busy&&(available.length||options.length||allowSearch&&searches.length)&&contentSignature!==changedFrom){stable=signature===previous?stable+1:1;if(stable>=3)return {available,options,searches,signature,contentSignature};}else stable=0;
   previous=signature;if(attempt+1<attempts)await page.waitForTimeout(200);
  }
  reject(lastReadReason?'HAYNES_'+lastReadReason:changedFrom?'HAYNES_REPAIR_GROUP_DID_NOT_OPEN':'HAYNES_REPAIR_TREE_NOT_READABLE');
 };
 let state=await wait();
 // Reopen only the headings selected by the user, re-discovered after each
 // expansion. An already-expanded heading must not be toggled closed.
 for(const label of choices.menus||[]){
  const matches=state.available.filter(m=>m.label===label);
  if(matches.length!==1)reject('HAYNES_REPAIR_GROUP_CHANGED');
  if(!matches[0].expanded){await matches[0].frame.locator(matches[0].selector).click({timeout:8000});state=await wait({changedFrom:state.contentSignature});}
 }
 if(!state.options.length){
  const exact=state.available.filter(m=>repairScope.matchesDescription(m.label,query));
  if(exact.length===1&&!exact[0].expanded){await exact[0].frame.locator(exact[0].selector).click({timeout:8000});state=await wait({changedFrom:state.contentSignature});}
 }
 const options=state.options;
 const chosen=options.find(o=>o.id===choices.labour);
 if(!chosen){
  if(options.length)requireChoice(request,'HAYNES_LABOUR',options.map(({capture,score,...o})=>o),{now,selectedPart});
  const terms=repairScope.words(query),available=state.available,counts=new Map();
  for(const m of available)counts.set(m.label,(counts.get(m.label)||0)+1);
  const menuChoices=available.filter(m=>counts.get(m.label)===1&&!(choices.menus||[]).includes(m.label)).sort((a,b)=>terms.filter(t=>repairScope.words(b.label).includes(t)).length-terms.filter(t=>repairScope.words(a.label).includes(t)).length).map(m=>({id:choiceId(m.label),label:m.label,detail:'Open this Haynes repair group'}));
  if(!menuChoices.length)reject('HAYNES_NO_SELECTABLE_REPAIR_GROUP');
  requireChoice(request,'HAYNES_MENU',menuChoices,{now,selectedPart});
 }
 check();const c=chosen.capture,variant=[vehicle.make,vehicle.model,vehicle.variant,vehicle.engineCode].filter(Boolean).join(' ');
 return {variant,labour:{source:'HAYNES_PRO',registration:request.registration,variant,operation:request.operation,operationId:c.operationId,operationLabel:c.operationText,hoursMilli:c.hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:new Date(now()).toISOString(),choiceId:chosen.id}};
}
