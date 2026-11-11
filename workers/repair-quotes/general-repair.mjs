import {repairRequest,repairScope,cleanRepairEvidence} from '../../lib/repair-quote.js';
import {lookupGeneralGSF} from './general-gsf.mjs';
import {lookupGeneralHaynes} from './general-haynes.mjs';
export async function lookupGeneralRepair({gsfPage,haynesPage},raw,{gsf=lookupGeneralGSF,haynes=lookupGeneralHaynes,now=Date.now}={}){
 const request=repairRequest(raw),scope=repairScope.resolve(request.work);
 const part=await gsf(gsfPage,request,{now});
 // A GSF choice pauses here. Haynes is never searched before that choice.
 let time;try{time=await haynes(haynesPage,request,{now,selectedPart:part.part});}
 catch(error){if(error.code==='CHOICE_REQUIRED')error.result.selectedPart=part.part;throw error;}
 return cleanRepairEvidence({request,scope,variant:time.variant,fitmentEvidence:part.fitmentEvidence,catalogueComplete:part.catalogueComplete,parts:[{...part.part,variant:time.variant}],labour:time.labour,checkedAt:new Date(now()).toISOString()},request,{now:now()});
}
