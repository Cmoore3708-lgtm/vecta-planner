import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';
import '../../public/js/vecta-booking-rules.js';
const rules=globalThis.VectaBookingRules,read=file=>readFileSync(file,'utf8');
const preferences={version:1,parts:'oem',serious_repairs:'book_later'};
const html=read('website/booking/index.html');
function load(name,c){const start=html.indexOf(`function ${name}(`);vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),c);}
test('all six customer choices produce safe fixed text and survive description edits',()=>{
 for(const parts of ['budget','mid_range','oem'])for(const serious_repairs of ['change_parts','book_later']){
  const request={customer_preferences:{version:1,parts,serious_repairs}};
  const note=rules.customerPreferencesNote(request),job={customer_note:note,work_required:'Updated by mechanic'};
  assert.deepEqual(rules.customerPreferences(job),request.customer_preferences);
  const lines=rules.customerPreferenceLines(job);assert.equal(lines.length,2);
  assert.equal(lines[0],'Customer would like '+{budget:'budget',mid_range:'mid range',oem:'OEM'}[parts]+' parts');
  assert.match(lines[1],/serious.*cannot get hold/);
  assert.match(lines[1],serious_repairs==='change_parts'?/Change the parts/:/Put the car back together/);
 }
 assert.deepEqual(rules.customerPreferenceLines({}),[],'old jobs do not invent permission');
 assert.deepEqual(rules.customerPreferenceLines({customer_note:'[[VECTA_WEB_DETAILS:%bad]]'}),[]);
 assert.equal(rules.validCustomerPreferences({version:1,parts:'constructor',serious_repairs:'change_parts'}),false);
 assert.equal(rules.customerInstructionsHtml({customer_preferences:{...preferences,parts:'<img src=x onerror=alert(1)>'}}),'');
 assert.doesNotMatch(rules.customerInstructionsHtml({customer_preferences:{...preferences,extra:'<script>bad()</script>'}}),/<script>/);
});
test('a Full Service hides and clears a Mini Valet previously chosen for an Interim Service',()=>{
 const c={state:{form:{job_types:['Service'],service_choice:'Oil & Filter Change',mini_valet:true}},serviceVehicleHtml:()=>''};vm.createContext(c);
 load('fullServiceSelected',c);load('miniValetReviewHtml',c);
 assert.match(c.miniValetReviewHtml(),/mini-valet-offer/);
 c.state.form.service_choice='Full Service';assert.equal(c.miniValetReviewHtml(),'');assert.equal(c.state.form.mini_valet,false);
 c.state.form.job_types.push('MOT');assert.equal(c.miniValetReviewHtml(),'');
 c.state.form.job_types=['MOT'];assert.match(c.miniValetReviewHtml(),/mini-valet-offer/);
});
test('parts question is immediately below the work description and repair question is on Review',()=>{
 assert.match(html,/<\/textarea><\/label>\$\{partsRangeHtml\(\)\}/);
 assert.match(html,/Review your booking[\s\S]*\$\{seriousRepairChoiceHtml\(\)\}/);
 const c={state:{form:{parts_preference:'',serious_repair_choice:''}}};vm.createContext(c);load('partsRangeHtml',c);load('seriousRepairChoiceHtml',c);
 const {document}=parseHTML(c.partsRangeHtml()+c.seriousRepairChoiceHtml());
 assert.deepEqual([...document.querySelectorAll('.parts-choice label')].map(x=>x.textContent),['Budget','Mid range','OEM']);
 assert.deepEqual([...document.querySelectorAll('.repair-choice label')].map(x=>x.textContent),['Change the parts','Put the car back together, I’ll book it back in later.']);
 assert.equal(document.querySelectorAll('[checked]').length,0);
});
test('the job card and printed job card display both original customer instructions',()=>{
 const source=read('index.html');const c={window:{VectaBookingRules:rules},esc:value=>String(value).replace(/[<>&]/g,'_')};vm.createContext(c);
 for(const name of ['jobPartsRange','jobPartsRangeDisplay','jobPartsRangeWorkHtml']){
  const start=source.indexOf('function '+name+'(');vm.runInContext(source.slice(start,source.indexOf('\nfunction ',start+1)),c);
 }
 c.PARTS_RANGE_MARKER=/\[\[PARTS_RANGE:([^\]]+)\]\]/i;
 const job={customer_note:rules.customerPreferencesNote({customer_preferences:preferences}),work_required:'Updated work'};
 const {document}=parseHTML(c.jobPartsRangeWorkHtml(job));
 assert.match(document.querySelector('.jobCustomerInstructions').textContent,/Customer would like OEM parts.*Put the car back together/);
 assert.match(source.slice(source.indexOf('function printJob('),source.indexOf('\nfunction ',source.indexOf('function printJob('))),/jobPartsRangeWorkHtml\(j\)/);
});
test('database persists preferences through atomic provisional creation, photos, retries and later job edits',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table public.jobs(id uuid primary key default gen_random_uuid(),booking_date date,drop_time time,registration text,vehicle text,work_required text,customer_name text,customer_phone text,customer_email text,customer_note text,technician text,ramp text,status text,job_type text,job_colour text,estimated_hours numeric,source text,card_type text,archived boolean,mot_due date,amount_quoted numeric,vat_mode text);
   create table public.website_booking_requests(id uuid primary key,customer_name text,email text,phone text,registration text,vehicle text,mileage text,mot_due date,job_types jsonb,work_required text,preferred_date_1 date,preferred_date_2 date,preferred_date_3 date,completion_deadline text,contact_preference text,source text default 'Website booking',status text default 'awaiting_review',confirmed_date date,confirmed_time time,approximate_cost numeric,created_at timestamptz default now(),work_photo_count integer,gsf_parts jsonb,job_id uuid);
   create table public.website_booking_photos(request_id uuid primary key,photos jsonb);
   create function public.vecta_sync_website_provisional_job() returns trigger language plpgsql as $$begin return new;end;$$;
   create function public.vecta_cancel_website_provisional_request() returns trigger language plpgsql as $$begin return new;end;$$;`);
  const migration=readdirSync('supabase/migrations').find(name=>name.endsWith('_booking_customer_preferences.sql'));
  await db.exec(read('supabase/migrations/'+migration));
  await db.exec('create trigger create_provisional after insert on public.website_booking_requests for each row execute function public.vecta_create_website_provisional()');
  const request={id:'11111111-1111-4111-8111-111111111111',customer_name:'Fixture',email:'fixture@example.invalid',phone:'000',registration:'TEST123',vehicle:'Test',mileage:'40000',job_types:['Full Service'],work_required:'Full Service',preferred_date_1:'2050-01-04',source:'Website booking',status:'awaiting_review',approximate_cost:155,created_at:'2026-11-08T07:00:00Z',customer_preferences:preferences};
  await db.query('select * from public.insert_website_booking_with_photos($1::jsonb,$2::jsonb)',[JSON.stringify(request),JSON.stringify(['fixture-photo'])]);
  let jobs=(await db.query('select * from public.jobs')).rows;assert.equal(jobs.length,1);assert.deepEqual(rules.customerPreferences(jobs[0]),preferences);assert.equal(jobs[0].status,'provisional');assert.equal(Number(jobs[0].amount_quoted),155);
  await db.query('update public.jobs set work_required=$1,status=$2 where id=$3',['Updated description','booked',jobs[0].id]);
  await db.query('select * from public.insert_website_booking_with_photos($1::jsonb,$2::jsonb)',[JSON.stringify(request),JSON.stringify(['fixture-photo'])]);
  jobs=(await db.query('select * from public.jobs')).rows;assert.equal(jobs.length,1);assert.deepEqual(rules.customerPreferences(jobs[0]),preferences);assert.equal(jobs[0].work_required,'Updated description');
  for(const invalid of [{}, {...preferences,parts:null},{...preferences,serious_repairs:null},{...preferences,version:'1'}])await assert.rejects(db.query('update public.website_booking_requests set customer_preferences=$1::jsonb',[JSON.stringify(invalid)]),/website_booking_customer_preferences_valid/);
  await db.query("insert into public.website_booking_requests(id,job_types,preferred_date_1,work_required,customer_preferences) values(gen_random_uuid(),'[\"MOT\"]','2050-01-05','MOT',$1::jsonb)",[JSON.stringify({...preferences,parts:'budget',serious_repairs:'change_parts'})]);
  jobs=(await db.query('select * from public.jobs order by work_required')).rows;assert.equal(jobs.length,2);assert.equal(rules.customerPreferences(jobs[0]).parts,'budget');
  await db.exec("insert into public.website_booking_requests(id,job_types,preferred_date_1,work_required) values(gen_random_uuid(),'[\"MOT\"]','2050-01-06','Legacy')");
  const old=(await db.query("select * from public.jobs where work_required='Legacy'")).rows[0];assert.equal(rules.customerPreferences(old),null);
 }finally{await db.close();}
});
