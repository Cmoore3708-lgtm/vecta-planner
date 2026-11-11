// Read-only PC check of the general catalogue path. Never enqueues, publishes,
// saves a job, changes configuration, orders a part or installs a worker.
import {chromium} from 'playwright';
import {createInterface} from 'node:readline/promises';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lookupGeneralRepair} from './general-repair.mjs';
import {repairRequest,calculateRepairQuote} from '../../lib/repair-quote.js';
const here=path.dirname(fileURLToPath(import.meta.url)),terminal=createInterface({input:process.stdin,output:process.stdout});
let gsf,haynes;
try{
 console.log('VECTA parts and fitting check. Stop GSF safely in Workshop Connections first.');
 console.log('This checks current GSF and Haynes screens. It does not save or send prices.');
 const registration=await terminal.question('Registration: '),work=await terminal.question('Part/work to price (any part, e.g. supply and fit fuel pressure regulator): ');
 const request=repairRequest({registration,work}),report={readOnly:true,request,startedAt:new Date().toISOString()};
 try{
  const local=process.env.LOCALAPPDATA;if(!local)throw Error('Run this check on the workshop Windows PC.');
  gsf=await chromium.launchPersistentContext(process.env.GSF_PROFILE_DIR||path.join(local,'VectaGSF','EdgeProfile'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  haynes=await chromium.launchPersistentContext(path.join(local,'VectaRepairQuotes','Haynes'),{channel:'msedge',headless:false,acceptDownloads:false,chromiumSandbox:true});
  const gsfPage=await gsf.newPage(),haynesPage=await haynes.newPage();
  let timer;try{
   const evidence=await Promise.race([lookupGeneralRepair({gsfPage,haynesPage},request),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOOKUP_TIMEOUT')),120000);})]);
   report.status='PASSED_READ_ONLY';report.quote=calculateRepairQuote(evidence,request);report.evidence=evidence;
  }finally{clearTimeout(timer);}
 }catch(error){report.status='NEEDS_CHECK';report.reason=error.code||'LOOKUP_UNAVAILABLE';report.detail=error.detail||'';console.log('The check needs attention. If Edge is already in use, stop GSF safely and retry.');}
 const output=path.join(here,'catalogue-check-result.local.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(report.status+' — report saved beside this checker. Restart GSF in Workshop Connections when finished.');
}finally{await Promise.allSettled([gsf?.close(),haynes?.close()]);terminal.close();}
