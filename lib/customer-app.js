import {createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {pushConfig,sendPushSubscription} from '../api/_push.js';
import {portalAccess} from './customer-portal.js';
import {progressSecret,progressSnapshot,requestTrackingPath,trackingUrl,trackable} from './job-progress.js';

const table='customer_app_subscriptions';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const hash=value=>createHash('sha256').update(value).digest('hex');
const read=(db,name,params)=>db(name+'?'+new URLSearchParams(params));
const patch=(db,params,body)=>db(table+'?'+new URLSearchParams(params),{method:'PATCH',body:JSON.stringify(body)});
const remove=(db,params)=>db(table+'?'+new URLSearchParams(params),{method:'DELETE'});
const key=()=>createHash('sha256').update('vecta-customer-app-token-v1:'+progressSecret()).digest();
export function sealAppToken(token){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64url');}
export function openAppToken(value){const data=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');}
// Never let a public subscription turn the server into an arbitrary HTTP client.
export function appSubscription(value){
 let url;try{url=new URL(value?.endpoint);}catch{throw fail('Your phone could not register for alerts.');}
 const host=url.hostname;
 const allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='web.push.apple.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com');
 if(!allowed||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||value.endpoint.length>2048)throw fail('This push service is not supported.');
 const keys=value.keys;
 if(!keys||typeof keys.auth!=='string'||typeof keys.p256dh!=='string'||!/^[\w-]{22}={0,2}$/.test(keys.auth)||!/^[\w-]{87}=?$/.test(keys.p256dh)||Buffer.from(keys.auth,'base64url').length!==16||Buffer.from(keys.p256dh,'base64url').length!==65||Buffer.from(keys.p256dh,'base64url')[0]!==4)throw fail('Your phone returned invalid notification keys.');
 return {endpoint:url.href,expirationTime:null,keys:{auth:keys.auth,p256dh:keys.p256dh}};
}
function eventParams(context){
 const record=context.job||context.request;
 const params={registration:'eq.'+String(record.registration).toUpperCase().replace(/[^A-Z0-9]/g,''),customer_email:'eq.'+String(record.customer_email??record.email??'').trim().toLowerCase(),actor:'eq.workshop',kind:'in.(message,approval_request,booking_update,booking_confirmed)',select:'seq,kind',order:'seq.desc',limit:1};
 if(context.job&&context.request)params.or='(job_id.eq.'+context.job.id+',request_id.eq.'+context.request.id+')';
 else params[context.job?'job_id':'request_id']='eq.'+record.id;
 return params;
}
const ready=(context,now)=>!!context.job&&progressSnapshot(context.job,{now}).stage==='ready';
const cancelled=context=>['cancelled','canceled'].includes((context.job||context.request)?.status);
export async function customerAppAction(db,body,{now=Date.now()}={}){
 const context=await portalAccess(db,body.token,now);
 if(body.action==='app-push-config'){
  if(isTestProject())return {enabled:false};
  await read(db,table,{select:'id',limit:0});
  return {enabled:true,...pushConfig()};
 }
 if(isTestProject())throw fail('Phone alerts are disabled on this preview.',409);
 const subscription=appSubscription(body.subscription),id=hash(subscription.endpoint),tokenHash=hash(body.token);
 const [previous]=await read(db,table,{id:'eq.'+id,select:'token_hash',limit:1});
 if(body.action==='app-push-unsubscribe'){
  if(previous?.token_hash===tokenHash)await remove(db,{id:'eq.'+id,token_hash:'eq.'+tokenHash});
  return {ok:true};
 }
 if(body.action!=='app-push-subscribe')throw fail('Choose a valid app action.');
 if(cancelled(context))throw fail('Alerts are unavailable for a cancelled booking.',409);
 if(previous?.token_hash===tokenHash)return {ok:true}; // Reopening must not consume unread alerts.
 const [latest]=await read(db,'customer_portal_events',eventParams(context));
 const row={id,subscription,token_hash:tokenHash,token_encrypted:sealAppToken(body.token),last_seq:String(latest?.seq||0),was_ready:ready(context,now),next_check_at:new Date(now).toISOString(),lease_id:null,lease_until:null,created_at:new Date(now).toISOString()};
 await db(table+'?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)});
 return {ok:true};
}
export async function dispatchCustomerMessage(db,context){
 if(isTestProject())return;
 const {job,request}=context,hashes=[];
 if(trackable(job))hashes.push(hash(trackingUrl(job).split('#')[1]));
 if(request)hashes.push(hash(requestTrackingPath(request).split('#')[1]));
 const {runGarageAlerts}=await import('./customer-garage-alerts.js');
 const recipient=String(job?.customer_email||request?.email||'').trim().toLowerCase();
 const [account]=await read(db,'customer_garage_accounts',{email:'eq.'+recipient,select:'id',limit:1});
 await Promise.all([hashes.length&&runCustomerAppAlerts(db,{tokenHashes:hashes}),account&&runGarageAlerts(db,{accountId:account.id})]);
}
// Runs on the existing five-minute scheduler. Every send revalidates the same
// capability used by the portal, including changed owners, cancellation/deletion
// and expiry. No car details, prices or private link appear on the lock screen.
export async function runCustomerAppAlerts(db,{now=Date.now(),send=sendPushSubscription,tokenHashes}={}){
 if(isTestProject())return {disabled:true};
 const stamp=new Date(now).toISOString();
 const rows=await read(db,table,{select:'*',...(tokenHashes?{token_hash:'in.('+tokenHashes.join(',')+')'}:{next_check_at:'lte.'+stamp}),or:'(lease_until.is.null,lease_until.lt.'+stamp+')',order:'next_check_at.asc',limit:30});
 let sent=0,retired=0;
 await Promise.all(rows.map(async row=>{
  const lease=randomUUID();
  const [claimed]=await patch(db,{id:'eq.'+row.id,token_hash:'eq.'+row.token_hash,next_check_at:'eq.'+row.next_check_at,or:'(lease_until.is.null,lease_until.lt.'+stamp+')'},{lease_id:lease,lease_until:new Date(now+120000).toISOString()});
  if(!claimed)return;
  const condition={id:'eq.'+row.id,lease_id:'eq.'+lease,token_hash:'eq.'+row.token_hash};
  try{
   let token;try{token=openAppToken(row.token_encrypted);}catch{await remove(db,condition);retired++;return;}
   const context=await portalAccess(db,token,now);
   if(cancelled(context)){await remove(db,condition);retired++;return;}
   const unread=await read(db,'customer_portal_events',{...eventParams(context),seq:'gt.'+row.last_seq,order:'seq.asc',limit:100});
   const event=unread.find(e=>e.kind==='booking_confirmed')||unread.at(-1);
   const isReady=ready(context,now),becameReady=isReady&&!row.was_ready;
   if(event||becameReady){
    const body=event?.kind==='booking_confirmed'?'Good news, your booking is confirmed! Open VECTA for the details.':becameReady?'Your car is ready to collect. Open Vecta for the latest details.':event.kind==='approval_request'?'We need your approval for additional work. Open Vecta to review it.':event.kind==='booking_update'?'Your booking has been updated. Open Vecta for the details.':'You have a new workshop message. Open Vecta to read it.';
    await send(appSubscription(row.subscription),{title:'Vecta Motors',body,...(event?{messageSeq:String(event.seq)}:{}),tag:'vecta-customer-'+row.id.slice(0,16)+'-'+(event?.seq||'ready'),url:'/app/home'});sent++;
   }
   await patch(db,condition,{last_seq:String(event?.seq||row.last_seq),was_ready:event?.kind==='booking_confirmed'?row.was_ready:isReady,lease_id:null,lease_until:null,next_check_at:new Date(now+240000).toISOString()});
  }catch(error){
   if(error.status===404||[404,410].includes(error.statusCode)){await remove(db,condition);retired++;}
   else await patch(db,condition,{lease_id:null,lease_until:null,next_check_at:new Date(now+300000).toISOString()});
  }
 }));
 return {checked:rows.length,sent,retired};
}
