import {timingSafeEqual} from 'node:crypto';
import {repairRequest,cleanRepairEvidence} from '../lib/repair-quote.js';
import {repairQueue} from '../lib/repair-quote-queue.js';
export function repairWorkerHandler({env=process.env,queue=repairQueue,now=Date.now}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  const secret=env.REPAIR_QUOTE_WORKER_TOKEN||'',token=String(req.headers?.authorization||'').replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(secret)||!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return res.status(401).json({status:'UNAUTHORIZED'});
  if(env.REPAIR_QUOTING_ENABLED!=='true')return res.status(200).json({status:'DISABLED'});
  try{
   const b=req.body||{};
   if(Buffer.byteLength(JSON.stringify(b))>60000)return res.status(413).json({status:'INVALID_REQUEST'});
   if(b.action==='pull')return res.status(200).json(await queue('pull',{}));
   if(b.action!=='complete'||!/^[a-f0-9-]{36}$/.test(b.id||'')||!/^[a-f0-9-]{36}$/.test(b.lease||'')||!['MATCHED','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','SETTINGS_REQUIRED','OUT_OF_STOCK','UNAVAILABLE'].includes(b.status))return res.status(400).json({status:'INVALID_REQUEST'});
   const request=repairRequest(b.request),result=b.status==='MATCHED'?cleanRepairEvidence(b.result,request,{now:now()}):null;
   return res.status(200).json(await queue('complete',{id:b.id,lease:b.lease,request,status:b.status,result}));
  }catch{return res.status(400).json({status:'INVALID_RESULT'});}
 };
}
export default repairWorkerHandler();
