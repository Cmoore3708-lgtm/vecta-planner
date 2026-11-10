import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {emailPortalEntry,allowPortalEntry,portalEntryOrigin,portalEntryAcknowledgement} from '../../lib/portal-entry.js';
import {verifyProgressToken,progressSecret,claimMatchesJob,requestProgressSecret,requestProgressJob} from '../../lib/job-progress.js';
import handler from '../../lib/job-progress-handler.js';

const now=Date.parse('2026-11-10T10:15:00Z'),id='12345678-1234-4234-8234-123456789012';
const job={id,registration:'AB12 CDE',customer_email:'Driver@example.com',booking_date:'2026-11-11',status:'booked',created_at:'2026-11-09T12:00:00Z',customer_note:'private workshop notes'};
function environment(patch={}){
  const config={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',RESEND_API_KEY:'test-email-key',...patch};
  const old=Object.fromEntries(Object.keys(config).map(key=>[key,process.env[key]]));Object.assign(process.env,config);
  return ()=>{for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;};
}
function database(jobs=[job],requests=[]){
  return async path=>{
    const [table,query]=path.split('?'),params=new URLSearchParams(query);
    if(table==='jobs')return params.has('id')?jobs.filter(row=>row.id===params.get('id').slice(3)):jobs;
    if(table==='website_booking_requests')return requests;
    throw Error('Unexpected database action: '+path);
  };
}
async function recover(jobs=[job],requests=[]){
  const sent=[];const result=await emailPortalEntry(database(jobs,requests),'AB12CDE',{now,send:async(...args)=>sent.push(args)});return {sent,result};
}
test('recovery sends a bound private link only to the saved customer and returns no customer data',async()=>{
  const restore=environment();try{
    const {sent,result}=await recover();assert.equal(result,undefined);assert.equal(sent.length,1);
    const [context,text,,from,content]=sent[0];assert.deepEqual(context.to,['driver@example.com']);assert.equal(from,'chris@vectamotors.co.uk');
    const url=text.match(/https:\/\/www\.vectamotors\.co\.uk\/track#(\S+)/);assert.ok(url);
    assert.ok(claimMatchesJob(verifyProgressToken(url[1],progressSecret(),now),job,now));
    assert.doesNotMatch(text,/private workshop notes/);assert.ok(content.html.includes(url[0]));
    assert.deepEqual(Object.keys(portalEntryAcknowledgement),['ok','message']);assert.doesNotMatch(JSON.stringify(portalEntryAcknowledgement),/driver@example|track#|AB12CDE/);
  }finally{restore();}
});
test('unknown, inexact, cancelled, provisional, expired, deleted, and ambiguous bookings send nothing',async()=>{
  const restore=environment();try{
    for(const records of [[],[{...job,registration:'AXB12CDE'}],[{...job,customer_email:''}],[{...job,customer_email:'x@example.com,y@example.com'}],[{...job,status:'quote'}],[{...job,status:'cancelled'}],[{...job,status:'provisional'}],[{...job,archived:true}],[{...job,no_vehicle:true}],[{...job,customer_note:'[[VECTA_SOFT_DELETE:2026]]'}],[{...job,booking_date:'2026-11-02'}],[job,{...job,id:'22345678-1234-4234-8234-123456789012',customer_email:'other@example.com'}]])assert.equal((await recover(records)).sent.length,0);
  }finally{restore();}
});
test('chooses today before future and retained past bookings, without using an older owner',async()=>{
  const restore=environment();try{
    const past={...job,id:'22345678-1234-4234-8234-123456789012',booking_date:'2026-11-09',status:'completed',archived:true};
    const today={...job,id:'32345678-1234-4234-8234-123456789012',booking_date:'2026-11-10',customer_email:'today@example.com'};
    assert.deepEqual((await recover([past,job,today])).sent[0][0].to,['today@example.com']);
    assert.equal((await recover([past,job])).sent[0][0].job.id,job.id);
    assert.equal((await recover([past])).sent.length,1);
    assert.equal((await recover([past,{...job,customer_email:''}])).sent.length,0);
  }finally{restore();}
});
test('pending website bookings receive the existing private receipt; stale linked contacts cannot recover it',async()=>{
  const restore=environment();try{
    const request={id:'42345678-1234-4234-8234-123456789012',registration:job.registration,email:job.customer_email,preferred_date_1:job.booking_date,status:'awaiting_review'};
    const {sent}=await recover([], [request]);assert.equal(sent.length,1);
    const token=sent[0][1].match(/\/track#request\.(\S+)/)[1];assert.ok(claimMatchesJob(verifyProgressToken(token,requestProgressSecret(),now),requestProgressJob(request),now));
    const provisional={...job,status:'provisional',customer_note:'[[VECTA_WEB_DETAILS:xyz]]'};
    assert.equal((await recover([provisional],[{...request,job_id:job.id}])).sent.length,1);
    assert.equal((await recover([{...provisional,customer_email:'new@example.com'}],[{...request,job_id:job.id}])).sent.length,0);
    assert.equal((await recover([],[{...request,job_id:job.id}])).sent.length,0);
    assert.equal((await recover([job],[{...request,job_id:job.id}])).sent.length,1);
  }finally{restore();}
});
test('concurrent repeats reserve one durable email and use provider idempotency',async()=>{
  const restore=environment(),original=global.fetch;let record=null,sends=0;
  global.fetch=async(url,options={})=>{
    if(String(url)==='https://api.resend.com/emails'){
      sends++;assert.equal(options.headers['Idempotency-Key'],record.id);assert.match(record.id,/^portal-access:/);
      return Response.json({id:'provider-id'});
    }
    assert.ok(String(url).includes('/nmuk_service_reminder_sends'));
    if(options.method==='POST'){
      if(record)return Response.json({error:'duplicate'},{status:409});record={...JSON.parse(options.body),created_at:new Date().toISOString()};return Response.json(null);
    }
    if(options.method==='PATCH'){Object.assign(record,JSON.parse(options.body));return Response.json(null);}
    return Response.json(record?[record]:[]);
  };
  try{
    await Promise.all(Array.from({length:5},()=>emailPortalEntry(database(),'AB12CDE',{now})));
    await emailPortalEntry(database(),'AB12CDE',{now:now+1000});
    assert.equal(sends,1);assert.equal(record.status,'sent');
    assert.equal(record.recipient,'driver@example.com');
  }finally{global.fetch=original;restore();}
});
test('public entry enforces browser origin and request limits, and Test never sends',async()=>{
  assert.equal(portalEntryOrigin({headers:{host:'www.vectamotors.co.uk',origin:'https://www.vectamotors.co.uk','sec-fetch-site':'same-origin'}}),true);
  assert.equal(portalEntryOrigin({headers:{host:'vecta-planner.vercel.app',origin:'https://www.vectamotors.co.uk','sec-fetch-site':'same-origin'}}),true);
  for(const headers of [{host:'www.vectamotors.co.uk'},{host:'www.vectamotors.co.uk',origin:'https://evil.example'},{host:'www.vectamotors.co.uk',origin:'https://www.vectamotors.co.uk','sec-fetch-site':'cross-site'}])assert.equal(portalEntryOrigin({headers}),false);
  for(let i=0;i<5;i++)assert.equal(allowPortalEntry('test-ip',now),true);assert.equal(allowPortalEntry('test-ip',now),false);assert.equal(allowPortalEntry('test-ip',now+600000),true);
  const restore=environment({VERCEL_ENV:'preview'});let calls=0;
  try{
    await emailPortalEntry(async()=>{calls++;},'AB12CDE',{send:async()=>{calls++;}});assert.equal(calls,0);
    const response={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await handler({method:'POST',headers:{host:'preview.example',origin:'https://preview.example','content-type':'application/json'},body:{action:'portal-entry',registration:'AB12CDE',email:'attacker@example.com'}},response);
    assert.equal(response.code,409);assert.match(response.data.error,/preview/);
  }finally{restore();}
});

function browser(request){
  const {document,window}=parseHTML(fs.readFileSync('website/index.html','utf8'));
  const dialog=document.getElementById('portalEntryDialog'),form=document.getElementById('portalEntryForm'),input=document.getElementById('portalRegistration');
  dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};form.reset=()=>{input.value='';};
  vm.runInNewContext(fs.readFileSync('website/js/vecta-portal-entry.js','utf8'),{document,fetch:request,AbortController,setTimeout,clearTimeout});
  const click=id=>document.getElementById(id).dispatchEvent(new window.Event('click',{cancelable:true}));
  const submit=()=>form.dispatchEvent(new window.Event('submit',{cancelable:true}));
  return {document,dialog,input,click,submit,button:document.getElementById('portalEntrySubmit'),status:document.getElementById('portalEntryStatus')};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('homepage entry sits above recruitment and always opens a blank plate independently of booking forms',async()=>{
  const b=browser(async()=>{throw Error('not expected');});const {document,input}=b;
  assert.ok(fs.readFileSync('website/index.html','utf8').indexOf('id="customerPortalEntry"')<fs.readFileSync('website/index.html','utf8').indexOf('id="mechanicRecruitment"'));
  assert.equal(input.getAttribute('placeholder'),null);assert.equal(input.classList.contains('bookingRegInput'),false);
  document.getElementById('footerRegistration').value='OTHER';b.click('portalEntryLink');assert.equal(b.dialog.open,true);assert.equal(input.value,'');
  input.value='AB12CDE';b.click('portalEntryClose');b.click('portalEntryLink');assert.equal(input.value,'');
  assert.deepEqual(fs.readFileSync('website/js/vecta-portal-entry.js'),fs.readFileSync('public/js/vecta-portal-entry.js'));
});
test('Enter sends normalised registration once; success never reveals or navigates to private data',async()=>{
  let calls=0,resolve;const b=browser((url,options)=>{calls++;assert.equal(url,'/api/job-progress');assert.deepEqual(JSON.parse(options.body),{action:'portal-entry',registration:'AB12CDE'});return new Promise(r=>resolve=r);});
  b.click('portalEntryLink');b.input.value='ab12 cde';b.submit();b.submit();assert.equal(calls,1);assert.equal(b.button.disabled,true);
  resolve({ok:true,json:async()=>portalEntryAcknowledgement});await tick();assert.equal(b.status.textContent,portalEntryAcknowledgement.message);assert.equal(b.button.disabled,true);
});
test('validation, unavailable email service, and closed-dialog races leave a usable blank entry',async()=>{
  let resolve,calls=0;const b=browser(()=>{calls++;return new Promise(r=>resolve=r);});
  b.click('portalEntryLink');b.input.value='A';b.submit();assert.equal(calls,0);assert.match(b.status.textContent,/registration/);
  b.input.value='AB12CDE';b.submit();resolve({ok:false,json:async()=>({error:'Please try again later.'})});await tick();assert.equal(b.button.disabled,false);assert.equal(b.status.textContent,'Please try again later.');
  b.submit();b.click('portalEntryClose');b.click('portalEntryLink');resolve({ok:true,json:async()=>portalEntryAcknowledgement});await tick();assert.equal(b.input.value,'');assert.equal(b.status.textContent,'');assert.equal(b.button.disabled,false);
});
