import {repairRequest,repairScope,cleanRepairEvidence} from '../../lib/repair-quote.js';
import {lookupGeneralGSF} from './general-gsf.mjs';
import {lookupGeneralHaynes} from './general-haynes.mjs';
export async function lookupGeneralRepair({gsfPage,haynesPage},raw,{gsf=lookupGeneralGSF,haynes=lookupGeneralHaynes,now=Date.now,onProgress=()=>{}}={}){
 const request=repairRequest(raw),scope=repairScope.resolve(request.work);
 let part;if(request.lookup!=='labour')try{part=await gsf(gsfPage,request,{now,onProgress});}catch(error){error.supplier||='GSF';throw error;}
 // A GSF choice pauses here. Haynes is never searched before that choice.
 let time;if(request.lookup!=='parts')try{onProgress('HAYNES_LOOKUP');time=await haynes(haynesPage,request,{now,selectedPart:part?.part});}
 catch(error){error.supplier||='Haynes';if(error.code==='CHOICE_REQUIRED'&&part)error.result.selectedPart=part.part;throw error;}
 const variant=time?.variant||part?.vehicle;
 return cleanRepairEvidence({request,scope,variant,fitmentEvidence:part?.fitmentEvidence||'Haynes registration '+request.registration+'; selected replacement operation '+time.labour.operationId,catalogueComplete:part?part.catalogueComplete:true,parts:part?[{...part.part,variant}]:[],labour:time?.labour||null,checkedAt:new Date(now()).toISOString()},request,{now:now()});
}

// One worker's short-lived part selections. No disk/DB cache and no cached
// final quotes: selecting a labour operation always triggers a fresh GSF read.
export function createGeneralRepairSession({gsf=lookupGeneralGSF,haynes=lookupGeneralHaynes,now=Date.now}={}){
 const parts=new Map(),ttlMs=5*60*1000,maxEntries=8;
 const keyFor=r=>!r.lookup&&r.flow==='guided-v1'&&r.choices.part?JSON.stringify([r.registration,r.work,r.operation,r.quantity,r.choices.gsfCategory||'',r.choices.part]):null;
 const reusable=(value,r,at)=>{
  const p=value?.part,checked=Date.parse(p?.checkedAt);
  return value?.catalogueComplete===true&&p?.source==='GSF'&&p.registration===r.registration&&p.choiceId===r.choices.part&&p.fitmentConfirmed===true&&p.vatBasis==='EX_VAT'&&typeof p.inStock==='boolean'&&Number.isFinite(checked)&&checked<=at&&at-checked<ttlMs;
 };
 const lookup=(pages,raw)=>lookupGeneralRepair(pages,raw,{now,haynes,gsf:async(page,r,options)=>{
  const at=now(),key=keyFor(r),final=!!r.choices?.labour;
  for(const [k,entry] of parts)if(at<entry.at||at-entry.at>=ttlMs)parts.delete(k);
  const entry=key&&parts.get(key);
  if(!final&&entry&&reusable(entry.value,r,at))return structuredClone(entry.value);
  if(key)parts.delete(key);
  const value=await gsf(page,r,options);
  if(key&&!final&&reusable(value,r,now())){
   parts.set(key,{at:now(),value:structuredClone(value)});
   while(parts.size>maxEntries)parts.delete(parts.keys().next().value);
  }
  return value;
 }});
 lookup.clear=()=>parts.clear();
 return lookup;
}
