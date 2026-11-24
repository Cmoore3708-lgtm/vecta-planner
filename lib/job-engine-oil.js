import {databaseEnvironment} from '../api/_database-environment.js';
import {normaliseReg,validReg} from './haynes-vehicle.js';
import {requireWorkshopLogin} from './workshop-access.js';
import {lookupService} from './haynes-service-proxy.js';
import {serviceRequest} from './haynes-service.js';

export default async function jobEngineOil(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).end();
 if(!await requireWorkshopLogin(req,res))return;
 const reg=normaliseReg(req.query.reg),job=String(req.query.job||'');
 if(!validReg(reg)||!/^[-\w]{1,120}$/.test(job))return res.status(400).json({status:'INVALID_REQUEST'});
 try{
  const env=databaseEnvironment({requireService:true});
  const key='job_oil:'+job+':'+reg;
  const base=env.url+'/rest/v1/workshop_settings';
  const headers={apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json'};
  async function db(query,options={}){
   const r=await fetch(base+query,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(6000)});
   if(!r.ok)throw Error('Oil record unavailable');return r.json();
  }
  const filter='?id=eq.'+encodeURIComponent(key);
  const read=async()=>(await db(filter+'&select=value,updated_at'))[0];
  const matched=value=>res.json({status:'MATCHED',result:value});
  const saved=await read();
  if(req.method==='POST'){
   const selected=req.body?.selected;
   if(!saved||!Number.isInteger(selected)||!saved.value.oil[selected]||req.body.version!==saved.updated_at)return res.status(409).json({status:'RELOAD'});
   const value={...saved.value,selected};
   const rows=await db(filter+'&updated_at=eq.'+encodeURIComponent(saved.updated_at),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({value,updated_at:new Date().toISOString()})});
   return rows.length?matched({...value,version:rows[0].updated_at}):res.status(409).json({status:'RELOAD'});
  }
  if(saved)return matched({...saved.value,version:saved.updated_at});
  // Guided mode lets older PC workers return a matched identity for the direct page link.
  const request=serviceRequest({registration:reg,mileage:1,purpose:'lubricants',menuFlow:'guided'});
  const reply=await lookupService(request,req.query.id);
  if(reply.status!=='MATCHED')return res.json(reply);
  const data=reply.result;
  if(!data.oil?.length)return matched({registration:reg,typeId:data.vehicle.typeId,workerUpdateRequired:data.kind!=='lubricants'});
  const value={registration:reg,oil:data.oil,selected:data.oil.length===1?0:null,fetchedAt:data.fetchedAt,typeId:data.vehicle.typeId};
  const rows=await db('?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id:key,value,updated_at:new Date().toISOString()})});
  const row=rows[0]||await read();
  return matched({...row.value,version:row.updated_at});
 }catch{return res.status(200).json({status:'UNAVAILABLE'});}
}
