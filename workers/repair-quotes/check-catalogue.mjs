// Read-only PC check of the general catalogue path. Never enqueues, publishes,
// saves a job, changes configuration, orders a part or installs a worker.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupGeneralRepair} from './general-repair.mjs';
import {repairRequest,calculateRepairQuote,cleanRepairChoices} from '../../lib/repair-quote.js';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout});
let gsf,haynes;
try{
 console.log('VECTA parts and fitting check. Stop GSF safely in Workshop Connections first.');
 console.log('This checks current GSF and Haynes screens. It does not save or send prices.');
 const registration=await terminal.question('Registration: '),work=await terminal.question('Part/work to price (any part, e.g. supply and fit fuel pressure regulator): ');
 let request=repairRequest({registration,work,flow:'guided-v1'});const report={readOnly:true,request,startedAt:new Date().toISOString()};
 try{
  const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run this check on the workshop Windows PC.');
  gsf=await chromium.launchPersistentContext(process.env.GSF_PROFILE_DIR||path.join(local,'VectaGSF','EdgeProfile'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  haynes=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  const gsfPage=await gsf.newPage(),haynesPage=await haynes.newPage();
  report.steps=[];
  for(let step=0;step<20;step++){
   let timer;
   try{
    const evidence=await Promise.race([lookupGeneralRepair({gsfPage,haynesPage},request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),120000);})]);
    report.status='PASSED_READ_ONLY';report.quote=calculateRepairQuote(evidence,request);report.evidence=evidence;break;
   }catch(error){
    if(error.code!=='CHOICE_REQUIRED')throw error;
    const result=cleanRepairChoices(error.result,request);report.steps.push(result);
    console.log('\n'+result.stage.replaceAll('_',' '));
    if(result.selectedPart)console.log('GSF part: '+result.selectedPart.description+' '+result.selectedPart.sku);
    result.options.forEach((o,i)=>console.log((i+1)+'. '+o.label+' — '+o.detail+(o.costPence?' — £'+(o.costPence/100).toFixed(2)+' each ex VAT':'')+(o.hoursMilli?' — '+o.hoursMilli/1000+' hours':'')));
    // End the lookup timer before waiting for the mechanic's choice.
    clearTimeout(timer);
    const answer=await terminal.question('Choose an option number, type different search wording, or Q to finish: ');
    if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_REVIEW';break;}
    const choice=result.options[Number(answer)-1],c=request.choices;
    if(choice){
     if(result.stage==='GSF_CATEGORY')request=repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:{}});
     if(result.stage==='GSF_PART')request=repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:{part:choice.id}});
     if(result.stage==='HAYNES_MENU')request=repairRequest({...request,choices:{...c,menus:[...(c.menus||[]),choice.label],labour:undefined}});
     if(result.stage==='HAYNES_LABOUR')request=repairRequest({...request,choices:{...c,labour:choice.id}});
    }else if(answer.trim()){
     request=result.stage.startsWith('HAYNES_')?repairRequest({...request,choices:{part:c.part,labourSearch:answer.trim()}}):repairRequest({registration,work:answer.trim(),flow:'guided-v1'});
    }
   }finally{clearTimeout(timer);}
  }
  report.status||='STOPPED_FOR_REVIEW';
 }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||'LOOKUP_UNAVAILABLE';report.detail=error.detail||'';console.log('The check needs attention. If Edge is already in use, stop GSF safely and retry.');}
 const output=path.join(here,'catalogue-check-result.local.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(report.status+' — report saved beside this checker. Restart GSF in Workshop Connections when finished.');
}finally{await Promise.allSettled([gsf?.close(),haynes?.close()]);terminal.close();}
