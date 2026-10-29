import fs from 'node:fs';
import path from 'node:path';
const ENDPOINT='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/worker-batch-tests';
export function batchConnection({dataDir=process.env.VECTA_WORKER_DATA_DIR,token=process.env.HAYNES_RELAY_TOKEN,fetcher=fetch}={}){
 const file=dataDir?path.join(dataDir,'gsf/batch-request.local.json'):null;
 if(!file||!fs.existsSync(file))return null;
 const request=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(request.endpoint!==ENDPOINT||!/^[a-f0-9-]{36}$/.test(request.launchKey||'')||!/^[a-f0-9]{64}$/.test(token||''))throw Error('BATCH_CONNECTION_NOT_READY');
 const rpc=async body=>{
  const response=await fetcher(ENDPOINT,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(response.status===401)throw Error('PAIRING_REQUIRED');if(!response.ok)throw Error('BATCH_RELAY_UNAVAILABLE');return response.json();
 };
 let requested=false,starting=false;
 return {rpc,outboxPath:path.join(dataDir,'gsf/diagnostic-receipt.local.json'),async start(){
  if(requested||request.startedRun||starting)return;starting=true;
  try{const result=await rpc({action:'start',launchKey:request.launchKey,count:100});
  if(['RUNNING','ACTIVE_RUN','PAUSED','COMPLETED'].includes(result.status)&&result.id){
   request.startedRun=result.id;const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(request),{mode:0o600});fs.renameSync(temp,file);requested=true;
   console.log('VECTA 100-vehicle test requested. CM14 KEL is included first.');
  }
  }finally{starting=false;}
 }};
}
