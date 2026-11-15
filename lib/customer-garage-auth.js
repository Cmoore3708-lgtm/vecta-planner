import {createHash,createHmac,randomBytes,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import {progressSecret,uuid} from './job-progress.js';
import {isTestProject} from '../api/_database-environment.js';

export const garageFail=(message,status=400)=>Object.assign(Error(message),{status});
export const garageHash=value=>createHash('sha256').update(value).digest('hex');
export const garageRead=(db,table,params)=>db(table+'?'+new URLSearchParams(params));
export const garageWrite=(db,table,body,{method='POST',params={},upsert=false}={})=>db(table+'?'+new URLSearchParams(params),{method,headers:upsert?{Prefer:'resolution=ignore-duplicates,return=representation'}:{},body:body==null?undefined:JSON.stringify(body)});
export function garageEmail(value){const email=String(value||'').trim().toLowerCase();if(email.length>254||!/^[a-z0-9.!#$&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email))throw garageFail('Enter your email address.');return email;}
const codeHash=(id,email,code)=>createHmac('sha256',progressSecret()).update('garage-email-code:'+id+':'+email+':'+code).digest('hex');
const sameHash=(a,b)=>typeof a==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export async function sendGarageCode({email,code,id}){
 if(isTestProject())throw garageFail('Email sign-in is disabled on this preview.',409);
 if(!process.env.RESEND_API_KEY)throw garageFail('Email sign-in is temporarily unavailable. Please try again later.',503);
 const text='Your Vecta My Garage sign-in code is '+code+'.\n\nEnter it in the Vecta app within 10 minutes. Never share this code. If you did not request it, ignore this email.';
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'garage-sign-in:'+id},body:JSON.stringify({from:'Vecta Motors <chris@vectamotors.co.uk>',to:[email],subject:'Your Vecta sign-in code',text}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw garageFail('We could not confirm your sign-in email. Check your inbox before trying again.',503);
}
export async function requestGarageCode(db,value,{now=Date.now(),send=sendGarageCode}={}){
 if(isTestProject())throw garageFail('Email sign-in is disabled on this preview.',409);
 const email=garageEmail(value),bucket_key=garageHash(email+':'+Math.floor(now/60000));
 const recent=await garageRead(db,'customer_garage_challenges',{email:'eq.'+email,created_at:'gte.'+new Date(now-3600000).toISOString(),select:'id,bucket_key',limit:6});
 const existing=recent.find(row=>row.bucket_key===bucket_key);
 if(existing)return {challenge:existing.id,message:'Check your email for your six-digit code.'};
 if(recent.length>=5)throw garageFail('Too many sign-in emails requested. Please wait an hour before trying again.',429);
 const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
 await garageWrite(db,'customer_garage_challenges',{id,email,bucket_key,code_hash:codeHash(id,email,code),expires_at:new Date(now+600000).toISOString(),created_at:new Date(now).toISOString()});
 await send({email,code,id});
 return {challenge:id,message:'Check your email for your six-digit code.'};
}
export async function verifyGarageCode(db,{challenge,code},{now=Date.now()}={}){
 if(!uuid.test(challenge||'')||!/^\d{6}$/.test(String(code||'')))throw garageFail('Enter the six-digit code from your email.');
 const [row]=await garageRead(db,'customer_garage_challenges',{id:'eq.'+challenge,select:'*',limit:1});
 if(!row||row.consumed_at||Date.parse(row.expires_at)<=now||row.attempts>=5)throw garageFail('This code has expired. Request a new sign-in code.',401);
 const accepted=sameHash(row.code_hash,codeHash(challenge,row.email,String(code)));
 const changed=await garageWrite(db,'customer_garage_challenges',{attempts:row.attempts+1,...(accepted?{consumed_at:new Date(now).toISOString()}:{})},{method:'PATCH',params:{id:'eq.'+row.id,attempts:'eq.'+row.attempts,consumed_at:'is.null',expires_at:'gt.'+new Date(now).toISOString()}});
 if(!accepted||!changed?.length)throw garageFail('The code was not accepted. Check it and try again.',401);
 await garageWrite(db,'customer_garage_accounts',{email:row.email},{upsert:true,params:{on_conflict:'email'}});
 const [account]=await garageRead(db,'customer_garage_accounts',{email:'eq.'+row.email,select:'id,email',limit:1});
 const session=randomBytes(32).toString('base64url');
 await garageWrite(db,'customer_garage_sessions',{token_hash:garageHash(session),account_id:account.id,expires_at:new Date(now+180*86400000).toISOString()});
 return {session,email:account.email};
}
export async function garageAccount(db,session,{now=Date.now()}={}){
 if(typeof session!=='string'||!/^[-\w]{43}$/.test(session))throw garageFail('Sign in to open your garage.',401);
 const [row]=await garageRead(db,'customer_garage_sessions',{token_hash:'eq.'+garageHash(session),expires_at:'gt.'+new Date(now).toISOString(),select:'account_id,expires_at',limit:1});
 if(!row)throw garageFail('Please sign in again to open your garage.',401);
 const [account]=await garageRead(db,'customer_garage_accounts',{id:'eq.'+row.account_id,select:'id,email',limit:1});
 if(!account)throw garageFail('Please sign in again.',401);
 if(Date.parse(row.expires_at)<now+150*86400000)await garageWrite(db,'customer_garage_sessions',{expires_at:new Date(now+180*86400000).toISOString()},{method:'PATCH',params:{token_hash:'eq.'+garageHash(session)}});
 return account;
}
