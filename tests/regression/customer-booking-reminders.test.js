import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import handler,{customerEligible,bookingReminderContent,reminderContent} from '../../lib/nmuk-service-reminders.js';
import {verifyProgressToken,claimMatchesJob,progressSecret} from '../../lib/job-progress.js';

const base={id:'11111111-1111-4111-8111-111111111111',booking_date:'2026-12-15',registration:'AB12 CDE',customer_email:'driver@example.invalid',customer_name:'Sam',archived:false,status:'booked',card_type:'job',job_type:'MOT'};
function setup(t){
 const keys=['CRON_SECRET','RESEND_API_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VERCEL_ENV','VERCEL_PROJECT_NAME','VERCEL_PROJECT_PRODUCTION_URL'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),OriginalDate=Date,oldFetch=fetch;
 const s={clock:'2026-12-14T12:00:00Z',jobs:[{...base}],settings:[],sends:[],ledger:new Map(),requests:[],fleet:[]};
 globalThis.Date=class extends OriginalDate{constructor(...a){super(...(a.length?a:[s.clock]));}static now(){return OriginalDate.parse(s.clock);}};
 Object.assign(process.env,{CRON_SECRET:'test-cron',RESEND_API_KEY:'test-email',SUPABASE_SERVICE_ROLE_KEY:'test-service',VITE_SUPABASE_URL:'https://db.example.invalid',VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example.invalid'});
 t.after(()=>{globalThis.Date=OriginalDate;globalThis.fetch=oldFetch;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url),p=u.searchParams,body=opts.body&&JSON.parse(opts.body);s.requests.push(u.pathname);
  if(u.hostname==='api.resend.com'){s.sends.push(body);if(s.timeout)throw Error('connection dropped');return s.providerError?Response.json({message:s.providerError},{status:403}):Response.json({id:'provider-'+s.sends.length});}
  if(u.pathname.endsWith('/jobs')){const offset=Number(p.get('offset')||0);return Response.json(s.jobs.filter(j=>j.booking_date===p.get('booking_date').slice(3)&&j.archived===false).slice(offset,offset+Number(p.get('limit'))));}
  if(u.pathname.endsWith('/workshop_settings'))return Response.json(p.get('id')==='eq.fleet_state_v77'?(s.fleetUnavailable?[]:[{value:{vehicles:s.fleet}}]):s.settings);
  assert.ok(u.pathname.endsWith('/nmuk_service_reminder_sends'));
  const id=p.get('id')?.slice(3)||body?.id,row=s.ledger.get(id);
  if(opts.method==='POST'){if(row)return Response.json({message:'duplicate'},{status:409});s.ledger.set(id,{...body,created_at:new Date().toISOString()});return Response.json([s.ledger.get(id)]);}
  if(opts.method==='PATCH'){if(!row||p.has('status')&&row.status!==p.get('status').slice(3))return Response.json([]);Object.assign(row,body);}
  return Response.json(row?[{...row}]:[]);
 };
 s.run=async(headers={authorization:'Bearer test-cron'})=>{const res={status(n){this.code=n;return this;},json(body){this.body=body;return this;}};await handler({method:'GET',headers},res);return res;};
 return s;
}

test('all non-NMUK confirmed customer types qualify, but inactive or invalid records do not',()=>{
 const job={...base,recipient:base.customer_email};
 for(const customer_account of ['Staff','Contractor','WPC','',undefined])assert.equal(customerEligible({...job,customer_account},base.booking_date),true);
 for(const change of [...['provisional','quote','completed','ready_to_invoice','work_complete','invoiced','cancelled','canceled','deleted',''].map(status=>({status})),{archived:true},{completed_at:'2026-12-10'},{no_vehicle:true},{deleted:true},{customer_note:'[[VECTA_SOFT_DELETE:x]]'},{card_type:'multi_day'},{job_type:'Vehicle Tax'},{recipient:''},{recipient:'one@example.invalid;two@example.invalid'},{booking_date:'2026-12-16'}])assert.equal(customerEligible({...job,...change},base.booking_date),false,JSON.stringify(change));
});
test('customer email has date, safe arrival instructions and a private HERE button; NMUK has none of the portal extras',t=>{
 setup(t);const content=bookingReminderContent({...base,recipient:base.customer_email});
 for(const phrase of ['15 December 2026','park outside the workshop','designated customer parking spaces','Key Drop letterbox','at reception','Keep an eye on your personalised customer portal'])assert.ok(content.text.includes(phrase));
 const {document}=parseHTML(content.html),link=document.querySelector('a');assert.equal(link.textContent,'HERE');
 const claim=verifyProgressToken(new URL(link.href).hash.slice(1),progressSecret());assert.equal(claimMatchesJob(claim,base),true);
 const fallback=bookingReminderContent({...base,recipient:'other@example.invalid'});assert.doesNotMatch(fallback.text,/track#/);
 const escaped=bookingReminderContent({...base,customer_name:'<script>unsafe</script>'});assert.doesNotMatch(escaped.html,/<script>/);
 const nmuk=reminderContent({...base,customer_name:'NMUK'});assert.equal(nmuk.subject,'AB12 CDE Service tomorrow');assert.doesNotMatch(nmuk.text+' '+nmuk.html,/portal|track#|service book|locking wheel/i);
});
test('noon cron covers customers without account memory and contractors, while NMUK eligibility stays unchanged',async t=>{
 const s=setup(t);
 s.jobs=[{...base},{...base,id:'22222222-2222-4222-8222-222222222222',customer_name:'Contractor'},{...base,id:'33333333-3333-4333-8333-333333333333',customer_name:'NMUK',job_type:'MOT'},{...base,id:'44444444-4444-4444-8444-444444444444',status:'provisional'}];
 s.settings=[{id:'jobcustomer:'+s.jobs[1].id,value:{customer_account:'Contractor'}}];
 const r=await s.run();assert.equal(r.code,200);assert.equal(r.body.sent,2);assert.equal(s.sends.length,2);assert.ok(s.sends.every(m=>m.from==='chris@vectamotors.co.uk'&&m.text.includes('customer portal')));
 assert.equal((await s.run()).body.sent,0);assert.equal(s.sends.length,2);
});
test('schedule fires at UK noon in winter, summer and clock-change weekends, never the other UTC hour',async t=>{
 const s=setup(t),cases=[['2026-12-14',12],['2026-07-14',11],['2026-03-28',12],['2026-03-29',11],['2026-10-24',11],['2026-10-25',12]];
 for(const [day,hour]of cases){
  s.ledger.clear();s.clock=day+'T'+String(hour===11?12:11).padStart(2,'0')+':00:00Z';assert.equal((await s.run()).body.skipped,'Outside UK midday');
  s.clock=day+'T'+hour+':00:00Z';s.jobs[0].booking_date=new Date(Date.parse(s.clock)+86400000).toISOString().slice(0,10);assert.equal((await s.run()).body.sent,1);
 }
 const crons=JSON.parse(readFileSync('vercel.json','utf8')).crons;assert.equal(crons.find(x=>x.path.endsWith('reminders-summer')).schedule,'0 11 * * *');assert.equal(crons.find(x=>x.path.endsWith('reminders-winter')).schedule,'0 12 * * *');
});
test('provider failures are recorded, safe retries do not duplicate, and uncertainty stays pending',async t=>{
 const s=setup(t);s.providerError='The vectamotors.co.uk domain is not verified';
 assert.equal((await s.run()).code,502);const record=[...s.ledger.values()][0];assert.equal(record.status,'failed');assert.match(record.error,/not verified/);
 s.providerError=null;assert.equal((await s.run()).body.sent,1);assert.equal(record.status,'sent');await s.run();assert.equal(s.sends.length,2);
 s.ledger.clear();s.timeout=true;assert.equal((await s.run()).code,502);assert.equal([...s.ledger.values()][0].status,'pending');await s.run();assert.equal(s.sends.length,3);
});
test('cancelled bookings and changed recipients are not sent on retry; missing fleet does not block customers',async t=>{
 const s=setup(t);s.providerError='Rejected';await s.run();s.providerError=null;s.jobs[0].status='cancelled';await s.run();assert.equal(s.sends.length,1);
 s.jobs[0].status='booked';s.jobs[0].customer_email='replacement@example.invalid';assert.equal((await s.run()).code,502);assert.equal(s.sends.length,1);
 s.ledger.clear();s.fleetUnavailable=true;const r=await s.run();assert.equal(r.body.sent,1);assert.match(r.body.warning,/NMUK reminders withheld/);
});
test('pagination does not omit customers after the first page; Test and unauthorized cron send nothing',async t=>{
 const s=setup(t);assert.equal((await s.run({})).code,401);assert.equal(s.requests.length,0);
 process.env.VERCEL_ENV='preview';assert.match((await s.run()).body.skipped,/Test environment/);assert.equal(s.requests.length,0);process.env.VERCEL_ENV='production';
 s.jobs=Array.from({length:201},(_,i)=>({...base,id:'job-'+i,status:i===200?'booked':'quote'}));assert.equal((await s.run()).body.sent,1);assert.equal(s.requests.filter(p=>p.endsWith('/jobs')).length,2);
});
