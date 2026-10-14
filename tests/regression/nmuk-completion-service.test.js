import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{completionSignatureHtml,completionSender} from '../../lib/nmuk-completion-email.js';
import {managerSessionCookie} from '../../middleware.js';
const jobId='11111111-1111-4111-8111-111111111111';
async function setup(){
 const keys=['VECTA_MAIN_USER','VECTA_MAIN_PASSWORD','RESEND_API_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VERCEL_ENV'];
 const env=Object.fromEntries(keys.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
 Object.assign(process.env,{VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'test-password',RESEND_API_KEY:'test-key',SUPABASE_SERVICE_ROLE_KEY:'test-db',VITE_SUPABASE_URL:'https://mock.invalid',VERCEL_ENV:'production'});
 const cookie=(await managerSessionCookie({user:'manager',password:'test-password'})).split(';')[0];
 const state={job:{id:jobId,registration:'MTC 2',vehicle:'Nissan NV200',customer_name:'NMUK',status:'completed',archived:true,completed_at:'2026-10-14T10:00:00Z'},contact:'jane.smith@example.com',subtype:'Internal',domain:'verified',record:null,sends:[],providerStatus:200,timeout:false,failAudit:false};
 const result=(data,status=200)=>({ok:status<300,status,json:async()=>data});
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('/jobs?'))return result([state.job]);
  if(url.includes('/workshop_settings?'))return result([{id:'jobcustomer:'+jobId,value:{customer_account:'NMUK',nmuk_vehicle_type:state.subtype}},{id:'fleet_state_v77',value:{vehicles:[{registration:'MTC2',model:'Nissan NV200',contactEmail:state.contact,nmukType:'Internal'}]}}]);
  if(url==='https://api.resend.com/domains')return result({data:[{name:'nissan-fleet.co.uk',status:state.domain,capabilities:{sending:'enabled'}}]});
  if(url==='https://api.resend.com/emails'){state.sends.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});if(state.timeout)throw Error('Timed out');return result(state.providerStatus===200?{id:'provider-id'}:{message:'Sender rejected'},state.providerStatus);}
  if(url.includes('/nmuk_service_reminder_sends')){
   if(!options.method)return result(state.record?[state.record]:[]);
   if(options.method==='POST'){if(state.record)return result({},409);state.record={...JSON.parse(options.body),created_at:new Date().toISOString()};return result([]);}
   if(options.method==='PATCH'){const patch=JSON.parse(options.body);if(state.failAudit&&patch.status==='sent')throw Error('Database unavailable');if(url.includes('status=eq.failed')&&state.record.status!=='failed')return result([]);Object.assign(state.record,patch);return result([state.record]);}
  }
  throw Error('Unexpected fetch '+url);
 };
 const run=async(body,changes={})=>{let status,data;await handler({method:'POST',headers:{host:'vecta.example',origin:'https://vecta.example','content-type':'application/json',cookie},body,...changes},{setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}});return {status,data};};
 return {state,run,cleanup(){globalThis.fetch=originalFetch;for(const [k,v] of Object.entries(env))if(v===undefined)delete process.env[k];else process.env[k]=v;}};
}
test('authenticated review is read-only; fixed sender, fleet first name/model and escaped HTML signature',async()=>{
 const {state,run,cleanup}=await setup();try{
  const draft=await run({action:'draft',job_id:jobId});assert.equal(draft.status,200);assert.equal(draft.data.from,completionSender);assert.equal(draft.data.body,'Hi Jane.\n\nYour Nissan NV200 is complete and ready to pick up from our Workshop.');assert.equal(draft.data.signature_html,completionSignatureHtml);assert.equal(state.sends.length,0);assert.equal(state.record,null);
  state.domain='not_started';assert.equal((await run({action:'draft',job_id:jobId})).data.ready,false);
 }finally{cleanup();}
});
test('send ignores client sender/recipient/signature, fixes Reply-To and logs once across repeated sends',async()=>{
 const {state,run,cleanup}=await setup();try{
  const {data:draft}=await run({action:'draft',job_id:jobId});
  const request={action:'send',job_id:jobId,token:draft.token,subject:'Ready to collect',body:'Hi Jane.\n\nYour <NV200> is ready.',from:'attacker@example.com',to:['wrong@example.com'],signature_html:'bad'};
  const sent=await run(request);assert.equal(sent.status,200);assert.equal(sent.data.accepted,true);assert.equal(state.record.status,'sent');assert.equal((await run(request)).data.already_sent,true);assert.equal(state.sends.length,1);
  const payload=state.sends[0].payload;assert.equal(payload.from,completionSender);assert.equal(payload.reply_to,completionSender);assert.deepEqual(payload.to,['jane.smith@example.com']);assert.match(payload.html,/&lt;NV200&gt;/);assert.ok(payload.html.endsWith(completionSignatureHtml));assert.match(state.sends[0].key,/^completion:/);
 }finally{cleanup();}
});
test('auth, CSRF, live completion, subtype, contact changes and signed token are enforced before sending',async()=>{
 const {state,run,cleanup}=await setup();try{
  assert.equal((await run({action:'draft',job_id:jobId},{headers:{host:'vecta.example',origin:'https://vecta.example','content-type':'application/json'}})).status,401);
  assert.equal((await run({}, {method:'GET'})).status,405);
  assert.equal((await run({}, {headers:{host:'vecta.example',origin:'https://bad.example','content-type':'application/json'}})).status,403);
  state.job.status='booked';assert.equal((await run({action:'draft',job_id:jobId})).status,409);state.job.status='completed';
  state.subtype='MVOS';assert.equal((await run({action:'draft',job_id:jobId})).status,400);state.subtype='Internal';
  const {data:draft}=await run({action:'draft',job_id:jobId}),request={action:'send',job_id:jobId,token:draft.token,subject:draft.subject,body:draft.body};
  assert.equal((await run({...request,token:'tampered'})).status,409);state.contact='other@example.com';assert.equal((await run(request)).status,409);assert.equal(state.sends.length,0);
 }finally{cleanup();}
});
test('provider rejection can retry the original payload; uncertain timeout blocks duplicate send',async()=>{
 const {state,run,cleanup}=await setup();try{
  const {data:draft}=await run({action:'draft',job_id:jobId}),request={action:'send',job_id:jobId,token:draft.token,subject:draft.subject,body:draft.body};
  state.providerStatus=403;assert.equal((await run(request)).status,502);assert.equal(state.record.status,'failed');
  assert.equal((await run({...request,body:'Different message'})).status,409);assert.equal(state.sends.length,1);
  state.providerStatus=200;assert.equal((await run(request)).data.accepted,true);assert.equal(state.sends.length,2);assert.equal(state.sends[0].key,state.sends[1].key);
  state.record=null;state.timeout=true;assert.equal((await run(request)).status,409);assert.equal(state.record.status,'pending');assert.equal((await run(request)).status,409);assert.equal(state.sends.length,3);
 }finally{cleanup();}
});
test('send log failure never misreports a provider-accepted email as unsent',async()=>{
 const {state,run,cleanup}=await setup();try{
  const {data:draft}=await run({action:'draft',job_id:jobId});state.failAudit=true;
  const sent=await run({action:'send',job_id:jobId,token:draft.token,subject:draft.subject,body:draft.body});assert.equal(sent.data.accepted,true);assert.equal(sent.data.audit_pending,true);assert.equal(state.record.status,'pending');assert.equal(state.sends.length,1);
 }finally{cleanup();}
});

