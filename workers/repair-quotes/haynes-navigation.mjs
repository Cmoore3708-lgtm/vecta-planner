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
 if(!/^t_\d+$/.test(mapping.haynesTypeId||''))fail('SETTINGS_REQUIRED');
 await page.goto(START,{waitUntil:'domcontentloaded',timeout:15000});
 const originOK=()=>{if(new URL(page.url()).origin!==ORIGIN)fail('LOGIN_REQUIRED');};originOK();
 let vehicle=await page.evaluate(readVehicle);
 if(vehicle.login)fail('LOGIN_REQUIRED');if(vehicle.blocked)fail('LABOUR_REVIEW_REQUIRED');
 const field=page.locator('#numberPlate,input[name="numberPlate"]'),submit=page.locator('#licencePlateBtn');
 if(await field.count()!==1||await submit.count()!==1)fail('LABOUR_REVIEW_REQUIRED');
 await field.fill(request.registration);await submit.click({timeout:10000});
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  originOK();
  try{vehicle=await page.evaluate(readVehicle);}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message||''))throw error;await page.waitForTimeout(200);continue;}
  if(vehicle.login||vehicle.blocked||vehicle.ambiguous||vehicle.registration===request.registration)break;
  await page.waitForTimeout(200);
 }
 const typeId=verifyRepairVehicle(vehicle,request,mapping);
 const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(node=>node.href));
 const url=repairTimesLink(links,typeId);
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:15000});originOK();
 if(new URL(page.url()).pathname!=='/touch/site/layout/repairTimes'||new URL(page.url()).searchParams.get('typeId')!==typeId)fail('LABOUR_REVIEW_REQUIRED');
 // Expand only the exact observed job heading; never click the green add-to-estimate control.
 const heading=page.getByText('Alternator',{exact:true});
 if(await heading.count()!==1)fail('LABOUR_REVIEW_REQUIRED');
 const operation=page.getByText(/Renew the alternator/);
 if(await operation.count()!==1||!await operation.isVisible())await heading.click({timeout:10000});
 await page.getByText(/Renew the alternator/).first().waitFor({state:'visible',timeout:10000});
 return {registration:request.registration,typeId};
}
