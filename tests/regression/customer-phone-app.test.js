import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createECDH,randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {appSubscription,sealAppToken,openAppToken,customerAppAction,runCustomerAppAlerts} from '../../lib/customer-app.js';
import {issueProgressToken,progressSecret} from '../../lib/job-progress.js';
import handler from '../../lib/job-progress-handler.js';

const now=Date.parse('2026-11-15T10:00:00Z');
const job={id:'12345678-1234-4234-8234-123456789012',registration:'AB12 CDE',customer_email:'driver@example.com',booking_date:'2026-11-15',status:'booked'};
function environment(patch={}){const values={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-key',...patch};const old={};for(const key in values){old[key]=process.env[key];process.env[key]=values[key];}return()=>{for(const key in values)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];};}
function subscription(){const ecdh=createECDH('prime256v1');return {endpoint:'https://web.push.apple.com/test',keys:{p256dh:ecdh.generateKeys().toString('base64url'),auth:randomBytes(16).toString('base64url')}};}
function database(){
 const state={job:{...job},rows:[],events:[],writes:[]};
 const db=async(path,options={})=>{
  const [table,query]=path.split('?'),params=new URLSearchParams(query),body=options.body?JSON.parse(options.body):null;
  if(table==='jobs')return state.job?[state.job]:[];
  if(table==='website_booking_requests')return [];
  if(table==='customer_portal_events')return state.events.filter(event=>BigInt(event.seq)>BigInt((params.get('seq')||'gt.0').slice(3))).sort((a,b)=>Number(b.seq)-Number(a.seq)).slice(0,1);
  assert.equal(table,'customer_app_subscriptions');
  const matches=row=>['id','token_hash','lease_id','next_check_at'].every(key=>!params.has(key)||params.get(key).startsWith('lte.')||String(row[key])===params.get(key).slice(3));
  if(options.method){state.writes.push({path,options});if(options.method==='POST'){state.rows=state.rows.filter(row=>row.id!==body.id);state.rows.push({...body});return [body];}if(options.method==='DELETE'){state.rows=state.rows.filter(row=>!matches(row));return [];}
   const selected=state.rows.filter(matches);selected.forEach(row=>Object.assign(row,body));return selected.map(row=>({...row}));}
  if(params.get('limit')==='0')return [];
  return state.rows.filter(matches).map(row=>({...row}));
 };
 return {db,state};
}
test('only real HTTPS push services and correctly sized keys can be registered',()=>{
 const value=subscription();assert.equal(appSubscription(value).endpoint,value.endpoint);
 for(const endpoint of ['https://localhost/a','https://127.0.0.1/a','https://web.push.apple.com.attacker.test/a','http://web.push.apple.com/a','https://web.push.apple.com:444/a','https://user@web.push.apple.com/a'])assert.throws(()=>appSubscription({...value,endpoint}));
 assert.throws(()=>appSubscription({...value,keys:{...value.keys,auth:'no'}}));
});
test('stored capability is authenticated encryption bound to this database',()=>{
 const restore=environment();try{const sealed=sealAppToken('private-link');assert.ok(!sealed.includes('private-link'));assert.equal(openAppToken(sealed),'private-link');const bytes=Buffer.from(sealed,'base64url');bytes[30]^=1;assert.throws(()=>openAppToken(bytes.toString('base64url')));}finally{restore();}
});
test('subscribe verifies private access, skips old messages and reopening preserves unread cursor',async()=>{
 const restore=environment();try{const {db,state}=database(),token=issueProgressToken(job,progressSecret(),now),sub=subscription();state.events=[{seq:5,kind:'message'}];
  await assert.rejects(customerAppAction(db,{action:'app-push-subscribe',token:'invalid',subscription:sub},{now}));assert.equal(state.rows.length,0);
  await customerAppAction(db,{action:'app-push-subscribe',token,subscription:sub},{now});assert.equal(state.rows[0].last_seq,'5');assert.notEqual(state.rows[0].token_encrypted,token);
  state.events.push({seq:6,kind:'message'});await customerAppAction(db,{action:'app-push-subscribe',token,subscription:sub},{now});assert.equal(state.rows[0].last_seq,'5');
 }finally{restore();}
});
test('messages and collection send once; start-work is silent; failures retain unread cursor',async()=>{
 const restore=environment();try{const {db,state}=database(),token=issueProgressToken(job,progressSecret(),now),sub=subscription(),sent=[];
  await customerAppAction(db,{action:'app-push-subscribe',token,subscription:sub},{now});const send=async(s,p)=>sent.push(p);
  state.job.status='in_progress';await runCustomerAppAlerts(db,{now,send});assert.equal(sent.length,0);
  state.events=[{seq:7,kind:'approval_request'}];await runCustomerAppAlerts(db,{now,send:async()=>{throw Error('temporary');}});assert.equal(state.rows[0].last_seq,'0');
  await runCustomerAppAlerts(db,{now,send});assert.equal(sent.length,1);assert.match(sent[0].body,/approval/);assert.equal(sent[0].url,'/app/home');assert.doesNotMatch(JSON.stringify(sent),/AB12|driver@|track#|private/);
  await runCustomerAppAlerts(db,{now,send});assert.equal(sent.length,1);
  state.job.status='completed';await runCustomerAppAlerts(db,{now,send});assert.equal(sent.length,2);assert.match(sent[1].body,/ready to collect/);
  await runCustomerAppAlerts(db,{now,send});assert.equal(sent.length,2);
 }finally{restore();}
});
test('changed customer, deleted/cancelled/expired booking and gone push service retire alerts',async()=>{
 const restore=environment();try{
  for(const mode of ['owner','deleted','cancelled','expired','gone']){
   const {db,state}=database(),token=issueProgressToken(job,progressSecret(),now);
   await customerAppAction(db,{action:'app-push-subscribe',token,subscription:subscription()},{now});state.events=[{seq:2,kind:'message'}];
   if(mode==='owner')state.job.customer_email='another@example.com';if(mode==='deleted')state.job=null;if(mode==='cancelled')state.job.status='cancelled';
   let calls=0;await runCustomerAppAlerts(db,{now:mode==='expired'?now+9*86400000:now,send:async()=>{calls++;throw Object.assign(Error('gone'),{statusCode:410});}});
   assert.equal(state.rows.length,0,mode);assert.equal(calls,mode==='gone'?1:0,mode);
  }
 }finally{restore();}
});
test('Test/preview never subscribes or sends and cross-origin app actions are refused',async()=>{
 const restore=environment({VERCEL_ENV:'preview'});try{
  let calls=0;assert.deepEqual(await runCustomerAppAlerts(async()=>{calls++;}),{disabled:true});assert.equal(calls,0);
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.code=s;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',headers:{'content-type':'application/json',origin:'https://attacker.test',host:'www.vectamotors.co.uk'},body:{action:'app-push-config',token:'x'}},res);assert.equal(res.code,403);
 }finally{restore();}
});
test('migration denies direct anonymous/authenticated access and allows service role',async()=>{
 const db=new PGlite();try{await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');await db.exec(fs.readFileSync('supabase/migrations/20261115190658_customer_phone_app.sql','utf8'));
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='customer_app_subscriptions'")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_table_privilege('${role}','public.customer_app_subscriptions','SELECT') as allowed`)).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('service_role','public.customer_app_subscriptions','INSERT') as allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
test('cold start restores a verified private link, accepts approval links and clears it on removal',()=>{
 const saved='abc.'+'a'.repeat(43),values=new Map([['vecta.customer-app.booking.v1',saved]]),location={hash:''};const replaced=[];
 const context={window:{},location,history:{replaceState(...args){replaced.push(args[2]);location.hash='#'+saved;}},localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},document:{documentElement:{classList:{toggle(){}}}}};
 vm.runInNewContext(fs.readFileSync('public/app/bootstrap.js','utf8'),context);assert.equal(replaced[0],'/app/booking#'+saved);
 assert.ok(context.window.VectaCustomerAppLink.valid('approval.'+job.id+'.'+job.id));context.window.VectaCustomerAppLink.clear();assert.equal(values.size,0);
});
test('manifest, website copies and worker keep customer data out of offline caches',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/app/manifest.webmanifest'));assert.equal(manifest.id,'/app/');assert.equal(manifest.start_url,'/app/home');assert.equal(manifest.scope,'/app/');assert.equal(manifest.display,'standalone');
 for(const name of ['vecta-header.jpg','home.html','booking.html','garage.js','garage.css','car-placeholder.svg','bootstrap.js','app.js','app.css','service-worker.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'])assert.ok(fs.readFileSync('public/app/'+name).equals(fs.readFileSync('website/app/'+name)),name);
 const handlers={},cacheWrites=[],context={self:{location:{origin:'https://www.vectamotors.co.uk'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Response,caches:{},fetch:()=>{throw Error('Should not cache private requests');}};
 vm.runInNewContext(fs.readFileSync('public/app/service-worker.js','utf8'),context);
 for(const [url,method] of [['/api/job-progress','POST'],['/invoice?token=private','GET'],['/app/?token=private','GET'],['/assets/private-photo.jpg','GET']])handlers.fetch({request:{url:'https://www.vectamotors.co.uk'+url,method},respondWith:()=>cacheWrites.push(url)});
 assert.deepEqual(cacheWrites,[]);
});