test('concurrent requests reserve one send and expired drafts never send',async()=>{
 const {state,run,cleanup}=await setup();try{
  const {data:draft}=await run({action:'draft',job_id:jobId}),request={action:'send',job_id:jobId,token:draft.token,subject:draft.subject,body:draft.body};
  const clock=Date.now;try{Date.now=()=>clock()+901000;assert.equal((await run(request)).status,409);}finally{Date.now=clock;}
  const results=await Promise.all([run(request),run(request)]);assert.equal(state.sends.length,1);assert.ok(results.some(r=>r.data.accepted));
 }finally{cleanup();}
});

test('review and Send work end to end through the browser request and real API handler, with only provider transport mocked',async()=>{
 const {state,run,cleanup}=await setup();try{
  const [{parseHTML},vm,fs]=await Promise.all([import('linkedom'),import('node:vm'),import('node:fs')]);
  const {document}=parseHTML('<html><body><div id="jobModal"></div></body></html>'),html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const ctx={document,AbortSignal,esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),closeModals:()=>{},fetch:async(url,options)=>{assert.equal(url,'/api/fleet-nightly-refresh?task=completion-email');assert.equal(options.credentials,'same-origin');const response=await run(JSON.parse(options.body));return {ok:response.status===200,json:async()=>response.data};}};
  vm.createContext(ctx);
  for(const name of ['nmukCompletionRequest','openNmukCompletionDraft']){const start=html.indexOf('async function '+name+'('),end=html.indexOf('\n}',start)+2;vm.runInContext(html.slice(start,end),ctx);}
  await ctx.openNmukCompletionDraft(jobId);assert.equal(state.sends.length,0);assert.match(document.getElementById('completionEmailMessage').value,/Hi Jane/);
  await document.getElementById('sendCompletionEmail').onclick();assert.equal(state.sends.length,1);assert.equal(state.record.status,'sent');assert.match(document.getElementById('completionEmailResult').textContent,/submitted successfully from chris@nissan-fleet.co.uk/);assert.equal(document.getElementById('sendCompletionEmail').disabled,true);
 }finally{cleanup();}
});
