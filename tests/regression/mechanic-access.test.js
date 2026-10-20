import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mechanicAuthorised,mechanicCookie,mechanicGate} from '../../lib/mechanic-auth.js';
import middleware,{managerGate,validManagerSession,managerSessionCookie} from '../../middleware.js';
import {requireWorkshopLogin} from '../../lib/workshop-access.js';
const credentials={user:'mechanic',password:'test-only-mechanic-password'};
const manager={user:'manager',password:'different-manager-password'};
const basic=c=>'Basic '+Buffer.from(c.user+':'+c.password).toString('base64');
const response=()=>({code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}});
async function env(mode,run){
 const values={VERCEL_ENV:mode,VECTA_MECHANIC_USER:credentials.user,VECTA_MECHANIC_PASSWORD:credentials.password,VECTA_MAIN_USER:manager.user,VECTA_MAIN_PASSWORD:manager.password};
 const before={};for(const [k,v] of Object.entries(values)){before[k]=process.env[k];process.env[k]=v;}
 try{return await run();}finally{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
test('mechanic cookies and credentials cannot authorise Main',async()=>{
 const request=new Request('https://main.test/index.html',{headers:{authorization:basic(credentials)}});
 assert.equal(managerGate(request,manager).status,401);
 assert.equal(await mechanicAuthorised(new Request('https://test/',{headers:{authorization:basic(manager)}}),credentials),false);
 assert.equal(await validManagerSession(new Request('https://main.test/',{headers:{cookie:await mechanicCookie(credentials)}}),manager),false);
 assert.equal(await mechanicAuthorised(new Request('https://test/',{headers:{cookie:await managerSessionCookie(manager)}}),credentials),false);
});
test('mechanic sessions reject tampering, expiry, duplicates and password rotation',async()=>{
 const now=Date.now(),cookie=await mechanicCookie(credentials,now),request=c=>new Request('https://test/',{headers:{cookie:c}});
 assert.equal(await mechanicAuthorised(request(cookie),credentials,now),true);
 assert.equal(await mechanicAuthorised(request(cookie.replace('v1.','v2.')),credentials,now),false);
 assert.equal(await mechanicAuthorised(request(cookie+'; '+cookie),credentials,now),false);
 assert.equal(await mechanicAuthorised(request(cookie),credentials,now+31*86400000),false);
 assert.equal(await mechanicAuthorised(request(cookie),{...credentials,password:'rotated'},now),false);
 assert.equal((await mechanicGate(request(''),{})).status,503);
});
test('both existing mechanics aliases open the current root planner with a separate login',()=>env('production',async()=>{
 for(const host of ['vecta-mechanic-dashboard.vercel.app','vecta-mechanic-dashboard-vectaplanner.vercel.app']){
  const denied=await middleware(new Request('https://'+host+'/',{headers:{authorization:basic(manager)}}));assert.equal(denied.status,401);assert.match(denied.headers.get('WWW-Authenticate'),/VECTA Mechanics/);
  const allowed=await middleware(new Request('https://'+host+'/',{headers:{authorization:basic(credentials)}}));assert.equal(allowed.status,200);assert.match(allowed.headers.get('Set-Cookie'),/__Host-vecta-mechanic=/);assert.equal(allowed.headers.get('X-Vecta-Manager-Authenticated'),'1');
 }
}));
test('production Main HTML, extracted code and APIs reject mechanics identity',()=>env('production',async()=>{
 const cookie=await mechanicCookie(credentials);
 for(const path of ['/','/index.html','/mechanic.html','/assets/vecta-inline-06-test.js']){
  const result=await middleware(new Request('https://vecta-planner.vercel.app'+path,{headers:{authorization:basic(credentials),cookie}}));assert.equal(result.status,401);
 }
 const res=response();assert.equal(await requireWorkshopLogin({method:'GET',headers:{host:'vecta-planner.vercel.app',authorization:basic(credentials),cookie}},res),false);assert.equal(res.code,401);
 const main=await middleware(new Request('https://vecta-planner.vercel.app/',{headers:{authorization:basic(manager)}}));assert.equal(main.status,200);
}));
test('the established mechanics SDK can authenticate and save through its own host',()=>env('production',async()=>{
 for(const login of [{authorization:basic(credentials)},{cookie:await mechanicCookie(credentials)}]){
  assert.equal(await requireWorkshopLogin({method:'POST',headers:{host:'vecta-mechanic-dashboard.vercel.app',origin:'https://vecta-mechanic-dashboard.vercel.app',...login}},response()),true);
 }
 const denied=response();assert.equal(await requireWorkshopLogin({method:'POST',headers:{host:'vecta-mechanic-dashboard.vercel.app',authorization:basic(credentials),origin:'https://attacker.test'}},denied),false);assert.equal(denied.code,403);
 const main=response();assert.equal(await requireWorkshopLogin({method:'GET',headers:{host:'vecta-mechanic-dashboard.vercel.app',authorization:basic(manager)}},main),false);assert.equal(main.code,401);
}));
test('Preview opens the existing planner and code through mechanics cookie without opening Main entry',()=>env('preview',async()=>{
 const cookie=await mechanicCookie(credentials);
 for(const path of ['/mechanic.html','/assets/vecta-inline-06-test.js']){
  const result=await middleware(new Request('https://preview.test'+path,{headers:{cookie}}));assert.equal(result.status,200);
 }
 assert.equal((await middleware(new Request('https://preview.test/',{headers:{cookie}}))).status,401);
 assert.equal(await requireWorkshopLogin({method:'POST',headers:{host:'preview.test',origin:'https://preview.test',cookie}},response()),true);
}));
test('the replacement interface and limited API have been removed',()=>{
 for(const path of ['public/mechanic.html','public/js/mechanic-app.js','public/js/mechanic-app.css','lib/mechanic-jobs.js'])assert.equal(fs.existsSync(path),false,path);
 assert.doesNotMatch(fs.readFileSync('api/supabase-config.js','utf8'),/createMechanicHandler/);
 assert.doesNotMatch(fs.readFileSync('vercel.json','utf8'),/\/api\/mechanic/);
});

test('mechanics HTML is rewritten to the dedicated recovered entry and cannot load Main chunks',()=>env('production',async()=>{
 const headers={authorization:basic(credentials)};
 for(const path of ['/','/index.html','/invoices']){
  const result=await middleware(new Request('https://vecta-mechanic-dashboard.vercel.app'+path,{headers}));
  assert.equal(new URL(result.headers.get('x-middleware-rewrite')).pathname,'/mechanic.html');
 }
 assert.equal((await middleware(new Request('https://vecta-mechanic-dashboard.vercel.app/assets/vecta-inline-06-main.js',{headers}))).status,403);
 assert.equal((await middleware(new Request('https://vecta-mechanic-dashboard.vercel.app/assets/vecta-inline-mechanic-06-app.js',{headers}))).status,200);
}));
