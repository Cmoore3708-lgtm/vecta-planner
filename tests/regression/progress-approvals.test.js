import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {customerApproval, requestApproval, stageFinding, reviewQueue, estimatePence, workshopApprovalList} from '../../lib/progress-approvals.js';
import {issueProgressToken, progressSecret, londonDay} from '../../lib/job-progress.js';
import {whatsappNumber, whatsappPermission, saveWhatsappPermission} from '../../lib/approval-whatsapp.js';
import {photoBinding} from '../../lib/job-workshop-photos.js';
import handler from '../../lib/job-progress-handler.js';

const job={id:'f531a09a-bf70-49fc-a1dc-08628de2cb15',booking_date:londonDay(),status:'in_progress',registration:'ZX11TST',customer_email:'owner@example.invalid',customer_name:'Sam Smith',customer_phone:'07700 900123'};
const photo='754b66f1-0045-4c4a-a609-6f6056f6d0d6', id='d65e2450-c35b-4188-990b-864bc048eccb';
const body={action:'approval-request',estimate:'85.00',approval_id:id,message:'Replace the nearside tyre for £85?',photo_ids:[photo]};
const site='https://www.vectamotors.co.uk';
async function createAndPrice(db,car,payload,origin){
 if(payload.action!=='approval-retry')await stageFinding(db,car,payload);
 return requestApproval(db,car,payload,origin);
}
function setup(t,preview=false){
 const settings={VERCEL_ENV:preview?'preview':'production',SUPABASE_SERVICE_ROLE_KEY:'test-only',VITE_SUPABASE_URL:'https://test.invalid',
   WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_ACCESS_TOKEN:'test-only',WHATSAPP_APPROVAL_TEMPLATE:'vecta_approval',VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY:'test-only',RESEND_API_KEY:'fake-provider',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.test',VECTA_MAIN_USER:'test-manager',VECTA_MAIN_PASSWORD:'test-only'};
 const old=Object.fromEntries(Object.keys(settings).map(k=>[k,process.env[k]]));Object.assign(process.env,settings);
 const original=global.fetch;
 t.after(()=>{global.fetch=original;for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const state={row:null,job:{...job},ledger:null,emails:[],files:[{id:photo}],allowDecide:false,waLedger:null,whatsapps:[],preference:'WhatsApp',setting:null};
 state.db=async(path,opts={})=>{
   const url=new URL(path,'https://test.invalid'),data=opts.body&&JSON.parse(opts.body);
   if(url.pathname==='/jobs')return url.searchParams.get('id')==='eq.'+state.job.id?[state.job]:[];
   if(url.pathname==='/job_workshop_photos')return state.files;
   if(url.pathname==='/additional_work_approvals'){
     if(opts.method==='POST'){state.row??={...data,created_at:new Date().toISOString()};return [];}
     const same=!url.searchParams.has('id')||url.searchParams.get('id')==='eq.'+state.row?.id;
     return state.row&&same?[{...state.row}]:[];
   }
   if(url.pathname==='/workshop_settings'){
     if(opts.method==='POST'){state.setting={value:data.value};return [];}
     return state.setting?[state.setting]:[];
   }
   if(url.pathname==='/website_booking_requests')return [{registration:job.registration,email:job.customer_email,phone:job.customer_phone,contact_preference:state.preference}];
   if(url.pathname==='/nmuk_service_reminder_sends'){
     if(opts.method==='POST'){
       if(state.waLedger)return [];
       state.waLedger=data;return [data];
     }
     if(opts.method==='PATCH'){
       if(state.waLedger?.status!==url.searchParams.get('status')?.slice(3))return [];
       Object.assign(state.waLedger,data);return [state.waLedger];
     }
     const key=url.searchParams.get('id');
     if(key?.startsWith('in.'))return [state.ledger,state.waLedger].filter(Boolean);
     const row=key?.includes('approval-wa:')?state.waLedger:state.ledger;
     return row?[row]:[];
   }
   if(url.pathname==='/rpc/vecta_publish_progress_estimate_review'){
     if(!state.row||state.row.id!==data.p_id||state.row.job_id!==data.p_job_id)return {code:404,error:'Invalid finding'};
     if(state.row.progress_review_state==='sent' && (state.row.progress_estimate_pence!==data.p_pence||state.row.progress_message!==data.p_message))return {code:409,error:'Already sent'};
     Object.assign(state.row,{progress_review_state:'sent',progress_message:data.p_message,progress_estimate_pence:data.p_pence,expires_at:new Date(Date.now()+86400000).toISOString()});return {code:200};
   }
   if(url.pathname==='/rpc/vecta_decide_progress_approval'){
     assert.ok(state.allowDecide);assert.equal(data.p_approval_id,id);assert.equal(data.p_job_id,job.id);
     state.row.status=data.p_decision;state.row.decided_at=new Date().toISOString();return {code:200,status:state.row.status,decided_at:state.row.decided_at};
   }
   throw Error('Unexpected DB path '+url.pathname);
 };
 global.fetch=async(url,opts={})=>{
   const u=new URL(url),data=opts.body&&JSON.parse(opts.body);
   if(u.hostname==='graph.facebook.com'){
     assert.equal(u.pathname,'/v23.0/123456/messages');state.whatsapps.push(data);
     if(state.waFetch)return state.waFetch();
     return state.waResponse||Response.json({messages:[{id:'wamid.test'}]});
   }
   if(u.hostname==='api.resend.com'){state.emails.push(data);if(state.mailFetch)return state.mailFetch();return state.providerResponse||Response.json({id:'test-receipt'});}
   assert.equal(u.pathname,'/rest/v1/nmuk_service_reminder_sends');
   if(opts.method==='POST'){assert.ok(!state.ledger);state.ledger={...data,created_at:new Date().toISOString()};}
   if(opts.method==='PATCH')Object.assign(state.ledger,data);
   return Response.json(state.ledger?[state.ledger]:[]);
 };
 return state;
}

test('one request for a photo batch emails a private, targeted progress link once and returns the customer decision to the job',async t=>{
 const s=setup(t);
 for(let n=0;n<2;n++)assert.equal((await createAndPrice(s.db,job,body,site)).channels.email,'sent');
 assert.equal(s.emails.length,1);assert.deepEqual(s.emails[0].to,[job.customer_email]);
 assert.match(s.emails[0].html,/Hi Sam\. There is a message relating to your car waiting for your approval, <a href=/);
 const url=new URL(s.emails[0].html.match(/href="([^"]+)"/)[1]);
 assert.equal(url.pathname,'/track');assert.equal(url.search,'');assert.equal(url.hash.split('.')[1],id);
 assert.equal(s.whatsapps.length,1);assert.equal(s.whatsapps[0].to,'447700900123');
 assert.equal(s.whatsapps[0].template.components[1].parameters[0].text,url.hash.slice(1));
 const call={action:'approval-status',approval_id:id,token:url.hash.slice(1)};
 const {approval}=await customerApproval(s.db,call);
 assert.deepEqual(approval.photo_ids,[photo]);assert.equal(approval.message,body.message);assert.equal(approval.status,'pending');
 assert.doesNotMatch(JSON.stringify(approval),/customer_email|job_id|@example|progress:/);
 s.allowDecide=true;
 await customerApproval(s.db,{...call,action:'approval-decide',decision:'declined'});
 const list=await workshopApprovalList(s.db,job);assert.equal(list.approvals[0].status,'declined');
 assert.equal(list.approvals[0].channels.whatsapp,'sent');assert.equal(approval.estimated_pence,8500);
});
test('owner reviews the wording before publication; customer and retries retain that exact description',async t=>{
 const s=setup(t,true);await stageFinding(s.db,job,{...body,message:'Here it is'},'mechanic');
 const message='Replace both front tyres.\nThe inner shoulders are worn.';
 const result=await requestApproval(s.db,job,{...body,message},site);
 const token=new URL(result.url).hash.slice(1);
 assert.equal((await customerApproval(s.db,{action:'approval-status',approval_id:id,token})).approval.message,message);
 await requestApproval(s.db,job,{...body,message},site);
 await assert.rejects(requestApproval(s.db,job,{...body,message:'Different work'},site),/Already sent/);
 await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site);
 assert.equal(s.row.progress_message,message);assert.equal(s.emails.length+s.whatsapps.length,0);
});
test('invalid reviewed descriptions cannot publish; older tabs retain the original finding',async t=>{
 const s=setup(t,true);await stageFinding(s.db,job,body);
 for(const message of ['', ' \n ',null,12,'a'.repeat(1201)])await assert.rejects(requestApproval(s.db,job,{...body,message},site),/customer description/);
 assert.equal(s.row.progress_review_state,'draft');assert.equal(s.emails.length+s.whatsapps.length,0);
 await requestApproval(s.db,job,{action:'approval-request',approval_id:id,estimate:'85'},site);
 assert.equal(s.row.progress_message,body.message);
});
test('an ambiguous provider response keeps a reserved send; retry does not deliver a second email',async t=>{
 const s=setup(t);s.providerResponse=Response.json({}, {status:503});
 assert.equal((await createAndPrice(s.db,job,body,site)).channels.email,'pending');
 assert.deepEqual((await createAndPrice(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'pending',whatsapp:'sent'});
 assert.equal(s.emails.length,1);assert.equal(s.ledger.status,'pending');
});
test('preview suppresses real sends and fails closed for wrong photos, amended requests, other jobs and reassigned customers',async t=>{
 const s=setup(t,true),db=s.db;
 s.files=[];await assert.rejects(createAndPrice(db,job,body,site),/Finish uploading/);
 assert.equal(s.row,null);s.files=[{id:photo}];
 const result=await createAndPrice(db,job,body,'https://test.invalid');assert.deepEqual(result.channels,{email:'test',whatsapp:'test'});assert.equal(s.emails.length+s.whatsapps.length,0);
 await assert.rejects(createAndPrice(db,job,{...body,message:'Different work'},site),/changed/);
 await assert.rejects(requestApproval(db,{...job,customer_email:'',customer_phone:''},body,site),/Save a customer email/);
 const call={action:'approval-decide',decision:'approved',approval_id:id,token:new URL(result.url).hash.slice(1)};
 await assert.rejects(customerApproval(db,{...call,token:'ZX11TST'}),/private approval link/);
 await assert.rejects(customerApproval(db,{...call,approval_id:photo}),/no longer available/);
 s.job={...job,customer_email:'changed@example.invalid'};
 await assert.rejects(customerApproval(db,call),/no longer available/);
 await assert.rejects(customerApproval(db,{...call,token:issueProgressToken(s.job,progressSecret())}),/no longer available/);
});
test('workshop approval writes require sign-in and same-origin',async t=>{
 setup(t);
 for(const action of ['approval-list','approval-stage','approval-queue','approval-request','approval-retry','approval-whatsapp-permission']){
   for(const [headers,status] of [[{},401],[{origin:'https://elsewhere.invalid'},403]]){
     const res={setHeader(){},status(n){this.code=n;return this;},json(){}};
     await handler({method:'POST',headers:{'content-type':'application/json',host:'planner.invalid',...headers},body:{action,job_id:job.id}},res);
     assert.equal(res.code,status);
   }
 }
});
test('opening a tracker only displays the request; one explicit decision updates the panel, with customer text safely rendered',async()=>{
 const base=new URL('../../public/',import.meta.url);
 const {document}=parseHTML(readFileSync(new URL('track.html',base),'utf8'));document.hidden=false;
 let decisions=0;
 const fetch=async(_url,options)=>{
   const b=JSON.parse(options.body);
   if(b.action.startsWith('approval-')){
     if(b.action==='approval-decide'){decisions++;assert.equal(b.decision,'approved');}
     return Response.json({approval:{message:'Replace tyre <script>bad()</script>?',estimated_pence:8500,status:decisions?'approved':'pending',photo_ids:[]}});
   }
   return Response.json({registration:'ZX11TST',stage:'underway',title:'In workshop'});
 };
 vm.runInNewContext(readFileSync(new URL('js/vecta-progress.js',base),'utf8'),{document,window:{addEventListener(){}},location:{search:'',hash:'#approval.'+id+'.'+photo},URLSearchParams,fetch,Intl,Date,AbortSignal,setTimeout(){},clearTimeout(){}});
 await new Promise(r=>setImmediate(r));
 assert.equal(decisions,0);assert.equal(document.getElementById('approvalButtons').hidden,false);
 assert.equal(document.getElementById('approvalMessage').querySelector('script'),null);assert.match(document.getElementById('approvalEstimate').textContent,/£85.00/);
 await document.getElementById('approveWork').onclick();
 assert.equal(decisions,1);assert.equal(document.getElementById('approvalButtons').hidden,true);
 assert.match(document.getElementById('approvalStatus').textContent,/You approved/);
});
test('Main submits one private finding after both photos finish; a failed upload can be retried without contacting anyone',async()=>{
 const {document}=parseHTML('<html><body><main><section class="jobWorkSection"></section></main></body></html>');
 const element=document.createElement.bind(document);
 document.createElement=name=>{
   const el=element(name);
   if(name==='canvas'){
     el.getContext=()=>({drawImage(){},fillRect(){}});
     el.toDataURL=()=>'data:image/jpeg;base64,/9j/2Q==';
   }
   return el;
 };
 class Image{naturalWidth=100;naturalHeight=100;async decode(){}}
 const calls=[],approved=[],saved=[];
 let failSecond=true;
 const fetch=async(_url,options)=>{
   const b=JSON.parse(options.body);calls.push(b);
   if(b.action==='photos-upload'){
     if(saved.length===1&&failSecond)return Response.json({error:'Temporary upload failure'},{status:503});
     saved.push(b.photo_id);return Response.json({ok:true});
   }
   if(b.action==='approval-stage'){
     assert.deepEqual(b.photo_ids,saved);approved.push(b.approval_id);return Response.json({approval_id:b.approval_id,stage:'draft'});
   }
   return Response.json({photos:[],approvals:[]});
 };
 const window={};
 vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-workshop-photos.js',import.meta.url),'utf8'),{
   document,window,navigator:{onLine:true},Image,crypto,fetch,AbortSignal,URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},setTimeout(){},clearTimeout(){}
 });
 window.VectaWorkshopPhotos.mount(document.querySelector('main'),job,true);
 await new Promise(r=>setImmediate(r));
 const input=document.querySelector('[data-photo-choose-input]');
 input.files=[{size:8,type:'image/jpeg',name:'first.jpg'},{size:8,type:'image/jpeg',name:'second.jpg'}];
 await input.onchange();
 assert.equal(document.querySelectorAll('.workshopPhotoDraft').length,2,document.querySelector('[data-photo-status]').textContent);
 document.querySelector('[data-approval-message]').value=body.message;
 const send=document.querySelector('[data-approval-send]');
 await send.onclick();
 assert.equal(approved.length,0);assert.equal(saved.length,1);
 failSecond=false;await send.onclick();
 assert.equal(approved.length,1);assert.equal(saved.length,2);assert.ok(calls.filter(b=>b.action==='photos-upload').every(b=>b.review_id===approved[0]));assert.ok(!calls.some(b=>b.action==='approval-request'));
 assert.match(document.querySelector('[data-approval-notice]').textContent,/Sent to Workshop for pricing/);
 input.files=[{size:8,type:'image/jpeg',name:'information-only.jpg'}];
 await input.onchange();
 await document.querySelector('[data-photo-only]').onclick();
 assert.equal(saved.length,3);assert.equal(approved.length,1);
});
test('both channels start before either response; a definite WhatsApp failure can retry without another email',async t=>{
 const s=setup(t);
 let release;
 const gate=new Promise(r=>{release=r;});
 s.mailFetch=async()=>{await gate;return Response.json({id:'email-1'});};
 s.waFetch=async()=>{await gate;return Response.json({error:{code:132000}},{status:400});};
 const attempt=createAndPrice(s.db,job,body,site);
 await new Promise(r=>setImmediate(r));assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);release();
 assert.deepEqual((await attempt).channels,{email:'sent',whatsapp:'failed'});
 delete s.waFetch;
 assert.deepEqual((await createAndPrice(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'sent',whatsapp:'sent'});
 assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,2);
});
test('uncertain WhatsApp acceptance is reserved across retries and concurrent requests',async t=>{
 const s=setup(t);
 s.waFetch=async()=>{throw Error('timeout');};
 const both=await Promise.all([createAndPrice(s.db,job,body,site),createAndPrice(s.db,job,body,site)]);
 assert.ok(both.every(r=>r.channels.whatsapp==='pending'));
 await createAndPrice(s.db,job,{action:'approval-retry',approval_id:id},site);
 assert.equal(s.whatsapps.length,1);
});
test('WhatsApp checks consent and number; a missing connection leaves email usable and never reports WhatsApp sent',async t=>{
 const s=setup(t);s.preference='Email';
 assert.equal((await createAndPrice(s.db,job,body,site)).channels.whatsapp,'no_permission');
 assert.equal(s.whatsapps.length,0);assert.equal(s.emails.length,1);
 const phone=whatsappNumber(job.customer_phone);
 await assert.rejects(saveWhatsappPermission(s.db,job,{allowed:true,phone:'another',contact_binding:photoBinding(job)}));
 await saveWhatsappPermission(s.db,job,{allowed:true,phone,contact_binding:photoBinding(job)});
 delete process.env.WHATSAPP_ACCESS_TOKEN;
 assert.deepEqual((await createAndPrice(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'sent',whatsapp:'manual'});
 process.env.WHATSAPP_ACCESS_TOKEN='test';
 assert.equal((await createAndPrice(s.db,job,{action:'approval-retry',approval_id:id},site)).channels.whatsapp,'sent');
 assert.equal(s.whatsapps.length,1);assert.equal(s.emails.length,1);
 s.preference='WhatsApp';
 await saveWhatsappPermission(s.db,job,{allowed:false,phone,contact_binding:photoBinding(job)});
 assert.equal((await whatsappPermission(s.db,job)).allowed,false);
 assert.equal(whatsappNumber('0191 123 4567'),'');assert.equal(whatsappNumber('0044 7700 900123'),phone);
});
test('WhatsApp works on its own with a valid authorised contact; changing the phone invalidates the previously shared link',async t=>{
 const s=setup(t);s.job={...job,customer_email:''};
 await saveWhatsappPermission(s.db,s.job,{allowed:true,phone:whatsappNumber(job.customer_phone),contact_binding:photoBinding(s.job)});
 assert.deepEqual((await createAndPrice(s.db,s.job,body,site)).channels,{email:'missing_contact',whatsapp:'sent'});
 const token=s.whatsapps[0].template.components[1].parameters[0].text;
 assert.equal((await customerApproval(s.db,{action:'approval-status',approval_id:id,token})).approval.message,body.message);
 s.job.customer_phone='07700 900999';
 await assert.rejects(customerApproval(s.db,{action:'approval-status',approval_id:id,token}),/no longer available/);
});
test('mechanic submits a private draft with no send, Main sees it, and a price is required before publication',async t=>{
 const s=setup(t);
 const pending=await stageFinding(s.db,job,body);
 assert.equal(pending.stage,'draft');assert.equal(s.emails.length+s.whatsapps.length,0);
 const queue=await reviewQueue(async()=>[{...s.row,jobs:job}]);
 assert.equal(queue.findings[0].registration,job.registration);assert.equal(queue.findings[0].status,'awaiting_price');
 const token='approval.'+s.row.id+'.'+s.row.token.slice(9);
 await assert.rejects(customerApproval(s.db,{action:'approval-status',approval_id:id,token}),/no longer available/);
 await assert.rejects(requestApproval(s.db,job,{...body,estimate:''},site),/estimated total/);
 await assert.rejects(requestApproval(s.db,job,{...body,action:'approval-retry'},site),/Enter an estimate/);
 assert.equal(s.emails.length+s.whatsapps.length,0);
 assert.equal(estimatePence('85.5'),8550);assert.equal(estimatePence('0'),0);
 for(const bad of ['-5','1.005','Infinity','1e2','1000000.00'])assert.throws(()=>estimatePence(bad));
});
test('mechanics sign-in cannot access the owner queue, send a price or retry a customer notification',async t=>{
 setup(t);
 const keys=['VECTA_MECHANIC_USER','VECTA_MECHANIC_PASSWORD'];const old=keys.map(k=>process.env[k]);
 process.env.VECTA_MECHANIC_USER='mechanic';process.env.VECTA_MECHANIC_PASSWORD='test-mechanic';
 t.after(()=>keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]));
 for(const action of ['approval-queue','approval-request','approval-retry','approval-whatsapp-permission']){
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await handler({method:'POST',headers:{host:'vecta-mechanic-dashboard.vercel.app','content-type':'application/json',authorization:'Basic '+Buffer.from('mechanic:test-mechanic').toString('base64')},body:{action,job_id:job.id}},res);
  assert.equal(res.code,403);assert.match(res.data.error,/Workshop Pro/);
 }
});
test('without a Meta connection the owner gets the identical private link in a prefilled WhatsApp handoff and the send is never labelled automated',async t=>{
 const s=setup(t);delete process.env.WHATSAPP_ACCESS_TOKEN;
 const response=await createAndPrice(s.db,job,body,site);
 assert.deepEqual(response.channels,{email:'sent',whatsapp:'manual'});
 const wa=new URL(response.manual_url),emailUrl=s.emails[0].html.match(/href="([^"]+)"/)[1];
 assert.equal(wa.hostname,'wa.me');assert.equal(wa.pathname,'/447700900123');assert.ok(wa.searchParams.get('text').endsWith(emailUrl));
 assert.equal(s.whatsapps.length,0);
 const retry=await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site);
 assert.equal(response.manual_url,retry.manual_url);assert.equal(s.emails.length,1);
 s.preference='Email';const denied=await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site);
 assert.equal(denied.manual_url,undefined);assert.equal(denied.channels.whatsapp,'no_permission');
});

