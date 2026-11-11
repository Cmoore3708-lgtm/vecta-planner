import {readAlternatorTime} from './repair-time-reader.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {choiceId,requireChoice} from './choice-result.mjs';
const origin='https://www.workshopdata.com';
const reject=detail=>{throw Object.assign(Error('LABOUR_REVIEW_REQUIRED'),{code:'LABOUR_REVIEW_REQUIRED',detail});};

// Only observed repair-tree headings can be expanded. Estimate/add/print and
// account/navigation controls are never offered or clicked.
export function readRepairMenus(doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return parts.join(' > ');};
 return [...doc.querySelectorAll('[aria-expanded],li > span,li > a,li > div > span,[role="treeitem"]')].filter(visible).filter(n=>!n.closest('nav,header,footer,form')).map(n=>({label:clean(n.innerText||n.textContent),selector:selector(n)})).filter(o=>o.label&&o.label.length<=100&&!/\b(?:renew|replace|remove|refit|add|estimate|print|order|basket|cart|checkout|buy|login|logout|sign|save|delete|back|home|help)\b|\d{2,}/i.test(o.label));
}
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
 const check=()=>{const u=new URL(page.url());if(u.origin!==origin||u.pathname!=='/touch/site/layout/repairTimes'||u.searchParams.get('typeId')!==vehicle.typeId)reject('VEHICLE_CHANGED');};
 const query=request.choices.labourSearch||selectedPart.description.split(/\s+[-–]\s+|\s*\(/)[0];
 const menus=async()=>{
  const found=[];for(const frame of page.frames())if(frame.url().startsWith(origin+'/'))for(const item of await frame.evaluate(readRepairMenus))found.push({...item,frame});
  return found;
 };
 const read=async()=>{
  const captures=[];for(const frame of page.frames()){
   if(!frame.url().startsWith(origin+'/'))continue;
   try{captures.push(...await frame.evaluate(readAlternatorTime,{operationPattern:'\\b(?:Renew|Replace|Remove\\s+and\\s+refit)\\b',allowMultiple:true}));}
   catch(error){if(/MULTIPLE_TIMES/.test(error.message||''))reject('AMBIGUOUS_TIME_ROW');}
  }
  return haynesLabourOptions(captures,request,query);
 };
 const searches=page.getByRole('textbox',{name:/search.*(?:repair|operation)|(?:repair|operation).*search/i});
 if(await searches.count()===1&&await searches.isVisible()){await searches.fill(query);await searches.press('Enter');await page.waitForTimeout(300);check();}
 // Reopen only the headings selected by the user, each re-discovered live.
 for(const label of request.choices.menus||[]){
  const matches=(await menus()).filter(m=>m.label===label);
  if(matches.length!==1)break;
  await matches[0].frame.locator(matches[0].selector).click({timeout:8000});await page.waitForTimeout(300);check();
 }
 let options=await read();
 // A single exact component heading is a safe read-only expansion. All other
 // terminology is offered to the user without an automatic substitution.
 if(!options.length){
  const exact=(await menus()).filter(m=>repairScope.matchesDescription(m.label,query));
  if(exact.length===1){await exact[0].frame.locator(exact[0].selector).click({timeout:8000});await page.waitForTimeout(300);check();options=await read();}
 }
 const chosen=options.find(o=>o.id===request.choices.labour);
 if(!chosen){
  if(options.length)requireChoice(request,'HAYNES_LABOUR',options.map(({capture,score,...o})=>o),{now,selectedPart});
  const terms=repairScope.words(query),available=await menus(),counts=new Map();
  for(const m of available)counts.set(m.label,(counts.get(m.label)||0)+1);
  const choices=available.filter(m=>counts.get(m.label)===1&&!(request.choices.menus||[]).includes(m.label)).sort((a,b)=>terms.filter(t=>repairScope.words(b.label).includes(t)).length-terms.filter(t=>repairScope.words(a.label).includes(t)).length).map(m=>({id:choiceId(m.label),label:m.label,detail:'Open this Haynes repair group'}));
  requireChoice(request,'HAYNES_MENU',choices,{now,selectedPart});
 }
 check();const c=chosen.capture,variant=[vehicle.make,vehicle.model,vehicle.variant,vehicle.engineCode].filter(Boolean).join(' ');
 return {variant,labour:{source:'HAYNES_PRO',registration:request.registration,variant,operation:request.operation,operationId:c.operationId,operationLabel:c.operationText,hoursMilli:c.hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:new Date(now()).toISOString(),choiceId:chosen.id}};
}
