import {requireQuoteManager} from './repair-quote.js';
import {sameOriginRequest} from '../lib/workshop-access.js';
import {workerTestStore} from '../lib/worker-test-store.js';
import {selectCohort,testReport,compareReports} from '../lib/worker-tests.js';
const uuid=value=>/^[a-f0-9-]{36}$/.test(value||'');
export function workerTestsHandler({env=process.env,authenticate=requireQuoteManager,store=workerTestStore}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method))return res.status(405).json({status:'METHOD_NOT_ALLOWED'});
  if(!await authenticate(req,res))return;
  if(!sameOriginRequest(req))return res.status(403).json({status:'FORBIDDEN'});
  if(env.GSF_SERVICE_PRICING_ENABLED!=='true')return res.status(200).json({status:'DISABLED'});
  try{
   if(req.method==='GET'){
    if(req.query?.action==='preflight')return res.status(200).json(await store('preflight'));
    if(req.query?.id&&!uuid(req.query.id))throw Error('INVALID_REQUEST');
    const data=await store('status',req.query?.id?{id:req.query.id}:{});
    const report=testReport(data);
    if(data.run?.previous_run){const previous=await store('status',{id:data.run.previous_run});report.changes=compareReports(data,previous);}
    return res.status(200).json(report);
   }
   if(req.headers?.['x-vecta-worker-tests']!=='1')return res.status(403).json({status:'FORBIDDEN'});
   const b=req.body||{};
   if(Buffer.byteLength(JSON.stringify(b))>2000)throw Error('INVALID_REQUEST');
   if(['pause','resume','cancel'].includes(b.action)&&uuid(b.id))return res.status(200).json(testReport(await store(b.action,{id:b.id})));
   if(b.action!=='start'||!uuid(b.launchKey)||![2,100].includes(b.count??100))throw Error('INVALID_REQUEST');
   const ready=await store('preflight');
   if(ready.activeRun)return res.status(200).json({status:'ACTIVE_RUN',id:ready.activeRun});
   if(ready.status!=='READY')return res.status(200).json(ready);
   let cohort,previousRun=null;
   if(b.previousRun){
    if(!uuid(b.previousRun))throw Error('INVALID_REQUEST');
    const previous=await store('status',{id:b.previousRun});
    if(!previous.run||!['COMPLETED','CANCELLED'].includes(previous.run.status))throw Error('INVALID_REQUEST');
    cohort=previous.run.cohort;previousRun=b.previousRun;
   }else{
    const source=await store('cohort');cohort=selectCohort(source.vehicles||[],b.count??100);
   }
   return res.status(200).json(await store('start',{launchKey:b.launchKey,cohort,previousRun}));
  }catch(error){return res.status(['INVALID_REQUEST','INVALID_COUNT'].includes(error.message)?400:503).json({status:['INVALID_REQUEST','INVALID_COUNT','INSUFFICIENT_REGISTRATIONS'].includes(error.message)?error.message:'TEST_STORAGE_UNAVAILABLE',...(error.available!==undefined?{available:error.available}:{})});}
 };
}
export default workerTestsHandler();
