import {createHash} from 'node:crypto';
import {requireWorkshopLogin,sameOriginRequest} from '../lib/workshop-access.js';
import {isMechanicHost,mechanicAuthorised} from '../lib/mechanic-auth.js';
import {repairRequest,calculateRepairQuote} from '../lib/repair-quote.js';
import {repairQueue} from '../lib/repair-quote-queue.js';
export async function requireQuoteManager(req,res){
 const request=new Request('https://'+(req.headers?.host||'localhost')+'/',{headers:{cookie:String(req.headers?.cookie||''),authorization:String(req.headers?.authorization||'')}});
 if(isMechanicHost(req.headers?.host)||(process.env.VERCEL_ENV==='preview'&&await mechanicAuthorised(request))){res.status(403).json({status:'MANAGER_ONLY'});return false;}
 return requireWorkshopLogin(req,res);
}
export function repairQuoteHandler({env=process.env,authenticate=requireQuoteManager,queue=repairQueue,now=Date.now}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  if(!await authenticate(req,res))return;
  if(!sameOriginRequest(req))return res.status(403).json({status:'FORBIDDEN'});
  if(env.REPAIR_QUOTING_ENABLED!=='true')return res.status(200).json({status:'SETUP_REQUIRED'});
  if(req.method==='GET')return res.status(200).json({status:'READY'});
  try {
   if(Buffer.byteLength(JSON.stringify(req.body||{}))>2000)return res.status(413).json({status:'INVALID_REQUEST'});
   const request=repairRequest(req.body);
   // Shared manager account, no customer contact details or raw cookies in DB.
   const actor=createHash('sha256').update('repair-quotes|'+String(env.VECTA_MAIN_USER||'manager')).digest('hex');
   const result=await queue('enqueue',{request,actor});
   if(result.status==='MATCHED')return res.status(200).json({status:'MATCHED',quote:calculateRepairQuote(result.result,request,{now:now()})});
   const allowed=['PENDING','OFFLINE','BUSY','LOGIN_REQUIRED','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','SETTINGS_REQUIRED','OUT_OF_STOCK','UNAVAILABLE','DAILY_LIMIT'];
   return res.status(200).json({status:allowed.includes(result.status)?result.status:'UNAVAILABLE'});
  }catch(e){return res.status(e.code==='INVALID_REQUEST'||e.code==='UNSUPPORTED_OPERATION'?400:200).json({status:['INVALID_REQUEST','UNSUPPORTED_OPERATION','REVIEW_REQUIRED','LABOUR_REVIEW_REQUIRED','OUT_OF_STOCK'].includes(e.code)?e.code:'UNAVAILABLE'});}
 };
}
export default repairQuoteHandler();
