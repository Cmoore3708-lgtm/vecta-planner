import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createMotHandler} from '../../api/mot-confirmations.js';
import {earlierMotCandidates} from '../../public/js/vecta-mot-confirmations.js';

const id='11111111-1111-4111-8111-111111111111';
const emailId='22222222-2222-4222-8222-222222222222';
const job={id,registration:'BD53 MUD',booking_date:'2099-10-29',technician:'Alfie',drop_time:'08:00:00',job_type:'Full Service || MOT',status:'booked',customer_note:'Service notes [[MOT_TIME:12:15]]'};
const saved={email_id:emailId,registration:'BD53MUD',date:'2099-10-29',time:'12:15',reference:'12345',received_at:'2099-10-01T10:00:00Z',state:'review',allocation_status:'no_unallocated_mot',forwarded:true};
const email={from:'confirmations@garagemail.motasoft.net',to:['mot@faliiloi.resend.app'],created_at:saved.received_at,authentication:{dkim:'pass',dmarc:'pass'},subject:'Booking Confirmation - MOT IV (ref:12345)',text:'Fault Finder MOT Centre\nMOT IV - Thu 29 Oct 2099 at 12:15\nLAND ROVER DISCOVERY BD53 MUD\nTechnician Example'};
function harness({source=email,record=saved,booking=job,allowed=true,applyError=false}={}){
 const calls=[],emails=[];
 const handler=createMotHandler({login:async(req,res)=>{if(!allowed)res.status(401).json({error:'Sign in'});return allowed},database:async(path,options)=>{
  calls.push({path,options});
  if(path.startsWith('jobs?'))return booking?[booking]:[];
  if(path.startsWith('workshop_settings?'))return record?[{value:record}]:[];
  assert.equal(path,'rpc/vecta_recheck_mot_confirmation');
  if(applyError)throw Error('Temporary database failure');
  const body=JSON.parse(options.body);assert.equal(body.p_job_id,id);
  assert.equal(body.p_record.state,'confirmed');assert.equal(body.p_record.reference,saved.reference);
  return {...body.p_record,state:'confirmed',allocation_status:'allocated',confirmation_mode:'existing_appointment',job_id:id};
 },emailApi:async path=>{emails.push(path);assert.equal(path,'emails/receiving/'+emailId);return source}});
 async function invoke(body={job_id:id},raw){
  const req=Readable.from([Buffer.from(raw??JSON.stringify(body))]);req.method='PUT';req.headers={};
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await handler(req,res);return res;
 }
 return {invoke,calls,emails};
}
test('email received before job is reverified and matched without sending another email',async()=>{
 const h=harness(),res=await h.invoke({job_id:id,state:'confirmed',time:'13:00',email_id:'untrusted'});
 assert.equal(res.code,200);assert.equal(res.body.matched,true);assert.equal(res.body.event.time,'12:15');
 assert.equal(h.emails.length,1);assert.equal(job.drop_time,'08:00:00');assert.equal(job.technician,'Alfie');
});
test('recheck requires login and valid persisted job ID; malformed and absent jobs fail safely',async()=>{
 const denied=harness({allowed:false});assert.equal((await denied.invoke()).code,401);assert.equal(denied.calls.length,0);
 const invalid=harness();assert.equal((await invalid.invoke({job_id:'bad'})).code,400);assert.equal(invalid.calls.length,0);
 assert.equal((await invalid.invoke({},'{oops')).code,400);
 assert.equal((await harness({booking:null}).invoke()).code,404);
});
test('changed details, provisional/completed jobs and non-MOT work never trigger email lookup',async()=>{
 for(const changes of [{booking_date:'2099-10-30'},{customer_note:'[[MOT_TIME:12:30]]'},{registration:'BD53 MUO'},{status:'provisional'},{status:'completed'},{archived:true},{job_type:'Service'},{card_type:'quote'}]){
  const h=harness({booking:{...job,...changes}});assert.equal((await h.invoke()).body.matched,false);assert.equal(h.emails.length,0);
 }
 for(const allocation_status of ['allocated','superseded','confirmation_needs_review']){
  const h=harness({record:{...saved,allocation_status}});assert.equal((await h.invoke()).body.matched,false);assert.equal(h.emails.length,0);
 }
});
test('untrusted, cancelled, mismatched and re-dated original emails cannot confirm a job',async()=>{
 for(const changes of [{from:'spoof@example.com'},{to:['wrong@example.com']},{authentication:{dkim:'fail',dmarc:'pass'}},{authentication:{dkim:'pass',dmarc:'fail'}},{subject:'Booking Cancelled'},{created_at:'2099-10-02T10:00:00Z'},{text:email.text.replace('12:15','12:30')},{subject:'Booking Confirmation - MOT IV (ref:54321)'}]){
  const h=harness({source:{...email,...changes}});assert.equal((await h.invoke()).body.matched,false);assert.equal(h.calls.filter(c=>c.path.startsWith('rpc/')).length,0);
 }
 assert.equal((await harness({applyError:true}).invoke()).code,503);
});
test('dashboard catches earlier emails after offline sync and ignores superseded or unrelated bookings',()=>{
 assert.deepEqual(earlierMotCandidates([job],[saved]),[job]);
 assert.deepEqual(earlierMotCandidates([{...job,status:'provisional'}],[saved]),[]);
 assert.deepEqual(earlierMotCandidates([job],[saved,{...saved,email_id:'later',received_at:'2099-10-02T10:00:00Z',allocation_status:'confirmation_needs_review',registration:null,date:null}]),[]);
 assert.deepEqual(earlierMotCandidates([job],[{...saved,time:'12:30'}]),[]);
 const unallocated={...job,technician:'Unallocated'};assert.deepEqual(earlierMotCandidates([unallocated],[saved]),[unallocated]);
});
test('browser recheck is deduplicated, refreshes allocated jobs and does not interrupt saving on failure',async()=>{
 const source=readFileSync(new URL('../../public/js/vecta-mot-confirmations.js',import.meta.url),'utf8').replaceAll('export function','function');
 let requests=0,renders=0,refreshes=0,release;
 const gate=new Promise(resolve=>release=resolve),state={jobs:[job],render(){renders++},refresh(){refreshes++}};
 const window={vectaMotBookingState:()=>state,addEventListener(){}};
 const context={window,document:{hidden:true,addEventListener(){}},navigator:{onLine:true},localStorage:{getItem:()=>JSON.stringify([saved]),setItem(){}},setInterval(){},fetch:async(url,options)=>{
  requests++;assert.equal(options.method,'PUT');assert.deepEqual(JSON.parse(options.body),{job_id:id});await gate;
  return {ok:true,json:async()=>({matched:true,event:{...saved,state:'confirmed',allocation_status:'allocated',confirmation_mode:'existing_appointment',job_id:id}})};
 }};
 vm.createContext(context);vm.runInContext(source,context);
 const a=window.VectaMotBookings.recheck(id),b=window.VectaMotBookings.recheck(id);release();await Promise.all([a,b]);
 assert.equal(requests,1);assert.equal(refreshes,1);assert.equal(renders,1);assert.equal(window.VectaMotBookings.status(job).confirmed,true);
 context.fetch=async()=>{throw Error('Offline')};await assert.doesNotReject(()=>window.VectaMotBookings.recheck(id));
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 assert.match(html,/savedResult===true&&j.status==='booked'&&window.VectaMotBookings\?\.recheck&&hasMotJobType\(j\)/);
});
