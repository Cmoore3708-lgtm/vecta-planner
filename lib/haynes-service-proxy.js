import { serviceRequest,serviceResult } from './haynes-service.js';
const endpoint='https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-service-relay';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['preview','production'].includes(process.env.VERCEL_ENV))return res.status(404).json({status:'DISABLED'});
 if(req.method!=='GET')return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
 let request;try{request=serviceRequest({registration:req.query.reg,mileage:req.query.mileage,period:req.query.period});}catch{return res.status(400).json({status:'INVALID_REQUEST'});}
 const token=process.env.HAYNES_RELAY_SITE_TOKEN;if(!/^[a-f0-9]{64}$/.test(token||''))return res.status(200).json({status:'NOT_CONFIGURED'});
 try{
 const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(req.query.id?{action:'poll',id:req.query.id}:{action:'enqueue',request}),signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok)throw Error('Relay');
 if(data.status==='MATCHED')return res.status(200).json({status:'MATCHED',result:serviceResult(data.result,request)});
 return res.status(200).json({status:['WORKER_UPDATE_REQUIRED','PENDING','OFFLINE','BUSY','DAILY_LIMIT','LOGIN_REQUIRED','VERIFICATION_REQUIRED','SCHEDULE_REQUIRED','AMBIGUOUS'].includes(data.status)?data.status:'UNAVAILABLE',...(data.status==='PENDING'?{id:data.id}:{})});
 }catch{return res.status(200).json({status:'UNAVAILABLE'});}
}
