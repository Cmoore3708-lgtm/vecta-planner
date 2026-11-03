import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {issueProgressToken,verifyProgressToken,claimMatchesJob,progressSnapshot,trackable,trackingUrl,progressSecret,londonDay} from '../../lib/job-progress.js';
import handler,{customerStatus,startWork,sendInvoice} from '../../lib/job-progress-handler.js';
import {requiresManagerLogin} from '../../middleware.js';

const now=Date.parse('2026-11-03T11:00:00Z'),id='12345678-1234-4234-8234-123456789012';
const job={id,booking_date:'2026-11-03',registration:'CM14 KEL',vehicle:'Nissan Qashqai',customer_email:'driver@example.com',customer_name:'Driver',customer_account:'Staff',status:'booked',archived:false,updated_at:'2026-11-03T08:00:00Z',customer_note:'Private notes',amount_quoted:300};
test('private links reject tampering and expiry, and are bound to one booking and customer',()=>{
  const token=issueProgressToken(job,'secret',now),claim=verifyProgressToken(token,'secret',now);
  assert.ok(claimMatchesJob(claim,job));
  for(const patch of [{id:'22345678-1234-4234-8234-123456789012'},{booking_date:'2026-11-04'},{registration:'OTHER'},{customer_email:'someone@example.com'}])assert.equal(claimMatchesJob(claim,{...job,...patch}),false);
  assert.equal(verifyProgressToken(token+'x','secret',now),null);assert.equal(verifyProgressToken(token,'other',now),null);
  assert.equal(verifyProgressToken(token,'secret',now+10*86400000),null);
  const payload=Buffer.from(token.split('.')[0],'base64url').toString();assert.doesNotMatch(payload,/driver@example|CM14|Private notes/);
  assert.match(trackingUrl(job,{secret:'secret',now}),/^https:\/\/www.vectamotors.co.uk\/track#/);
});
test('quotes, tasks, tax, cancelled and deleted records cannot be tracked',()=>{
  for(const patch of [{status:'quote'},{status:'cancelled'},{status:'deleted'},{deleted_at:'2026-11-03'},{no_vehicle:true},{card_type:'mini_task'},{job_type:'Vehicle Tax'},{customer_note:'[[VECTA_SOFT_DELETE:abc]]'}])assert.equal(trackable({...job,...patch}),false,JSON.stringify(patch));
});
test('statuses distinguish mechanic completion from readiness; reopening removes readiness',()=>{
  const stage=status=>progressSnapshot({...job,status},{account:'Staff',now});
  assert.equal(stage('booked').stage,'waiting');assert.equal(stage('in_progress').stage,'underway');
  assert.equal(stage('work_complete').stage,'checking');assert.match(stage('work_complete').description,/Please wait/);
  assert.equal(stage('ready_to_invoice').stage,'ready');assert.match(stage('completed').title,/payment/);
  assert.doesNotMatch(progressSnapshot({...job,status:'completed'},{account:'NMUK',now}).title,/payment/);
  assert.equal(stage('booked').stage,'waiting');
  assert.equal(progressSnapshot({...job,booking_date:'2026-11-04'},{now}).stage,'scheduled');
  assert.deepEqual(Object.keys(stage('booked')).sort(),['booking_date','description','registration','stage','title','updated_at','vehicle']);
  assert.equal(londonDay(Date.parse('2026-07-01T23:30:00Z')),'2026-07-02');
});
function environment(){
  const names=['VERCEL_ENV','VERCEL_PROJECT_NAME','VERCEL_PROJECT_PRODUCTION_URL','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VECTA_MAIN_USER','VECTA_MAIN_PASSWORD'];
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'password'});
  return ()=>{for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;};
}
test('public status returns only the selected booking, never contacts or financial data',async()=>{
  const restore=environment(),original=global.fetch,calls=[];
  global.fetch=async url=>{calls.push(String(url));return Response.json(String(url).includes('workshop_settings')?[{value:{customer_account:'Staff'}}]:[job]);};
  try{
    const token=issueProgressToken(job,progressSecret(),now),data=await customerStatus(token,now);
    assert.equal(data.registration,'CM14 KEL');assert.doesNotMatch(JSON.stringify(data),/driver@example|Private notes|300|customer_name|service-key/);
    assert.equal(calls.length,2);assert.ok(calls[0].includes(encodeURIComponent(id)));
    calls.length=0;await assert.rejects(customerStatus('invalid',now));assert.equal(calls.length,0);
  }finally{global.fetch=original;restore();}
});
test('mechanic start uses a conditional update of exactly the observed booking',async()=>{
  const restore=environment(),original=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url:new URL(url),options};return Response.json([{id,status:'in_progress',updated_at:new Date(now).toISOString()}]);};
  try{
    assert.equal((await startWork(job,now)).started,true);
    assert.equal(seen.url.searchParams.get('id'),'eq.'+id);assert.equal(seen.url.searchParams.get('status'),'eq.booked');assert.equal(seen.url.searchParams.get('updated_at'),'eq.'+job.updated_at);
    assert.deepEqual(JSON.parse(seen.options.body),{status:'in_progress',updated_at:new Date(now).toISOString()});
    for(const patch of [{status:'work_complete'},{status:'completed'},{booking_date:'2026-11-04'},{booking_date:'2026-11-02'},{archived:true}])assert.equal((await startWork({...job,...patch},now)).started,false);
    global.fetch=async()=>Response.json([]);await assert.rejects(startWork(job,now),/another device/);
  }finally{global.fetch=original;restore();}
});
test('public callers cannot issue links, start jobs or send invoices',async()=>{
  const restore=environment(),original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected database call');};
  try{
    for(const action of ['link','start','send-invoice']){
      const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
      await handler({method:'POST',headers:{host:'planner.example','content-type':'application/json'},body:{action,job_id:id}},res);
      assert.equal(res.code,401,action);
    }
    assert.equal(calls,0);
    assert.equal(requiresManagerLogin('/track'),false);assert.equal(requiresManagerLogin('/track.html'),false);assert.equal(requiresManagerLogin('/index.html'),true);
  }finally{global.fetch=original;restore();}
});
test('tracking page clears invoice links on reopening and pauses while hidden',async()=>{
  const html=fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'),script=fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8');
  const {document,window}=parseHTML(html);document.hidden=false;
  const events={},timers=[];let data={registration:'CM14 KEL',vehicle:'Qashqai',booking_date:'2026-11-03',stage:'ready',title:'Ready',description:'Complete',invoice_url:'/invoice?token=abc'};
  const context={document,window:{addEventListener:(name,fn)=>events[name]=fn},location:{hash:'#token'},Intl,Date,AbortSignal,URL,Error,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
  vm.runInNewContext(script,context);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('paperwork').hidden,false);assert.equal(timers.at(-1).delay,60000);
  data={...data,stage:'underway',invoice_url:undefined};await document.getElementById('refresh').onclick();
  assert.equal(document.getElementById('paperwork').hidden,true);assert.equal(document.getElementById('invoice').hasAttribute('href'),false);
});
test('ready invoice email uses the saved total and is sent once across repeated requests',async()=>{
  const restore=environment(),original=global.fetch,oldKey=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='fake-test-key';
  const invoice={id:'invoice-1',job_id:id,registration:job.registration,status:'saved',invoice_number:'V123',total:312,lines:[]};
  let record=null,sends=0,payload;
  global.fetch=async(url,options={})=>{
    const path=String(url),method=options.method||'GET';
    if(path==='https://api.resend.com/emails'){sends++;payload=JSON.parse(options.body);return Response.json({id:'email-1'});}
    if(path.includes('/workshop_settings?'))return Response.json([{value:{customer_account:'Staff'}}]);
    if(path.includes('/invoices?'))return Response.json([invoice]);
    if(path.includes('/nmuk_service_reminder_sends')){
      if(method==='POST'){record=JSON.parse(options.body);return Response.json([record]);}
      if(method==='PATCH'){Object.assign(record,JSON.parse(options.body));return Response.json([record]);}
      return Response.json(record?[record]:[]);
    }
    throw Error('Unexpected request '+url);
  };
  try{
    const ready={...job,status:'completed'};
    assert.equal((await sendInvoice(ready)).accepted,true);
    assert.equal((await sendInvoice(ready)).already_sent,true);assert.equal(sends,1);
    assert.deepEqual(payload.to,['driver@example.com']);assert.equal(payload.from,'chris@vectamotors.co.uk');
    assert.match(payload.text,/£312\.00/);assert.match(payload.text,/https:\/\/www.vectamotors.co.uk\/invoice\?token=/);assert.doesNotMatch(payload.text,/Nissan Fleet Support/);
    assert.equal(record.status,'sent');
    await assert.rejects(sendInvoice({...job,status:'work_complete'}),/Confirm the completed work/);assert.equal(sends,1);
  }finally{global.fetch=original;restore();if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;}
});
test('Ready to invoice saves through existing invoice rules before requesting email',async()=>{
  const source=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
  const start=source.indexOf('async function vectaReadyInvoiceAndSend(job)'),end=source.indexOf('\n}',start)+2;
  const events=[],inv={id:'invoice-1'},context={savedInvoiceForJobId:()=>null,openInvoiceForJob:()=>{events.push('create');return inv;},saveInvoice:async()=>{events.push('save');return true;},app:{invoices:[inv]},vectaSendReadyInvoice:async()=>events.push('email')};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(await context.vectaReadyInvoiceAndSend(job),true);assert.deepEqual(events,['create','save','email']);
  events.length=0;context.saveInvoice=async()=>false;assert.equal(await context.vectaReadyInvoiceAndSend(job),false);assert.deepEqual(events,['create']);
  events.length=0;context.savedInvoiceForJobId=()=>inv;assert.equal(await context.vectaReadyInvoiceAndSend(job),true);assert.deepEqual(events,['email']);
});
