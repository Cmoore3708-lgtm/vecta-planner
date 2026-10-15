(function(root){
 'use strict';
 let session=null,pending=null,timer=null;
 const clients=new Map();
 let writeVersion=0,activeWrites=0;
 function schedule(){
  clearTimeout(timer);
  if(!session)return;
  timer=setTimeout(()=>{if(root.navigator?.onLine!==false)token().catch(()=>{});},Math.max(1000,session.expires_at*1000-Date.now()-90000));
 }
 async function token(){
  if(session&&session.expires_at*1000>Date.now()+90000)return session.access_token;
  if(pending)return pending;
  pending=(async()=>{
   const response=await root.fetch('/api/supabase-config?action=session',{method:'POST',credentials:'same-origin',headers:{'X-Vecta-Workshop':'1'},cache:'no-store',signal:AbortSignal.timeout(12000)});
   const data=await response.json();
   if(!response.ok||!data.access_token||!Number.isFinite(data.expires_at)||data.expires_at*1000<=Date.now()){
    session=null;throw Error('Workshop sign-in is required before syncing records.');
   }
   session={access_token:data.access_token,expires_at:data.expires_at};
   for(const client of clients.values())client.realtime?.setAuth(data.access_token);
   schedule();return session.access_token;
  })().finally(()=>{pending=null;});
  return pending;
 }
 function createClient(url,key){
  const id=url+'|'+key;
  if(clients.has(id))return clients.get(id);
  const client=root.supabase.createClient(url,key,{accessToken:token,global:{fetch:async(input,options={})=>{
   const headers=new Headers(options.headers||(typeof input==='object'?input.headers:undefined));
   headers.set('X-Vecta-Require-Fresh','1');
   const method=String(options.method||(typeof input==='object'?input.method:'')||'GET').toUpperCase();
   const writes=!['GET','HEAD','OPTIONS'].includes(method);
   if(writes){writeVersion++;activeWrites++;}
   try{
    const response=await root.fetch(input,{...options,headers});
    if(response.headers?.get('X-Vecta-Data-State')==='stale')throw Error('Cloud data is offline. Your last saved view remains available.');
    return response;
   }finally{if(writes){writeVersion++;activeWrites--;}}
  }}});
  clients.set(id,client);return client;
 }
 root.addEventListener?.('online',()=>{if(clients.size)token().catch(()=>{});});
 root.addEventListener?.('focus',()=>{if(clients.size)token().catch(()=>{});});
 root.VectaWorkshopAccess={createClient,token,readState:()=>({version:writeVersion,writing:activeWrites>0})};
})(window);
