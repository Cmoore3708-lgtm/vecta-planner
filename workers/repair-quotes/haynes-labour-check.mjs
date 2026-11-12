import {repairRequest,repairScope} from '../../lib/repair-quote.js';
import {openGeneralHaynesRepair} from './general-haynes.mjs';
import {lookupHaynesLabourChoices} from './guided-haynes.mjs';

// A diagnostic session for labour only: no fabricated GSF part, no quote,
// and no automatic exact-description acceptance. Uses the pricing chooser.
export async function createHaynesLabourCheck(page,input,{now=Date.now}={}){
 const request=repairRequest({registration:input.registration,work:input.work});
 const vehicle=await openGeneralHaynesRepair(page,request);
 return async(choices={})=>lookupHaynesLabourChoices(page,request,{
  vehicle,choices,query:choices.labourSearch||repairScope.resolve(request.work).query,now
 });
}
