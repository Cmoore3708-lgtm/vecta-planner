// Read-only PC check of the general catalogue path. Never enqueues, publishes,
// saves a job, changes configuration, orders a part or installs a worker.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupGeneralRepair} from './general-repair.mjs';
import {repairRequest,repairScope,calculateRepairQuote,cleanRepairChoices} from '../../lib/repair-quote.js';
import {readCatalogueResults,observedCategory} from './catalogue-results.mjs';
import {readCatalogueSearchState} from './catalogue-search.mjs';
import {readRepairGroups} from './general-gsf.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout});
const checkerVersion='2026-11-11-category-ids-v5';
let gsf,haynes,gsfPage,haynesPage;
try{
 console.log('VECTA parts and fitting check — '+checkerVersion+'. Stop GSF safely in Workshop Connections first.');
 console.log('This checks current GSF and Haynes screens. It does not save or send prices.');
 const registration=await terminal.question('Registration: '),work=await terminal.question('Part/work to price (any part, e.g. supply and fit fuel pressure regulator): ');
 let request=repairRequest({registration,work,flow:'guided-v1'});const report={readOnly:true,checkerVersion,request,startedAt:new Date().toISOString()};
 try{
  const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run this check on the workshop Windows PC.');
  gsf=await chromium.launchPersistentContext(process.env.GSF_PROFILE_DIR||path.join(local,'VectaGSF','EdgeProfile'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  haynes=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  gsfPage=await gsf.newPage();haynesPage=await haynes.newPage();
  report.steps=[];let loginRetries=0;
  for(let step=0;step<20;step++){
   let timer;
   try{
    console.log(request.choices.part?'Rechecking your GSF part, then finding its Haynes fitting operation...':'Selecting '+request.registration+' in GSF, then searching for the part...');
    const evidence=await Promise.race([lookupGeneralRepair({gsfPage,haynesPage},request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),120000);})]);
    report.status='PASSED_READ_ONLY';report.quote=calculateRepairQuote(evidence,request);report.evidence=evidence;break;
   }catch(error){
    if(error.code==='LOGIN_REQUIRED'&&loginRetries<2){
     clearTimeout(timer);loginRetries++;
     const answer=await terminal.question('Sign in to '+(error.supplier||'the supplier')+' in its Edge window, then press Enter to retry (or Q to finish): ');
     if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_LOGIN';break;}
     continue;
    }
    if(error.code!=='CHOICE_REQUIRED')throw error;
    if(error.observed){report.diagnostics||=[];report.diagnostics.push(error.observed);}
    const result=cleanRepairChoices(error.result,request);report.steps.push(result);
    if(result.stage==='GSF_CATEGORY'&&!result.options.length){
     report.status='NEEDS_CHECK';report.reason='GSF_RESULTS_NEED_REVIEW';report.detail='The search ran, but no selectable category was captured. The report includes the visible search-result labels and controls.';
     console.log(report.detail);break;
    }
    console.log('\n'+result.stage.replaceAll('_',' '));
    if(result.selectedPart)console.log('GSF part: '+result.selectedPart.description+' '+result.selectedPart.sku);
    result.options.forEach((o,i)=>console.log((i+1)+'. '+o.label+' — '+o.detail+(o.costPence?' — £'+(o.costPence/100).toFixed(2)+' each ex VAT':'')+(o.hoursMilli?' — '+o.hoursMilli/1000+' hours':'')));
    // End the lookup timer before waiting for the mechanic's choice.
    clearTimeout(timer);
    const answer=await terminal.question('Choose an option number, type different search wording, or Q to finish: ');
    if(answer.trim().toUpperCase()==='Q'){report.status='STOPPED_FOR_REVIEW';break;}
    const choice=result.options[Number(answer)-1],c=request.choices;
    if(choice){
     if(result.stage==='GSF_CATEGORY')request=repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:choice.categoryChoice?{gsfCategory:choice.categoryChoice}:{}});
     if(result.stage==='GSF_PART')request=repairRequest({...request,work:choice.work,operation:undefined,quantity:undefined,choices:{...(c.gsfCategory?{gsfCategory:c.gsfCategory}:{}),part:choice.id}});
     if(result.stage==='HAYNES_MENU')request=repairRequest({...request,choices:{...c,menus:[...(c.menus||[]),choice.label],labour:undefined}});
     if(result.stage==='HAYNES_LABOUR')request=repairRequest({...request,choices:{...c,labour:choice.id}});
    }else if(answer.trim()){
     request=result.stage.startsWith('HAYNES_')?repairRequest({...request,choices:{...(c.gsfCategory?{gsfCategory:c.gsfCategory}:{}),part:c.part,labourSearch:answer.trim()}}):repairRequest({registration,work:answer.trim(),flow:'guided-v1'});
    }
   }finally{clearTimeout(timer);}
  }
  report.status||='STOPPED_FOR_REVIEW';
 }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||'LOOKUP_UNAVAILABLE';report.detail=error.detail||'';report.supplier=error.supplier||'';if(error.observed)report.observed=error.observed;console.log('The '+(report.supplier||'supplier')+' check stopped: '+(report.detail||report.reason)+'. Send the report back so this step can be checked.');}
 // Retain bounded page-state evidence for every unfinished run, including
 // failures after category discovery. Never store input values or page HTML.
 if(report.status!=='PASSED_READ_ONLY'&&gsfPage&&!gsfPage.isClosed()){
  try{
   report.lastGsfPage={observedCategory:observedCategory(gsfPage.url()),...await gsfPage.evaluate(readCatalogueResults,{query:repairScope.resolve(request.work).query}),searchControls:await gsfPage.evaluate(readCatalogueSearchState)};
   const catalogue=await gsfPage.evaluate(readRepairGroups);
   report.lastGsfPage.catalogue={complete:catalogue.complete,groupCount:catalogue.groups.length,groups:catalogue.groups.slice(0,40).map(g=>({sku:g.sku,description:g.description,parsedAll:g.parsedAll,hasAttributes:!!g.attributesSelector,productLinkCount:g.links.length,options:g.options.slice(0,20).map(({description,brand,grade,pricePence,inStock})=>({description,brand,grade,pricePence,inStock}))}))};
  }
  catch{report.diagnosticCaptureUnavailable=true;}
 }
 const output=path.join(here,'catalogue-check-result.local.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(report.status+' — report saved beside this checker. Restart GSF in Workshop Connections when finished.');
}finally{await Promise.allSettled([gsf?.close(),haynes?.close()]);terminal.close();}