test('mechanic camera → Save holds the job open for a note, keeps the photo on a failed handoff, and closes only after Workshop confirms',async()=>{
 const {document}=parseHTML('<html><body><main><section class="jobWorkSection"></section><button id="saveJobMobile">Save &amp; Close</button><button id="saveJob">Save &amp; Close</button><button id="cancelJob">Close</button></main></body></html>');
 const app=document.querySelector('main'),save=app.querySelector('#saveJob'),mobile=app.querySelector('#saveJobMobile');
 let regularSaves=0,regularCloses=0;
 save.onclick=()=>{regularSaves++;};
 mobile.onclick=()=>save.onclick();
 document.getElementById('cancelJob').onclick=()=>{regularCloses++;};
 const create=document.createElement.bind(document);
 document.createElement=name=>{
  const el=create(name);
  if(name==='canvas'){el.getContext=()=>({drawImage(){},fillRect(){}});el.toDataURL=()=>'data:image/jpeg;base64,/9j/2Q==';}
  return el;
 };
 let decoded;
 class Image {naturalWidth=300;naturalHeight=200;decode(){return new Promise(r=>{decoded=r;});}}
 const posts=[],stageIds=[];let fail=true,finishStage;
 const fetch=async(_url,options)=>{
  const data=JSON.parse(options.body);
  if(data.action==='photos-upload'){posts.push(data);return Response.json({ok:true});}
  if(data.action==='approval-stage'){
   stageIds.push(data.approval_id);
   if(fail)return Response.json({error:'Connection interrupted'},{status:503});
   await new Promise(r=>{finishStage=r;});
   return Response.json({approval_id:data.approval_id,stage:'draft'});
  }
  assert.ok(['approval-list','photos-list'].includes(data.action));
  return Response.json({photos:[],approvals:[]});
 };
 const window={VECTA_MECHANIC_DEPLOYMENT:true,confirm:()=>false};
 vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-workshop-photos.js',import.meta.url),'utf8'),{
  document,window,navigator:{onLine:true},Image,crypto,fetch,AbortSignal,
  URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},setTimeout(){},clearTimeout(){}
 });
 window.VectaWorkshopPhotos.mount(app,job,true);await new Promise(r=>setImmediate(r));
 const send=app.querySelector('[data-approval-send]'),camera=app.querySelector('[data-photo-camera-input]');
 assert.equal(camera.getAttribute('capture'),'environment');assert.equal(send.textContent,'Send to Office');
 assert.equal(send.closest('details'),null);
 assert.ok(Array.from(send.closest('.workshopPhotos').children).indexOf(send.closest('.approvalComposer'))<
           Array.from(send.closest('.workshopPhotos').children).indexOf(app.querySelector('[data-photo-drafts]')));
 camera.files=[{size:100,type:'image/jpeg',name:'camera.jpg'}];
 const prepare=camera.onchange();const saving=mobile.onclick();decoded();await Promise.all([prepare,saving]);
 assert.equal(regularSaves,0);assert.equal(posts.length,0);assert.ok(app.querySelector('.workshopPhotoDraft'));
 assert.match(app.querySelector('[data-approval-notice]').textContent,/Add a message/);
 assert.equal(mobile.textContent,'Save & send to Office');
 app.querySelector('#cancelJob').onclick();assert.equal(regularCloses,0);
 app.querySelector('[data-approval-message]').value='Nearside front tyre worn to the cords.';
 await save.onclick();assert.equal(regularSaves,0);assert.match(app.querySelector('[data-approval-notice]').textContent,/interrupted/);
 fail=false;
 const retry=send.onclick(),concurrentSave=mobile.onclick();await new Promise(r=>setImmediate(r));
 assert.equal(regularSaves,0);finishStage();await Promise.all([retry,concurrentSave]);
 assert.equal(posts.length,1);assert.equal(stageIds.length,2);assert.equal(new Set(stageIds).size,1);
 assert.equal(posts[0].review_id,stageIds[0]);assert.equal(regularSaves,1);
 assert.equal(document.querySelector('.workshopFindingReceipt').textContent,'Sent to Office for pricing');
 assert.equal(mobile.textContent,'Save & Close');
 await save.onclick();assert.equal(regularSaves,2);assert.equal(stageIds.length,2);
});

test('only a signed-in mechanic’s submitted photo batch is eligible for a dashboard alert',async t=>{
 const s=setup(t);
 await stageFinding(s.db,job,{...body,progress_from_mechanic:true},'manager');
 const queued=()=>reviewQueue(async()=>[{...s.row,jobs:job}]);
 assert.equal((await queued()).findings[0].mechanic_photo,false);
 s.row=null;
 await stageFinding(s.db,job,body,'mechanic');
 await stageFinding(s.db,job,body,'manager');
 assert.equal((await queued()).findings[0].mechanic_photo,true);
 s.row=null;await stageFinding(s.db,job,{...body,photo_ids:[]},'mechanic');
 assert.equal((await queued()).findings[0].mechanic_photo,false);
});
