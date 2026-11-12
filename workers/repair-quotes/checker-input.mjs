import {repairRequest,repairScope} from '../../lib/repair-quote.js';

const messages={
 INVALID_REQUEST:'Enter a registration and one part or repair to price.',
 UNSUPPORTED_OPERATION:'Please enter one part or repair, for example: Supply and fit radiator. Price separate repairs one at a time.',
 POSITION_REQUIRED:'Please specify the position, for example: front brake pads or rear brake pads.',
 AXLE_SCOPE_REQUIRED:'For brake pads or discs, specify the front or rear axle rather than a single side.',
 QUANTITY_REQUIRED:'Please check the quantity: pads are one axle set, discs are a pair; other parts can have a quantity from 1 to 20.'
};
function explain(error,log){if(!messages[error.code])throw error;log(messages[error.code]);}
const quit=value=>value.trim().toUpperCase()==='Q';

// Keep input mistakes in the prompt. Supplier sessions are opened only after
// the initial request has passed the same validation used by the job card.
export async function promptInitialRepairRequest(terminal,{log=console.log}={}){
 let registration;
 while(true){
  const answer=await terminal.question('Registration (or Q to finish): ');if(quit(answer))return null;
  registration=answer.toUpperCase().replace(/\s/g,'');
  if(/^[A-Z0-9]{2,8}$/.test(registration))break;
  log('Please enter the vehicle registration using letters and numbers.');
 }
 while(true){
  const work=await terminal.question('Part/work to price (e.g. supply and fit radiator, or Q to finish): ');if(quit(work))return null;
  try{return repairRequest({registration,work,flow:'guided-v1'});}catch(error){explain(error,log);}
 }
}

export async function promptRepairChoice(terminal,request,result,{log=console.log}={}){
 while(true){
  const answer=(await terminal.question('Choose an option number, type different search wording, or Q to finish: ')).trim();
  if(quit(answer))return null;
  if(!answer){log('Choose an option or enter the wording to search.');continue;}
  const numeric=/^\d+$/.test(answer),choice=numeric?result.options[Number(answer)-1]:null,c=request.choices;
  if(numeric&&!choice){log('Choose one of the option numbers shown, or enter different search wording.');continue;}
  try{
   if(choice){
    if(result.stage==='GSF_CATEGORY')return repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:choice.categoryChoice?{gsfCategory:choice.categoryChoice}:{}});
    if(result.stage==='GSF_PART')return repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:{...(c.gsfCategory?{gsfCategory:c.gsfCategory}:{}),part:choice.id}});
    if(result.stage==='HAYNES_MENU')return repairRequest({...request,choices:{...c,menus:[...(c.menus||[]),choice.label],labour:undefined}});
    if(result.stage==='HAYNES_LABOUR')return repairRequest({...request,choices:{...c,labour:choice.id}});
    throw Error('UNKNOWN_CHOICE_STAGE');
   }
   return result.stage.startsWith('HAYNES_')?repairRequest({...request,choices:{...(c.gsfCategory?{gsfCategory:c.gsfCategory}:{}),part:c.part,labourSearch:answer}}):repairRequest({registration:request.registration,work:request.lookup?repairScope.prefix(request.lookup)+answer:answer,flow:'guided-v1'});
  }catch(error){explain(error,log);}
 }
}

// Diagnostic-only selection has no GSF identity. Keep it out of the pricing
// request protocol, which still requires a part before any labour selection.
export async function promptHaynesLabourChoice(terminal,choices,result,{log=console.log}={}){
 while(true){
  const answer=(await terminal.question('Choose the correct operation/group number, type different search wording, or Q to finish: ')).trim();
  if(quit(answer))return null;
  if(!answer){log('Choose an option or enter the wording to search.');continue;}
  if(/^\d+$/.test(answer)){
   const option=result.options[Number(answer)-1];
   if(!option){log('Choose one of the option numbers shown.');continue;}
   if(result.stage==='HAYNES_LABOUR')return {...choices,labour:option.id};
   if(result.stage==='HAYNES_MENU'){
    if((choices.menus||[]).length>=8){log('Enter more specific search wording to narrow the repair groups.');continue;}
    return {...choices,menus:[...(choices.menus||[]),option.label],labour:undefined};
   }
   throw Error('UNKNOWN_CHOICE_STAGE');
  }
  if(answer.length>150){log('Keep the search wording under 150 characters.');continue;}
  return {labourSearch:answer};
 }
}
