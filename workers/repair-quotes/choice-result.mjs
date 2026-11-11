import {createHash} from 'node:crypto';
export const choiceId=(...fields)=>createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0,32);
export function requireChoice(request,stage,options,{now=Date.now,selectedPart}={}){
 const result={request,stage,options:options.slice(0,40),checkedAt:new Date(now()).toISOString(),...(selectedPart?{selectedPart}:{})};
 throw Object.assign(Error('CHOICE_REQUIRED'),{code:'CHOICE_REQUIRED',result});
}
