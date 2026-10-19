import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { managerGate, validManagerSession } from '../middleware.js';
import { databaseEnvironment } from '../api/_database-environment.js';
import { mechanicAuthorised, mechanicGate, isMechanicHost } from './mechanic-auth.js';

export function sameOriginRequest(req) {
  const headers=req.headers||{};
  if(headers['sec-fetch-site']==='cross-site') return false;
  if(!headers.origin) return true; // Native clients still have to authenticate.
  try {
    const origin=new URL(headers.origin);
    return origin.host===headers.host || [
      'https://vecta-mechanic-dashboard.vercel.app',
      'https://vecta-mechanic-dashboard-vectaplanner.vercel.app'
    ].includes(origin.origin);
  } catch { return false; }
}

export async function requireWorkshopLogin(req,res) {
  const credentials={user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD};
  if(!credentials.user||!credentials.password){res.status(503).json({error:'Workshop sign-in is not configured.'});return false;}
  const headers=req.headers||{};
  const request=new Request('https://'+(headers.host||'vecta-planner.vercel.app')+'/index.html',{headers:{
    authorization:String(headers.authorization||''),cookie:String(headers.cookie||'')
  }});
  const mechanicContext=isMechanicHost(headers.host)||
    (process.env.VERCEL_ENV==='preview'&&await mechanicAuthorised(request));
  if(mechanicContext){
    const denied=await mechanicGate(request);
    if(denied){
      if(denied.headers.get('WWW-Authenticate'))res.setHeader('WWW-Authenticate',denied.headers.get('WWW-Authenticate'));
      res.status(denied.status).json({error:'Mechanics sign-in required.'});return false;
    }
  }else if(!await validManagerSession(request,credentials)&&managerGate(request,credentials)){
    res.setHeader('WWW-Authenticate','Basic realm="VECTA Main", charset="UTF-8"');
    res.status(401).json({error:'Workshop sign-in required.'});return false;
  }
  if(req.method!=='GET'&&!sameOriginRequest(req)){res.status(403).json({error:'Use the workshop application to make this request.'});return false;}
  return true;
}

// The server exchanges the existing workshop login for a normal, limited-lifetime
// Supabase JWT. Neither the service key nor an auth refresh token reaches a browser.
// This is a server-managed Auth identity, not an employee's email account.
export function createWorkshopSessionIssuer(clientFactory=createClient) {
  let cache=null,inFlight=null;
  return async function issue() {
    const {url,serviceKey,publishableKey}=databaseEnvironment({requireService:true});
    const password=process.env.VECTA_MAIN_PASSWORD,user=process.env.VECTA_MAIN_USER;
    if(!password||!user||!publishableKey)throw Error('Workshop access is not configured.');
    const identity=createHmac('sha256',password).update('VECTA database access v1\n'+url+'\n'+user+'\n'+createHmac('sha256',serviceKey).update('identity-version').digest('hex')).digest('hex');
    const key=url+'|'+identity;
    if(cache?.key===key&&cache.expires_at*1000>Date.now()+120000)return cache;
    if(inFlight?.key===key)return inFlight.promise;
    const promise=(async()=>{
      const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
      const auth=clientFactory(url,publishableKey,options);
      const email='workshop-'+identity.slice(0,32)+'@vecta.invalid';
      const secret=createHmac('sha256',serviceKey).update('workshop-auth-password\n'+identity).digest('base64url');
      let verified=await auth.auth.signInWithPassword({email,password:secret});
      if(verified.error){
        const admin=clientFactory(url,serviceKey,options);
        const created=await admin.auth.admin.createUser({email,password:secret,email_confirm:true,app_metadata:{vecta_access:'workshop'}});
        // Another cold server instance may have created the same identity. Retry
        // normal Auth rather than rotating a password or racing one-use links.
        if(created.error&&!['email_exists','email_exists_error','user_already_exists'].includes(created.error.code))throw Error('Workshop database sign-in is unavailable.');
        verified=await auth.auth.signInWithPassword({email,password:secret});
      }
      const session=verified.data?.session;
      if(verified.error||!session?.access_token||session.user?.email!==email||session.user?.app_metadata?.vecta_access!=='workshop')throw Error('Workshop database sign-in could not be verified.');
      cache={key,access_token:session.access_token,expires_at:session.expires_at};
      return cache;
    })();
    inFlight={key,promise};
    try{return await promise;}finally{if(inFlight?.promise===promise)inFlight=null;}
  };
}
export const issueWorkshopSession=createWorkshopSessionIssuer();

export async function workshopSessionHandler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!await requireWorkshopLogin(req,res))return;
  if(req.headers?.['x-vecta-workshop']!=='1')return res.status(403).json({error:'Use the workshop application to sign in.'});
  try{const s=await issueWorkshopSession();return res.status(200).json({access_token:s.access_token,expires_at:s.expires_at});}
  catch{return res.status(503).json({error:'Secure database connection is temporarily unavailable. Your offline records remain available.'});}
}

export async function workshopAccessHealth(req,res) {
  if(req.method!=='GET')return res.status(405).json({ok:false});
  try{
    const s=await issueWorkshopSession(),{url,publishableKey}=databaseEnvironment();
    const response=await fetch(url+'/rest/v1/jobs?select=id&limit=1',{headers:{apikey:publishableKey,Authorization:'Bearer '+s.access_token},signal:AbortSignal.timeout(10000),cache:'no-store'});
    // This endpoint reveals no rows, counts, credentials or user/session details.
    return res.status(response.ok?200:503).json({ok:response.ok,authenticated_access:response.ok});
  }catch{return res.status(503).json({ok:false,authenticated_access:false});}
}
