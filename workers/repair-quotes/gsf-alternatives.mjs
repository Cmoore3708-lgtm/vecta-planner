import {inspectRepairCatalogue} from './catalogue-structure.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
// Expand the observed catalogue control only; never select a product or add it.
export async function expandGSFAlternatives(page,registration,{maxClicks=8,timeoutMs=10000,requireExpanded=false}={}){
 const capture=()=>page.evaluate(inspectRepairCatalogue,{registration});
 let result=await capture(),clicks=0;
 const visibleMore=async()=>{const all=page.getByText('Show More',{exact:true}),found=[];for(let i=0;i<await all.count();i++){const item=all.nth(i);if(await item.isVisible())found.push(item);}return found;};
 let settlingSince=Date.now();
 while(true){
  const controls=await visibleMore();if(!controls.length){
   if(!requireExpanded)return {...result,expansionClicks:clicks};
   // Prices can arrive before the expansion controls during a fresh VRM render.
   // Require the terminal state and a second unchanged capture, not absence of
   // Show More in that intermediate frame.
   const signature=value=>JSON.stringify({boundary:value.boundary,candidates:value.candidates});
   if(Date.now()-settlingSince>=timeoutMs){const error=Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail:'GSF_EXPANSION_NOT_READY',boundaryCheck:result.boundary||null});throw error;}
   const before=signature(result);await page.waitForTimeout(250);const next=await capture();
   if(result.boundary?.showLess===1&&result.boundary?.showMore===0&&result.boundary?.loading===false&&signature(next)===before&&(await visibleMore()).length===0)return {...next,expansionClicks:clicks};
   result=next;continue;
  }
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
  settlingSince=Date.now();
 }
}
