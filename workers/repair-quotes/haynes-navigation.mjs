import {readVehicle} from '../haynes/dom.mjs';
const START='https://www.workshopdata.com/touch/site/layout/makesOverview';
const ORIGIN=new URL(START).origin;
const fail=code=>{throw Object.assign(Error(code),{code});};
export function verifyRepairVehicle(vehicle,request,mapping){
 if(vehicle.login)fail('LOGIN_REQUIRED');
 if(vehicle.blocked||vehicle.ambiguous)fail('LABOUR_REVIEW_REQUIRED');
 if(vehicle.registration!==request.registration||!/^t_\d+$/.test(vehicle.typeId||'')||vehicle.typeId!==mapping.haynesTypeId)fail('LABOUR_REVIEW_REQUIRED');
 if(!vehicle.make||!vehicle.model||!vehicle.variant)fail('LABOUR_REVIEW_REQUIRED');
 return vehicle.typeId;
}
export function repairTimesLink(links,typeId){
 const matches=[...new Set(links)].filter(value=>{
  try{const url=new URL(value);return url.origin===ORIGIN&&!url.username&&!url.password&&!url.hash&&url.pathname==='/touch/site/layout/repairTimes'&&url.searchParams.get('typeId')===typeId&&url.searchParams.get('groupId')==='QUICKGUIDES';}catch{return false;}
 });
 if(matches.length!==1)fail('LABOUR_REVIEW_REQUIRED');return matches[0];
}
export async function navigateHaynesRepair(page,request,mapping,{timeoutMs=12000}={}){
 let stage='OPEN_HAYNES';
 try{
 if(!/^t_\d+$/.test(mapping.haynesTypeId||''))fail('SETTINGS_REQUIRED');
 // The setup window is already on this page after sign-in; do not reload it.
 if(page.url()!==START)await page.goto(START,{waitUntil:'domcontentloaded',timeout:15000});
 const originOK=()=>{if(new URL(page.url()).origin!==ORIGIN)fail('LOGIN_REQUIRED');};originOK();
 let vehicle=await readRepairVehicle(page,{timeoutMs});
 if(vehicle.login)fail('LOGIN_REQUIRED');if(vehicle.blocked)fail('LABOUR_REVIEW_REQUIRED');
 const field=page.locator('#numberPlate,input[name="numberPlate"]'),submit=page.locator('#licencePlateBtn');
 await field.waitFor({state:'visible',timeout:10000});
 if(await field.count()!==1||await submit.count()!==1)fail('LABOUR_REVIEW_REQUIRED');
 stage='SEARCH_REGISTRATION';
 await field.fill(request.registration);await submit.click({timeout:10000});
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  originOK();
  try{vehicle=await page.evaluate(readVehicle);}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message||''))throw error;await page.waitForTimeout(200);continue;}
  if(vehicle.login||vehicle.blocked||vehicle.ambiguous||vehicle.registration===request.registration)break;
  await page.waitForTimeout(200);
 }
 stage='VERIFY_VEHICLE';
 const typeId=verifyRepairVehicle(vehicle,request,mapping);
 stage='FIND_REPAIR_TIMES_LINK';
 const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.href));
 const url=repairTimesLink(links,typeId);
 stage='OPEN_REPAIR_TIMES';
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});originOK();
 if(new URL(page.url()).pathname!=='/touch/site/layout/repairTimes'||new URL(page.url()).searchParams.get('typeId')!==typeId)fail('LABOUR_REVIEW_REQUIRED');
 stage='EXPAND_ALTERNATOR';
 await openAlternatorOperation(page,mapping,{timeoutMs});
 return {registration:request.registration,typeId};
 }catch(error){error.stage=stage;throw error;}
}

export async function readRepairVehicle(page,{timeoutMs=12000}={}){
 const deadline=Date.now()+timeoutMs;
 for(;;){
  try{return await page.evaluate(readVehicle);}catch(error){
   if(!/Execution context was destroyed|Cannot find context/.test(error.message||'')||Date.now()>=deadline)throw error;
   await page.waitForTimeout(200);
  }
 }
}

export async function openAlternatorOperation(page,mapping,{timeoutMs=12000}={}){
 const heading=page.getByText('Alternator',{exact:true});
 if(await heading.count()!==1)fail('LABOUR_REVIEW_REQUIRED');
 // Outer menu lists also contain an operation's text. Match only leaf LI rows.
 const rows=page.locator('li:not(:has(li))').filter({hasText:mapping.haynesOperationId});
 const visibleRows=async()=>{const found=[];for(let i=0;i<await rows.count();i++){const row=rows.nth(i);if(await row.isVisible())found.push(row);}return found;};
 let found=await visibleRows();
 if(found.length>1)fail('LABOUR_REVIEW_REQUIRED');
 if(!found.length)await heading.click({timeout:10000});
 const deadline=Date.now()+timeoutMs;
 while(!found.length&&Date.now()<deadline){
  // Expansion can fetch and insert the rows asynchronously after click returns.
  found=await visibleRows();
  if(found.length>1)fail('LABOUR_REVIEW_REQUIRED');
  if(!found.length)await page.waitForTimeout(200);
 }
 if(found.length!==1)fail('LABOUR_REVIEW_REQUIRED');
 await found[0].scrollIntoViewIfNeeded({timeout:10000});
}
