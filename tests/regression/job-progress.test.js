import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {issueProgressToken,verifyProgressToken,claimMatchesJob,progressSnapshot,trackable,trackingUrl,progressSecret,londonDay,requestTrackingPath,requestProgressJob} from '../../lib/job-progress.js';
import handler,{customerStatus,startWork,sendInvoice,registrationStatus,progressRegistration,allowRegistrationLookup} from '../../lib/job-progress-handler.js';
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
test('receipt links open future bookings and follow only their matching accepted job',async()=>{
 const restore=environment(),original=global.fetch;
 const request={id,registration:job.registration,vehicle:job.vehicle,email:job.customer_email,confirmed_date:'2026-11-27',status:'awaiting_review'};
 let saved={...job,id:'22345678-1234-4234-8234-123456789012',booking_date:'2026-11-27',work_required:'Mini Valet'};
 const calls=[];global.fetch=async url=>{calls.push(String(url));return Response.json(String(url).includes('website_booking_requests?')?[request]:String(url).includes('/jobs?')?[saved]:[]);};
 try{
  const token=requestTrackingPath(request,now).split('#')[1];
  let data=await customerStatus(token,now);assert.equal(data.stage,'scheduled');assert.equal(data.registration,job.registration);assert.doesNotMatch(JSON.stringify(data),/driver@example|Private notes|amount_quoted|invoice_url/);
  request.job_id=saved.id;data=await customerStatus(token,now);assert.equal(data.stage,'scheduled');assert.equal(data.job_description,'Mini Valet');
  saved={...saved,status:'in_progress'};data=await customerStatus(token,Date.parse('2026-11-27T11:00:00Z'));assert.equal(data.stage,'underway');
  saved={...saved,customer_email:'other@example.com'};await assert.rejects(customerStatus(token,now),/latest booking confirmation/);
  saved={...saved,customer_email:request.email,status:'cancelled'};await assert.rejects(customerStatus(token,now));
  delete request.job_id;request.status='cancelled';await assert.rejects(customerStatus(token,now));request.status='awaiting_review';
  request.email='changed@example.com';await assert.rejects(customerStatus(token,now));request.email=job.customer_email;
  const count=calls.length;await assert.rejects(customerStatus(token+'x',now));await assert.rejects(customerStatus(token.slice(8),now));
  await assert.rejects(customerStatus('request.'+issueProgressToken(requestProgressJob(request),progressSecret(),now),now));assert.equal(calls.length,count);
 }finally{global.fetch=original;restore();}
});
test('public status returns only the selected booking, never contacts or financial data',async()=>{
  const restore=environment(),original=global.fetch,calls=[];
  global.fetch=async url=>{calls.push(String(url));return Response.json(String(url).includes('workshop_settings')?[{value:{customer_account:'Staff'}}]:[job]);};
  try{
    const token=issueProgressToken(job,progressSecret(),now),data=await customerStatus(token,now);
    assert.equal(data.registration,'CM14 KEL');assert.doesNotMatch(JSON.stringify(data),/driver@example|Private notes|300|customer_name|service-key/);
    assert.equal(calls.length,3);assert.ok(calls[0].includes(encodeURIComponent(id)));
    calls.length=0;await assert.rejects(customerStatus('invalid',now));assert.equal(calls.length,0);
  }finally{global.fetch=original;restore();}
});
test('all tracking routes read description edits without changing the stage or replacing the link',async()=>{
  const restore=environment(),original=global.fetch;
  let saved={...job,work_required:'Full service',status:'in_progress'};
  const request={id:'22345678-1234-4234-8234-123456789012',job_id:id,registration:job.registration,vehicle:job.vehicle,email:job.customer_email,confirmed_date:job.booking_date,status:'booked'};
  global.fetch=async(url,options)=>{
    assert.equal(options.cache,'no-store');
    const path=new URL(url).pathname;
    return Response.json(path.endsWith('/jobs')?[saved]:path.endsWith('/website_booking_requests')?[request]:[]);
  };
  try{
    const token=issueProgressToken(saved,progressSecret(),now),receipt=requestTrackingPath(request,now).split('#')[1];
    for(const description of ['Full service','Oil and filters changed.\nChecking the brakes.','Brakes checked — road test next.']){
      saved={...saved,work_required:description};
      for(const data of [await customerStatus(token,now),await customerStatus(receipt,now),await registrationStatus(job.registration,now)]){
        assert.equal(data.job_description,description);
        assert.equal(data.stage,'underway');
        assert.doesNotMatch(JSON.stringify(data),/driver@example|Private notes|amount_quoted/);
      }
    }
  }finally{global.fetch=original;restore();}
});
test('an open customer page replaces description text on its automatic refresh without a stage change',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
  const timers=[];let data={registration:job.registration,stage:'underway',title:'In the workshop',job_description:'Full service'};
  const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},fetch:async(url,options)=>{assert.equal(options.cache,'no-store');return {ok:true,json:async()=>data};}};
  vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('jobDescription').textContent,'Full service');
  for(const description of ['Oil changed.\nChecking brakes.','Road test complete. <b>Ready for final checks</b>','']){
    data={...data,job_description:description};
    assert.equal(timers.at(-1).delay,60000);await timers.at(-1).fn();
    assert.equal(document.getElementById('jobDescription').textContent,description);
    assert.equal(document.getElementById('jobDescription').querySelector('b'),null);
    assert.equal(document.getElementById('jobSummary').hidden,!description);
    assert.equal(document.getElementById('progressScene').dataset.stage,'underway');
  }
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
test('registration lookup is limited to today, normalises plates and exposes only visual progress',async()=>{
  const restore=environment(),original=global.fetch,requests=[];
  let rows=[{...job,vehicle:'Nissan Qashqai',work_required:'Full service',status:'completed'}, {...job,vehicle:'Nissan Qashqai',work_required:'Full service',id:'22345678-1234-4234-8234-123456789012',status:'in_progress'}];
  global.fetch=async url=>{const u=new URL(url);requests.push(u);return Response.json(u.pathname.endsWith('/jobs')?rows:[{id:'vehicle_artwork:CM14KEL',value:{imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg',customer_name:'PRIVATE',email:'PRIVATE'}},{id:'vehicle_colour:CM14KEL',value:{colour:'Green',email:'PRIVATE'}}]);};
  try{
    const data=await registrationStatus('cm14 kel',now);
    assert.deepEqual(Object.keys(data).sort(),['image_colour','image_url','job_description','registration','stage','title','vehicle']);assert.equal(data.registration,'CM14KEL');assert.equal(data.stage,'underway');assert.equal(data.image_colour,'GREEN');assert.equal(data.vehicle,'Nissan Qashqai');assert.equal(data.job_description,'Full service');
    assert.doesNotMatch(JSON.stringify(data),/PRIVATE|invoice|driver@example|customer|312/);
    assert.equal(requests[0].searchParams.get('booking_date'),'eq.2026-11-03');assert.equal(requests[0].searchParams.get('registration'),'ilike.C*M*1*4*K*E*L');
    assert.equal(requests.length,2);assert.equal(requests[1].searchParams.get('id'),'in.(vehicle_artwork:CM14KEL,vehicle_colour:CM14KEL,vehicle_identity:CM14KEL,progress_scenes_v1:CM14KEL)');
    for(const patch of [{booking_date:'2026-11-04'},{booking_date:'2026-11-02'},{registration:'CM14 KELL'},{status:'quote'},{status:'cancelled'},{customer_note:'[[VECTA_SOFT_DELETE:abc]]'},{card_type:'mini_task'}]){rows=[{...job,...patch}];await assert.rejects(registrationStatus('CM14KEL',now),/No booking/);}
    rows=[{...job,status:'completed'},{...job,status:'booked'}];assert.equal((await registrationStatus('CM14KEL',now)).stage,'waiting');
    rows=[{...job,status:'completed'}];assert.equal((await registrationStatus('CM14KEL',now)).stage,'ready');
    global.fetch=async url=>{if(String(url).includes('workshop_settings'))throw Error('Unavailable');return Response.json(rows);};assert.equal((await registrationStatus('CM14KEL',now)).image_url,'');
  }finally{global.fetch=original;restore();}
});
test('registration input rejects query injection and lookup throttling has a bounded window',()=>{
  assert.equal(progressRegistration('cm14-kel'),'CM14KEL');
  for(const value of ['',null,123,'*','CM14KEL&select=*','CM14KEL,OTHER','AAAAAAAAA','CM14/KEL'])assert.throws(()=>progressRegistration(value));
  for(let i=0;i<30;i++)assert.equal(allowRegistrationLookup('test-ip',now),true);
  assert.equal(allowRegistrationLookup('test-ip',now),false);assert.equal(allowRegistrationLookup('test-ip',now+60000),true);
});
test('registration form opens visual progress without token, contacts or invoice UI',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
  const requests=[],data={registration:'CM14KEL',stage:'underway',title:'In the workshop',image_url:'https://www.haynespro-assets.com/workshop/images/123.svg',invoice_url:'/invoice?token=must-not-be-used'};
  const context={document,window:{addEventListener(){}},location:{hash:''},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async(url,opts)=>{requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>data};}};
  vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);
  assert.equal(requests.length,0);document.getElementById('registrationInput').value='cm14 kel';document.getElementById('registrationForm').onsubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
  assert.equal(requests[0].action,'registration');assert.equal(requests[0].registration,'cm14 kel');assert.equal(document.getElementById('progressScene').hidden,false);assert.equal(document.getElementById('progressScene').dataset.stage,'underway');
  assert.equal(document.getElementById('paperwork').hidden,true);assert.equal(document.getElementById('invoice').hasAttribute('href'),false);
});
test('three scenes stay visible and exactly the live stage is highlighted; sample car never follows another registration',async()=>{
  const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
  let data={registration:'CM14 KEL',stage:'waiting',title:'Waiting'},failure=null;
  const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async()=>{if(failure)throw failure;return {ok:true,json:async()=>data};}};
  vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
  const cards=Array.from(document.querySelectorAll('[data-scene]')),refresh=()=>document.getElementById('refresh').onclick();
  assert.equal(cards.length,3);
  for(const [stage,index] of [['waiting',0],['underway',1],['checking',1],['ready',2],['scheduled',-1]]){
    data={...data,stage};await refresh();assert.equal(document.getElementById('progressScene').hidden,false);
    assert.equal(cards.filter(c=>c.classList.contains('current')).length,index<0?0:1);
    cards.forEach((card,i)=>{assert.equal(card.hidden,false);assert.equal(card.querySelector('.currentBadge').hidden,i!==index);assert.equal(card.hasAttribute('aria-current'),i===index);});
  }
  data={registration:'AB12 CDE',stage:'underway',title:'Working',image_url:'https://www.haynespro-assets.com/workshop/images/456.png'};await refresh();
  for(const card of cards){assert.equal(card.querySelector('.approvedScene').hidden,true);assert.equal(card.querySelector('.approvedScene').hasAttribute('src'),false);assert.equal(card.querySelector('.sceneCar').getAttribute('src'),data.image_url);assert.equal(card.querySelector('.scenePlate').textContent,'AB12 CDE');}
  failure=Error('Offline');await refresh();assert.equal(document.getElementById('progressScene').classList.contains('stale'),true);assert.match(document.getElementById('error').textContent,/out of date/);
  failure=null;data={...data,image_url:'https://untrusted.example/car.svg'};await refresh();assert.equal(document.getElementById('progressScene').classList.contains('stale'),false);
  for(const card of cards){assert.equal(card.querySelector('.vehicleLayer').hidden,true);assert.equal(card.querySelector('.sceneCar').hasAttribute('src'),false);}
  failure=Object.assign(Error('No booking'),{permanent:true});await refresh();assert.equal(document.getElementById('progressScene').hidden,true);
});
test('YD72 OMH uses complete Leaf scenes and never overlays a floating plate or mechanic',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 let data={registration:'YD72 OMH',stage:'underway',title:'In the workshop',image_url:'https://www.haynespro-assets.com/workshop/images/319004630.svgz',image_colour:'GREY'},mounts=0;
 const context={document,window:{addEventListener(){},VectaVehicleImage:{mount(){mounts++;}}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
 const cards=Array.from(document.querySelectorAll('[data-scene]')),refresh=()=>document.getElementById('refresh').onclick();
 for(const stage of ['waiting','underway','checking','ready']){
  data={...data,stage};await refresh();
  for(const card of cards){
   const photo=card.querySelector('.approvedScene');assert.equal(photo.hidden,false);assert.equal(photo.getAttribute('src'),'/assets/progress/yd72omh-'+card.dataset.scene+'.webp');assert.match(photo.alt,/YD72 OMH/);
   assert.equal(card.querySelector('.vehicleLayer').hidden,true);assert.equal(card.querySelector('.sceneCar').hasAttribute('src'),false);
   if(card.querySelector('.sceneMechanic'))assert.equal(card.querySelector('.sceneMechanic').hidden,true);
  }
 }
 assert.equal(mounts,0);
 const photo=cards[0].querySelector('.approvedScene');photo.onerror();await refresh();assert.equal(photo.hidden,true);
 data={registration:'CM14KEL',stage:'waiting',title:'Waiting'};await refresh();assert.equal(photo.hidden,false);assert.equal(photo.getAttribute('src'),'/assets/progress/cm14kel-waiting.webp');
 data={registration:'AB12CDE',stage:'waiting',title:'Waiting'};await refresh();for(const card of cards){assert.equal(card.querySelector('.approvedScene').hidden,true);assert.equal(card.querySelector('.approvedScene').hasAttribute('src'),false);}
});
test('complete scene sets ship all three files to both customer websites',()=>{
 for(const reg of ['cm14kel','yd72omh'])for(const stage of ['waiting','underway','ready']){
  const path='assets/progress/'+reg+'-'+stage+'.webp';
  const main=fs.readFileSync(new URL('../../public/'+path,import.meta.url)),website=fs.readFileSync(new URL('../../website/'+path,import.meta.url));
  assert.equal(main.subarray(0,4).toString(),'RIFF');assert.equal(main.subarray(8,12).toString(),'WEBP');assert.ok(main.length>10000);assert.deepEqual(website,main);
 }
});
