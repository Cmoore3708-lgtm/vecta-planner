import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {bookingConfirmation,confirmationContent} from '../../lib/portal-email.js';
import {deliver} from '../../lib/nmuk-completion-email.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const job={id:'11111111-1111-4111-8111-111111111111',registration:'TEST001',booking_date:'2026-11-20',status:'booked',customer_email:'driver@example.invalid',work_required:'One premium tyre'};
const id='portal-confirmation:'+createHash('sha256').update(job.id+':'+job.booking_date+':'+job.customer_email).digest('hex');
const rejection='The vectamotors.co.uk domain is not verified. Please, add and verify your domain on https://resend.com/domains';
async function setup(t){
 const vars={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://database.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-db',RESEND_API_KEY:'test-key',VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY:'test-db'};
 const old=Object.fromEntries(Object.keys(vars).map(k=>[k,process.env[k]])),fetch=globalThis.fetch;Object.assign(process.env,vars);
 const db=new PGlite();await db.exec('create table ledger (error text, message_payload jsonb)');
 t.after(async()=>{globalThis.fetch=fetch;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;await db.close();});
 const {subject,...content}=confirmationContent(job,'https://www.vectamotors.co.uk/track#saved','aW1hZ2U=');
 const payload={from:'chris@vectamotors.co.uk',reply_to:'chris@vectamotors.co.uk',to:[job.customer_email],subject,...content};
 // Actual Postgres JSONB round trip: nested attachment property order changes,
 // while the original wire payload in the text error column retains its order.
 await db.query('insert into ledger values ($1,$2)',[JSON.stringify({payload,error:rejection}),JSON.stringify({...payload,registration:job.registration})]);
 const stored=(await db.query('select * from ledger')).rows[0];
 const s={record:{id,job_id:job.id,status:'failed',created_at:new Date().toISOString(),...stored},sends:[],providerStatus:200};
 s.db=async(path,options={})=>{
  assert.match(path,/^nmuk_service_reminder_sends/);
  if(!options.method)return s.record?[structuredClone(s.record)]:[];
  if(options.method==='PATCH'){
   if(path.includes('status=eq.failed')&&s.record.status!=='failed')return [];
   Object.assign(s.record,JSON.parse(options.body));return [structuredClone(s.record)];
  }
  throw Error('Unexpected database write');
 };
 globalThis.fetch=async(url,options)=>{
  if(url.startsWith('https://database.invalid/rest/v1/'))return Response.json(await s.db(url.split('/rest/v1/')[1],options));
  assert.equal(url,'https://api.resend.com/emails');s.sends.push({body:options.body,key:options.headers['Idempotency-Key']});
  return Response.json(s.providerStatus===200?{id:'provider-id'}:{message:rejection},{status:s.providerStatus});
 };
 return {...s,get record(){return s.record;},set providerStatus(n){s.providerStatus=n;},payload};
}
test('an image confirmation retries unchanged after a real JSONB round trip and sends once',async t=>{
 const s=await setup(t),original=JSON.stringify(s.payload);
 assert.notEqual(JSON.stringify(s.record.message_payload.attachments),JSON.stringify(s.payload.attachments));
 const preview=await bookingConfirmation(s.db,job);assert.match(preview.html,/data:image\/png;base64,aW1hZ2U=/);assert.equal(s.sends.length,0);
 assert.equal((await bookingConfirmation(s.db,job,true)).accepted,true);
 assert.equal(s.sends[0].body,original,'retry must replay the exact original provider payload');
 assert.equal(s.sends[0].key,id);assert.equal(s.record.status,'sent');
 assert.equal((await bookingConfirmation(s.db,job,true)).already_sent,true);assert.equal(s.sends.length,1);
});
test('reopened failed confirmation shows the real provider problem; rejected retry remains failed',async t=>{
 const s=await setup(t);s.providerStatus=403;
 const preview=await bookingConfirmation(s.db,job);assert.match(preview.send_error,/vectamotors.co.uk.*not verified/i);assert.doesNotMatch(preview.send_error,/completion email/);
 await assert.rejects(bookingConfirmation(s.db,job,true),/vectamotors.co.uk.*not verified/i);
 assert.equal(s.sends.length,1);assert.equal(s.record.status,'failed');
});
test('actual content changes still fail closed, including a different attachment or recipient',async t=>{
 const s=await setup(t),{from,reply_to,to,subject,...content}=s.payload;
 for(const patch of [{text:'Different wording'},{html:'<p>Different</p>'},{attachments:[{...content.attachments[0],content:'changed'}]}]){
  await assert.rejects(deliver({id,job,stamp:new Date().toISOString(),to},content.text,subject,from,{...content,...patch}),/original email wording/);
 }
 await assert.rejects(deliver({id,job,stamp:new Date().toISOString(),to:['someone@example.invalid']},content.text,subject,from,content),/original email wording/);
 assert.equal(s.sends.length,0);assert.equal(s.record.status,'failed');
});
test('pending, expired and Test confirmations never send a retry',async t=>{
 const s=await setup(t);
 s.record.status='pending';await assert.rejects(bookingConfirmation(s.db,job,true),/not yet confirmed/);
 s.record.status='failed';s.record.created_at=new Date(Date.now()-24*3600000).toISOString();await assert.rejects(bookingConfirmation(s.db,job,true),/previous send attempt needs checking/);
 process.env.VERCEL_ENV='preview';await assert.rejects(bookingConfirmation(s.db,job,true),/Test preview only/);
 assert.equal(s.sends.length,0);
});
test('the confirmation button displays rejection, retries after sender repair and disables after success',async t=>{
 const s=await setup(t);s.providerStatus=403;
 const {document}=parseHTML('<html><body></body></html>'),create=document.createElement.bind(document);
 document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>{};el.close=()=>el.remove();}return el;};
 const window={},requests=[];
 vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{document,window,location:{search:''},URLSearchParams,AbortSignal,fetch:async(url,options)=>{
  assert.equal(url,'/api/job-progress');assert.equal(options.credentials,'same-origin');
  const body=JSON.parse(options.body);requests.push(body.action);
  try{return Response.json(await bookingConfirmation(s.db,job,body.action==='confirmation-send'));}
  catch(e){return Response.json({error:e.message},{status:e.status||503});}
 }});
 await window.VectaPortalWorkshop.confirmation(job);
 const dialog=document.querySelector('dialog'),status=dialog.querySelector('[role="status"]'),send=dialog.querySelector('button');
 assert.match(status.textContent,/not verified/);assert.equal(send.textContent,'Retry confirmation email');assert.equal(send.disabled,false);assert.equal(s.sends.length,0);
 await send.onclick();assert.match(status.textContent,/not verified/);assert.equal(send.disabled,false);assert.equal(s.sends.length,1);
 s.providerStatus=200;await send.onclick();assert.equal(status.textContent,'Confirmation email sent.');assert.equal(send.disabled,true);assert.equal(s.sends.length,2);
 assert.deepEqual(requests,['confirmation-preview','confirmation-send','confirmation-send']);assert.equal(s.sends[0].body,s.sends[1].body);
});
