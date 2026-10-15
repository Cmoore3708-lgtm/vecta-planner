import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createWorkshopSessionIssuer,requireWorkshopLogin,workshopSessionHandler} from '../../lib/workshop-access.js';
import {managerSessionCookie,requiresManagerLogin} from '../../middleware.js';

function res(){return {code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
async function env(run){
 const values={VERCEL_ENV:'production',VECTA_MAIN_USER:'TestManager',VECTA_MAIN_PASSWORD:'test-only-long-password',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'public-test-key',SUPABASE_SERVICE_ROLE_KEY:'private-test-key'};
 const before={};for(const [k,v] of Object.entries(values)){before[k]=process.env[k];process.env[k]=v;}
 try{return await run();}finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
function req(extra={}){return {method:'POST',headers:{host:'workshop.test',origin:'https://workshop.test',authorization:'Basic '+Buffer.from('TestManager:test-only-long-password').toString('base64'),'x-vecta-workshop':'1'},...extra};}

test('session exchange fails closed without the workshop login',()=>env(async()=>{
 const r=res();await workshopSessionHandler(req({headers:{host:'workshop.test','x-vecta-workshop':'1'}}),r);
 assert.equal(r.code,401);assert.equal(r.body.access_token,undefined);
}));
test('workshop API accepts existing Basic and signed cookie, rejects forged cookies and cross-site writes',()=>env(async()=>{
 assert.equal(await requireWorkshopLogin(req(),res()),true);
 const cookie=await managerSessionCookie({user:process.env.VECTA_MAIN_USER,password:process.env.VECTA_MAIN_PASSWORD});
 assert.equal(await requireWorkshopLogin(req({headers:{host:'workshop.test',cookie}}),res()),true);
 const forged=res();assert.equal(await requireWorkshopLogin(req({headers:{host:'workshop.test',cookie:cookie.replace('v1.','v2.')}}),forged),false);assert.equal(forged.code,401);
 const cross=res();assert.equal(await requireWorkshopLogin(req({headers:{...req().headers,origin:'https://attacker.test'}}),cross),false);assert.equal(cross.code,403);
}));
test('missing configuration, unsupported methods and missing session-request header cannot mint sessions',()=>env(async()=>{
 let r=res();await workshopSessionHandler(req({method:'GET'}),r);assert.equal(r.code,405);
 r=res();await workshopSessionHandler(req({headers:{...req().headers,'x-vecta-workshop':''}}),r);assert.equal(r.code,403);
 delete process.env.VECTA_MAIN_PASSWORD;r=res();await workshopSessionHandler(req(),r);assert.equal(r.code,503);
}));
test('only server-owned app metadata authorises a short-lived token; concurrent calls share one exchange',()=>env(async()=>{
 let creates=0,signins=0,issuedEmail='',created=false;
 const issue=createWorkshopSessionIssuer((url,key,options)=>{
  assert.equal(options.auth.persistSession,false);
  if(key==='private-test-key')return {auth:{admin:{async createUser(input){creates++;issuedEmail=input.email;assert.equal(input.email_confirm,true);assert.equal(input.app_metadata.vecta_access,'workshop');assert.ok(input.password.length>40);created=true;return {data:{user:{id:'user-1'}}};}}}};
  assert.equal(key,'public-test-key');return {auth:{async signInWithPassword(input){signins++;if(!created)return {error:{code:'invalid_credentials'}};assert.equal(input.email,issuedEmail);return {data:{session:{access_token:'signed-user-token',refresh_token:'never-return-this',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'user-1',email:input.email,app_metadata:{vecta_access:'workshop'}}}}};}}};
 });
 const results=await Promise.all([issue(),issue(),issue()]);assert.equal(creates,1);assert.equal(signins,2);
 assert.match(issuedEmail,/^workshop-[a-f0-9]{32}@vecta\.invalid$/);assert.equal(issuedEmail.includes('TestManager'),false);
 assert.equal(results[0].access_token,'signed-user-token');assert.equal(results[0].refresh_token,undefined);await issue();assert.equal(signins,2);
}));
test('user-editable metadata alone never authorises a session',()=>env(async()=>{
 const issue=createWorkshopSessionIssuer(()=>({auth:{signInWithPassword:async({email})=>({data:{session:{access_token:'untrusted',expires_at:Math.floor(Date.now()/1000)+3600,user:{email,app_metadata:{},user_metadata:{vecta_access:'workshop'}}}}})}}));
 await assert.rejects(issue(),/could not be verified/);
}));
test('browser token exchange is memory-only, single-flight, and refreshes realtime auth',async()=>{
 const source=fs.readFileSync('public/js/vecta-workshop-access.js','utf8');let exchanges=0,creates=0,options,latestRealtime;
 const root={navigator:{onLine:true},addEventListener(){},fetch:async(url,init)=>{exchanges++;assert.equal(url,'/api/supabase-config?action=session');assert.equal(init.credentials,'same-origin');assert.equal(init.headers['X-Vecta-Workshop'],'1');return {ok:true,json:async()=>({access_token:'limited-token',expires_at:Math.floor(Date.now()/1000)+3600})};},supabase:{createClient(url,key,o){creates++;options=o;return {realtime:{setAuth(t){latestRealtime=t;}}};}}};
 vm.runInNewContext(source,{window:root,setTimeout:()=>1,clearTimeout(){},AbortSignal,Date,Map,Number,Error});
 const first=root.VectaWorkshopAccess.createClient('https://example.supabase.co','public-key');assert.equal(root.VectaWorkshopAccess.createClient('https://example.supabase.co','public-key'),first);assert.equal(creates,1);
 assert.deepEqual(await Promise.all([options.accessToken(),options.accessToken()]),['limited-token','limited-token']);assert.equal(exchanges,1);assert.equal(latestRealtime,'limited-token');
 assert.doesNotMatch(source,/localStorage|refresh_token|service_role/);
});
test('data-bearing app chunks are protected while public booking and artwork remain public',()=>{
 assert.equal(requiresManagerLogin('/assets/vecta-inline-20-anyhash.js'),true);
 assert.equal(requiresManagerLogin('/assets/vecta-header.png'),false);
 assert.equal(requiresManagerLogin('/booking'),false);
});
test('workshop SDK reads require a fresh network response and reject stale fallbacks',async()=>{
 let options,seen;
 const root={addEventListener(){},supabase:{createClient(u,k,o){options=o;return {}}},fetch:async(input,init)=>{seen=init.headers;return new Response('[]',{headers:{'X-Vecta-Data-State':'stale'}})}};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-workshop-access.js','utf8'),{window:root,setTimeout:()=>1,clearTimeout(){},AbortSignal,Headers,Date,Map,Number,Error});root.VectaWorkshopAccess.createClient('https://example.supabase.co','public-key');
 await assert.rejects(options.global.fetch('https://example.supabase.co/rest/v1/invoices',{headers:{apikey:'public-key'}}),/Cloud data is offline/);assert.equal(seen.get('X-Vecta-Require-Fresh'),'1');assert.equal(seen.get('apikey'),'public-key');
});
