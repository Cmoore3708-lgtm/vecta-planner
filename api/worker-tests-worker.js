import {timingSafeEqual} from 'node:crypto';
import {workerTestStore} from '../lib/worker-test-store.js';
import {cleanCompletion,DIAGNOSTIC_BUILD} from '../lib/worker-tests.js';
export function workerTestsWorkerHandler({env=process.env,store=workerTestStore}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  const secret=env.GSF_WORKER_TOKEN||env.REPAIR_QUOTE_WORKER_TOKEN||'',token=String(req.headers?.authorization||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(secret)||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return res.status(401).json({status:'UNAUTHORIZED'});
  if(env.GSF_SERVICE_PRICING_ENABLED!=='true')return res.status(200).json({status:'DISABLED'});
  const b=req.body||{};
  if(Buffer.byteLength(JSON.stringify(b))>24000)return res.status(413).json({status:'INVALID_REQUEST'});
  try{
   if(b.action==='heartbeat'&&b.build===DIAGNOSTIC_BUILD&&/^[a-f0-9]{64}$/.test(b.revision||'')&&/^[a-f0-9-]{36}$/.test(b.workerId||''))return res.status(200).json(await store('heartbeat',{workerId:b.workerId,build:b.build,revision:b.revision,ready:b.ready===true}));
   if(b.action==='pull'&&/^[a-f0-9-]{36}$/.test(b.workerId||''))return res.status(200).json(await store('pull',{workerId:b.workerId}));
   if(b.action==='complete')return res.status(200).json(await store('complete',cleanCompletion(b)));
   return res.status(400).json({status:'INVALID_REQUEST'});
  }catch(error){return res.status(error.message==='INVALID_REQUEST'?400:503).json({status:error.message==='INVALID_REQUEST'?'INVALID_REQUEST':'TEST_STORAGE_UNAVAILABLE'});}
 };
}
export default workerTestsWorkerHandler();
