import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {customerApproval, requestApproval, workshopApprovalList} from '../../lib/progress-approvals.js';
import {issueProgressToken, progressSecret, londonDay} from '../../lib/job-progress.js';
import {whatsappNumber, whatsappPermission, saveWhatsappPermission} from '../../lib/approval-whatsapp.js';
import {photoBinding} from '../../lib/job-workshop-photos.js';
import handler from '../../lib/job-progress-handler.js';

const job={id:'f531a09a-bf70-49fc-a1dc-08628de2cb15',booking_date:londonDay(),status:'in_progress',registration:'ZX11TST',customer_email:'owner@example.invalid',customer_name:'Sam Smith',customer_phone:'07700 900123'};
const photo='754b66f1-0045-4c4a-a609-6f6056f6d0d6', id='d65e2450-c35b-4188-990b-864bc048eccb';
const body={action:'approval-request',approval_id:id,message:'Replace the nearside tyre for £85?',photo_ids:[photo]};
const site='https://www.vectamotors.co.uk';
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
 for(let n=0;n<2;n++)assert.equal((await requestApproval(s.db,job,body,site)).channels.email,'sent');
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
 assert.equal(list.approvals[0].channels.whatsapp,'sent');
});
test('an ambiguous provider response keeps a reserved send; retry does not deliver a second email',async t=>{
 const s=setup(t);s.providerResponse=Response.json({}, {status:503});
 assert.equal((await requestApproval(s.db,job,body,site)).channels.email,'pending');
 assert.deepEqual((await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'pending',whatsapp:'sent'});
 assert.equal(s.emails.length,1);assert.equal(s.ledger.status,'pending');
});
test('preview suppresses real sends and fails closed for wrong photos, amended requests, other jobs and reassigned customers',async t=>{
 const s=setup(t,true),db=s.db;
 s.files=[];await assert.rejects(requestApproval(db,job,body,site),/Finish uploading/);
 assert.equal(s.row,null);s.files=[{id:photo}];
 const result=await requestApproval(db,job,body,'https://test.invalid');assert.deepEqual(result.channels,{email:'test',whatsapp:'test'});assert.equal(s.emails.length+s.whatsapps.length,0);
 await assert.rejects(requestApproval(db,job,{...body,message:'Different work'},site),/changed/);
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
 for(const action of ['approval-list','approval-request','approval-retry','approval-whatsapp-permission']){
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
     return Response.json({approval:{message:'Replace tyre <script>bad()</script>?',status:decisions?'approved':'pending',photo_ids:[]}});
   }
   return Response.json({registration:'ZX11TST',stage:'underway',title:'In workshop'});
 };
 vm.runInNewContext(readFileSync(new URL('js/vecta-progress.js',base),'utf8'),{document,window:{addEventListener(){}},location:{search:'?approval='+id,hash:'#private'},URLSearchParams,fetch,Intl,Date,AbortSignal,setTimeout(){},clearTimeout(){}});
 await new Promise(r=>setImmediate(r));
 assert.equal(decisions,0);assert.equal(document.getElementById('approvalButtons').hidden,false);
 assert.equal(document.getElementById('approvalMessage').querySelector('script'),null);
 await document.getElementById('approveWork').onclick();
 assert.equal(decisions,1);assert.equal(document.getElementById('approvalButtons').hidden,true);
 assert.match(document.getElementById('approvalStatus').textContent,/You approved/);
});
test('the job editor submits one request after both photos finish; a failed upload delays the email and can be retried',async()=>{
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
   if(b.action==='approval-request'){
     assert.deepEqual(b.photo_ids,saved);approved.push(b.approval_id);return Response.json({channels:{email:'sent',whatsapp:'sent'}});
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
 assert.equal(approved.length,1);assert.equal(saved.length,2);
 assert.match(document.querySelector('[data-approval-notice]').textContent,/Email sent · WhatsApp accepted/);
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
 const attempt=requestApproval(s.db,job,body,site);
 await new Promise(r=>setImmediate(r));assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,1);release();
 assert.deepEqual((await attempt).channels,{email:'sent',whatsapp:'failed'});
 delete s.waFetch;
 assert.deepEqual((await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'sent',whatsapp:'sent'});
 assert.equal(s.emails.length,1);assert.equal(s.whatsapps.length,2);
});
test('uncertain WhatsApp acceptance is reserved across retries and concurrent requests',async t=>{
 const s=setup(t);
 s.waFetch=async()=>{throw Error('timeout');};
 const both=await Promise.all([requestApproval(s.db,job,body,site),requestApproval(s.db,job,body,site)]);
 assert.ok(both.every(r=>r.channels.whatsapp==='pending'));
 await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site);
 assert.equal(s.whatsapps.length,1);
});
test('WhatsApp checks consent and number; a missing connection leaves email usable and never reports WhatsApp sent',async t=>{
 const s=setup(t);s.preference='Email';
 assert.equal((await requestApproval(s.db,job,body,site)).channels.whatsapp,'no_permission');
 assert.equal(s.whatsapps.length,0);assert.equal(s.emails.length,1);
 const phone=whatsappNumber(job.customer_phone);
 await assert.rejects(saveWhatsappPermission(s.db,job,{allowed:true,phone:'another',contact_binding:photoBinding(job)}));
 await saveWhatsappPermission(s.db,job,{allowed:true,phone,contact_binding:photoBinding(job)});
 delete process.env.WHATSAPP_ACCESS_TOKEN;
 assert.deepEqual((await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site)).channels,{email:'sent',whatsapp:'not_configured'});
 process.env.WHATSAPP_ACCESS_TOKEN='test';
 assert.equal((await requestApproval(s.db,job,{action:'approval-retry',approval_id:id},site)).channels.whatsapp,'sent');
 assert.equal(s.whatsapps.length,1);assert.equal(s.emails.length,1);
 s.preference='WhatsApp';
 await saveWhatsappPermission(s.db,job,{allowed:false,phone,contact_binding:photoBinding(job)});
 assert.equal((await whatsappPermission(s.db,job)).allowed,false);
 assert.equal(whatsappNumber('0191 123 4567'),'');assert.equal(whatsappNumber('0044 7700 900123'),phone);
});
test('WhatsApp works on its own with a valid authorised contact; changing the phone invalidates the previously shared link',async t=>{
 const s=setup(t);s.job={...job,customer_email:''};
 await saveWhatsappPermission(s.db,s.job,{allowed:true,phone:whatsappNumber(job.customer_phone),contact_binding:photoBinding(s.job)});
 assert.deepEqual((await requestApproval(s.db,s.job,body,site)).channels,{email:'missing_contact',whatsapp:'sent'});
 const token=s.whatsapps[0].template.components[1].parameters[0].text;
 assert.equal((await customerApproval(s.db,{action:'approval-status',approval_id:id,token})).approval.message,body.message);
 s.job.customer_phone='07700 900999';
 await assert.rejects(customerApproval(s.db,{action:'approval-status',approval_id:id,token}),/no longer available/);
});
