import {readVehicle} from '../haynes/dom.mjs';
import {readRepairVehicle,repairTimesLink} from './haynes-navigation.mjs';
import {readAlternatorTime} from './repair-time-reader.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {lookupHaynesChoices} from './guided-haynes.mjs';
const reject=detail=>{throw Object.assign(Error('LABOUR_REVIEW_REQUIRED'),{code:'LABOUR_REVIEW_REQUIRED',detail});};
export function operationPattern(scope){
 if(scope.status!=='SUPPORTED')reject('UNKNOWN_OPERATION');
 // Position must be in the operation itself; a nearby menu title isn't enough.
 const positions=[scope.axle,scope.side].filter(Boolean).map(p=>'(?=[^\\n]*\\b'+p+'\\b)').join('');
 const opposite=scope.axle?(scope.axle==='front'?'rear':'front'):'';
 const side=scope.side?(scope.side==='left'?'right':'left'):'';
 return '\\b(?:Renew|Replace|Remove\\s+and\\s+refit)\\b'+positions+(opposite?'(?![^\\n]*\\b'+opposite+'\\b)':'')+(side?'(?![^\\n]*\\b'+side+'\\b)':'')+repairScope.pattern(scope.query)+'[^\\n]*?\\b'+repairScope.words(scope.query).at(-1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:s|es)?\\b';
}
export async function lookupGeneralHaynes(page,request,{now=Date.now,selectedPart}={}){
 const scope=repairScope.resolve(request.work),origin='https://www.workshopdata.com';
 await page.goto(origin+'/touch/site/layout/makesOverview',{waitUntil:'domcontentloaded',timeout:15000});
 const check=()=>{if(new URL(page.url()).origin!==origin)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});};check();
 let vehicle=await readRepairVehicle(page);if(vehicle.login)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
 const field=page.locator('#numberPlate,input[name="numberPlate"]'),submit=page.locator('#licencePlateBtn');
 if(await field.count()!==1||await submit.count()!==1)reject('REGISTRATION_CONTROL_AMBIGUOUS');
 await field.fill(request.registration);await submit.click({timeout:10000});
 for(let i=0;i<60;i++){vehicle=await readRepairVehicle(page);if(vehicle.login||vehicle.blocked||vehicle.ambiguous||vehicle.registration===request.registration)break;await page.waitForTimeout(200);}
 check();if(vehicle.login)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
 if(vehicle.blocked||vehicle.ambiguous||vehicle.registration!==request.registration||!/^t_\d+$/.test(vehicle.typeId||'')||!vehicle.make||!vehicle.model||!vehicle.variant)reject('VEHICLE_VARIANT_UNCONFIRMED');
 const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));
 await page.goto(repairTimesLink(links,vehicle.typeId),{waitUntil:'domcontentloaded',timeout:15000});check();
 if(new URL(page.url()).searchParams.get('typeId')!==vehicle.typeId)reject('VEHICLE_CHANGED');
 if(request.flow)return lookupHaynesChoices(page,request,{vehicle,selectedPart,now});
 const pattern=operationPattern(scope),captures=[];
 async function read(){
  captures.length=0;
  for(const frame of page.frames()){
   if(!frame.url().startsWith(origin+'/'))continue;
   try{captures.push(await frame.evaluate(readAlternatorTime,{operationPattern:pattern}));}
   catch(e){if(/MULTIPLE_TIMES|MULTIPLE_PRICED_OPERATIONS/.test(e.message||''))reject('AMBIGUOUS_REPLACEMENT_OPERATION');}
  }
 }
 await read();
 // Expand observed repair menu headings containing the requested part words.
 // Search and headings are taken from the live page, not a per-part setup file.
 const searches=page.getByRole('textbox',{name:/search.*(?:repair|operation)|(?:repair|operation).*search/i});
 if(!captures.length&&await searches.count()===1&&await searches.isVisible()){
  await searches.fill(scope.query);await searches.press('Enter');await page.waitForTimeout(300);await read();
 }
 const headings=await page.locator('a,button,[role="button"],h2,h3,h4').evaluateAll(nodes=>nodes.map(n=>(n.innerText||n.textContent||'').trim()).filter(t=>t&&t.length<100));
 const terms=repairScope.words(scope.query);
 const labels=[...new Set(headings)].filter(label=>{const tokens=repairScope.words(label);return terms.some(term=>tokens.includes(term))&&!/add|estimate|remove|renew|replace|basket|order/i.test(label);}).sort((a,b)=>repairScope.words(a).length-repairScope.words(b).length).slice(0,12);
 for(const label of labels){
  if(captures.length)break;
  const heading=page.getByText(label,{exact:true});
  if(await heading.count()===1&&await heading.isVisible()){await heading.click({timeout:8000});await page.waitForTimeout(300);await read();}
 }
 if(!captures.length)reject('EXACT_REPLACEMENT_TIME_NOT_FOUND');
 const unique=new Set(captures.map(c=>c.operationId+'|'+c.hoursMilli));
 if(request.quantity>1&&scope.part!=='brake discs'&&!captures.every(c=>new RegExp('\\b'+request.quantity+'\\b').test(c.operationText)))reject('LABOUR_QUANTITY_UNCONFIRMED');
 if(unique.size!==1||captures.some(c=>!c.operationId||c.registrationVisible&&c.registrationVisible!==request.registration))reject('CONFLICTING_REPLACEMENT_TIME');
 const capture=captures[0];
 const repairLabel=capture.operationText.replace(/\b[0-9][A-Z0-9]{9,23}\b/g,'').replace(/\b\d{1,2}[.,]\d{2}\b/g,'').replace(/\b(?:Renew|Replace|Remove\s+and\s+refit|the|front|rear|left|right)\b/gi,'').trim();
 if(!repairScope.matchesDescription(repairLabel,scope.query))reject('REPLACEMENT_SCOPE_MISMATCH');
 if(!scope.axle&&/\b(?:front|rear)\b/i.test(capture.operationText)||!scope.side&&/\b(?:left|right)\b/i.test(capture.operationText))reject('REPLACEMENT_POSITION_REQUIRED');
 const variant=[vehicle.make,vehicle.model,vehicle.variant,vehicle.engineCode].filter(Boolean).join(' ');
 return {variant,labour:{source:'HAYNES_PRO',registration:request.registration,variant,operation:request.operation,operationId:capture.operationId,operationLabel:capture.operationText,hoursMilli:capture.hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:new Date(now()).toISOString()}};
}
