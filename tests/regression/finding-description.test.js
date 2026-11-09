import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';

const read=file=>readFileSync(file,'utf8');
test('owner can edit the customer wording beside the price and retains it after a failed send',async()=>{
 const {document,window:dom}=parseHTML('<html><body></body></html>');
 const calls=[];let fail=true;
 const window={dispatchEvent(){}};
 vm.runInNewContext(read('public/js/vecta-review-queue.js'),{document,window,AbortSignal,Event:dom.Event,
  fetch:async(_url,options)=>{
   const body=JSON.parse(options.body);calls.push(body);
   if(body.action==='approval-list')return Response.json({whatsapp:{allowed:false}});
   assert.equal(body.action,'approval-request');
   if(fail)return Response.json({error:'Connection interrupted'},{status:503});
   return Response.json({channels:{email:'test',whatsapp:'test'}});
  }
 });
 const form=window.VectaFindings.pricingForm('test-job',{id:'test-finding',message:'Here it is'});document.body.append(form);
 await new Promise(r=>setImmediate(r));
 const message=form.querySelector('textarea'),price=form.querySelector('input[type=text]'),button=form.querySelector('button');
 assert.equal(message.value,'Here it is');assert.match(message.closest('label').textContent,/Customer description/);
 price.value='100.00';message.value=' \n ';
 await button.onclick();assert.equal(calls.length,1);assert.match(form.textContent,/Enter a customer description/);
 message.value='Replace the front tyres.\nBoth inner edges are worn.';
 await button.onclick();assert.match(form.textContent,/Connection interrupted/);
 assert.equal(message.disabled,false);assert.equal(price.disabled,false);assert.equal(button.disabled,false);
 assert.equal(calls[1].message,message.value);assert.equal(calls[1].estimate,'100.00');
 fail=false;await button.onclick();assert.deepEqual(calls[2],calls[1]);
 assert.equal(message.disabled,true);assert.equal(form.dataset.finished,'true');
});

test('database publishes reviewed wording, price and photos atomically and freezes sent wording',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.jobs(id uuid primary key,booking_date date,customer_email text,customer_phone text,registration text,archived boolean default false,card_type text,status text,customer_note text,job_type text);
   create table public.additional_work_approvals(id uuid primary key,job_id uuid,progress_message text,progress_photo_ids uuid[],progress_booking_date date,customer_email text,customer_phone text,registration text,status text,expires_at timestamptz,decided_at timestamptz,created_at timestamptz default now());
   create table public.job_workshop_photos(id uuid primary key,job_id uuid,ready boolean default false,deleted_at timestamptz);`);
  await db.exec(read('supabase/migrations/20261106070818_workshop_review_estimates.sql'));
  await db.exec(read('supabase/migrations/20261109132534_edit_finding_description.sql'));
  const job='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',photo='33333333-3333-4333-8333-333333333333';
  await db.query("insert into jobs(id,booking_date,registration,status,customer_email,customer_phone) values($1,current_date,'TEST001','in_progress','fixture@example.invalid','000')",[job]);
  await db.query("insert into additional_work_approvals(id,job_id,progress_message,progress_photo_ids,progress_booking_date,registration,customer_email,customer_phone,status,progress_review_state) values($1,$2,'Here it is',$3,current_date,'TEST001','fixture@example.invalid','000','pending','draft')",[id,job,[photo]]);
  const publish=async(message,pence=10000)=>(await db.query('select public.vecta_publish_progress_estimate_review($1,$2,$3,$4) result',[job,id,pence,message])).rows[0].result;
  const row=async()=>(await db.query('select * from additional_work_approvals where id=$1',[id])).rows[0];
  for(const message of [null,'',' \n\t ','x'.repeat(1201)])assert.equal((await publish(message)).code,400);
  assert.equal((await publish('New description')).code,409,'missing photos must prevent publication');
  assert.equal((await row()).progress_message,'Here it is');assert.equal((await row()).progress_review_state,'draft');
  await db.query('insert into job_workshop_photos(id,job_id,review_id,review_uploaded) values($1,$2,$3,true)',[photo,job,id]);
  await db.query("update jobs set customer_email='changed@example.invalid' where id=$1",[job]);
  assert.equal((await publish('New description')).code,409,'recipient change is rejected');
  await db.query("update jobs set customer_email='fixture@example.invalid' where id=$1",[job]);
  const message='Replace both front tyres.\nInner shoulders worn.';
  assert.equal((await publish(message)).code,200);
  assert.equal((await row()).progress_message,message);assert.equal((await row()).progress_estimate_pence,10000);
  assert.equal((await row()).progress_review_state,'sent');
  assert.deepEqual((await db.query('select ready,review_uploaded from job_workshop_photos')).rows,[{ready:true,review_uploaded:false}]);
  assert.equal((await publish(message)).code,200,'identical retry is safe');
  assert.equal((await publish('Different work')).code,409);assert.equal((await publish(message,20000)).code,409);
  assert.equal((await row()).progress_message,message);assert.equal((await row()).progress_estimate_pence,10000);
  assert.equal((await db.query('select public.vecta_publish_progress_estimate($1,$2,$3) result',[job,id,10000])).rows[0].result.code,200,'existing deployments remain compatible');
  const permissions=(await db.query("select has_function_privilege('anon','public.vecta_publish_progress_estimate_review(uuid,uuid,integer,text)','EXECUTE') anon,has_function_privilege('authenticated','public.vecta_publish_progress_estimate_review(uuid,uuid,integer,text)','EXECUTE') authenticated,has_function_privilege('service_role','public.vecta_publish_progress_estimate_review(uuid,uuid,integer,text)','EXECUTE') service_role")).rows[0];
  assert.deepEqual(permissions,{anon:false,authenticated:false,service_role:true});
 }finally{await db.close();}
});
