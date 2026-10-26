import {inspectRepairCatalogue} from './catalogue-structure.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
// Expand the observed catalogue control only; never select a product or add it.
export async function expandGSFAlternatives(page,registration,{maxClicks=8,timeoutMs=10000}={}){
 const capture=()=>page.evaluate(inspectRepairCatalogue,{registration});
 let result=await capture(),clicks=0;
 const visibleMore=async()=>{const all=page.getByText('Show More',{exact:true}),found=[];for(let i=0;i<await all.count();i++){const item=all.nth(i);if(await item.isVisible())found.push(item);}return found;};
 while(true){
  const controls=await visibleMore();if(!controls.length)return {...result,expansionClicks:clicks};
  if(controls.length!==1)fail('REVIEW_REQUIRED');if(clicks>=maxClicks)fail('GSF_MORE_LIMIT');
  const before=JSON.stringify(result.candidates.map(card=>card.text));
  await controls[0].click({timeout:10000});clicks++;
  const deadline=Date.now()+timeoutMs;let changed=false;
  while(Date.now()<deadline){
   result=await capture();
   if(JSON.stringify(result.candidates.map(card=>card.text))!==before){changed=true;break;}
   await page.waitForTimeout(200);
  }
  if(!changed)fail('GSF_MORE_DID_NOT_LOAD');
 }
}
