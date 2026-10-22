import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
import {parseMotConfirmation,verifyMotWebhook} from '../../lib/mot-confirmation.js';
import {motBookingStatus} from '../../public/js/vecta-mot-confirmations.js';
import {createMotHandler} from '../../api/mot-confirmations.js';

const email={id:'12345678-1234-1234-1234-123456789abc',from:'Fault Finder <confirmations@garagemail.motasoft.net>',to:['mot@faliiloi.resend.app'],subject:'Booking Confirmation - MOT IV (ref:29421617)',created_at:'2026-10-22T12:00:00Z',authentication:{dkim:'pass',dmarc:'pass'},text:'Fault Finder MOT Centre\nBooking Confirmation - MOT IV (ref:29421617)\nDear MR CHRIS MOORE (VECTA),\nBooking Details\nMOT IV - Thu 29 Oct 2026 at 12:00\nLAND ROVER DISCOVERY BD53 MUD\nTechnician STEPHEN ANGUS\nNotes\nPrice Summary\nMOT IV £40.00'};
const job={id:'job1',technician:'Chris',drop_time:'12:00',registration:'BD53 MUD',booking_date:'2026-10-29',mot_time:'12:00',job_type:'MOT || Brakes'};
const confirmation={...parseMotConfirmation(email),allocation_status:'allocated',job_id:'job1',received_at:email.created_at,email_id:email.id};
const secret='whsec_'+Buffer.from('test-secret-with-sufficient-length').toString('base64');
function signed(payload,stamp=String(Math.floor(Date.now()/1000))){const raw=JSON.stringify(payload),id='msg_test',signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+stamp+'.'+raw).digest('base64');return {raw,headers:{'svix-id':id,'svix-timestamp':stamp,'svix-signature':'v1,'+signature}}}

test('real confirmation template and HTML alternative identify the exact MOT',()=>{
 assert.deepEqual(parseMotConfirmation(email),{reference:'29421617',state:'confirmed',registration:'BD53MUD',date:'2026-10-29',time:'12:00'});
 assert.deepEqual(parseMotConfirmation({...email,text:null,html:email.text.split('\n').map(line=>'<p>'+line+'</p>').join('')}),parseMotConfirmation(email));
 for(const text of [email.text.replace('Thu','Fri'),email.text.replace('12:00','25:00'),email.text+'\nMOT IV - Thu 29 Oct 2026 at 13:00',email.text.replace('29 Oct','31 Feb')])assert.equal(parseMotConfirmation({...email,text}).state,'review');
 assert.equal(parseMotConfirmation({...email,subject:'Booking Cancelled',text:email.text+'\nCancelled'}).state,'review');
});

test('exact unique match only, changed details never retain green',()=>{
 assert.equal(motBookingStatus(job,[confirmation],[job]).confirmed,true);
 for(const changes of [{mot_time:'12:30'},{booking_date:'2026-10-30'},{registration:'BD53 MUO'},{job_type:'Brakes'},{mot_time:null,customer_note:''}]){const changed={...job,...changes};assert.equal(motBookingStatus(changed,[confirmation],[changed]).confirmed,false)}
 assert.equal(motBookingStatus(job,[confirmation],[job,{...job,id:'duplicate'}]).confirmed,false);
 const legacy={...job,mot_time:null,customer_note:'[[MOT_TIME:12:00]]'};assert.equal(motBookingStatus(legacy,[confirmation],[legacy]).confirmed,true);
 const cancel={reference:confirmation.reference,state:'review',received_at:'2026-10-23T12:00:00Z',email_id:'later'};
 assert.equal(motBookingStatus(job,[cancel,confirmation],[job]).confirmed,false);
 const rescheduled={...confirmation,time:'13:00',received_at:'2026-10-23T12:00:00Z',email_id:'new'};
 assert.equal(motBookingStatus(job,[rescheduled,confirmation],[job]).confirmed,false);
});

test('raw webhook signatures reject tampering and expired replay',()=>{
 const {raw,headers}=signed({type:'email.received'});assert.equal(verifyMotWebhook(raw,headers,secret).type,'email.received');
 assert.throws(()=>verifyMotWebhook(raw+' ',headers,secret));
 const old=signed({},'1000');assert.throws(()=>verifyMotWebhook(old.raw,old.headers,secret));
 assert.throws(()=>verifyMotWebhook(raw,headers,''));
});

function harness(source=email,{sendFails=false}={}){
 const records=new Map(),sent=[],writes=[];let fail=sendFails;
 const handler=createMotHandler({env:{RESEND_MOT_WEBHOOK_SECRET:secret},login:async()=>true,database:async(path,options={})=>{
  writes.push({path,options});assert.ok(path.startsWith('workshop_settings?')||path==='rpc/vecta_apply_mot_confirmation');
  if(path==='rpc/vecta_apply_mot_confirmation'){let value=JSON.parse(options.body).p_record;value={...value,allocation_status:value.state==='confirmed'?'allocated':'confirmation_needs_review',job_id:value.state==='confirmed'?'job1':null};records.set('mot-email:'+value.email_id,value);return value}
  if(options.method==='POST'){const row=JSON.parse(options.body);records.set(row.id,row.value);return null}
  if(options.method==='PATCH'){const key=path.split('id=eq.')[1];records.set(key,JSON.parse(options.body).value);return null}
  const key=path.split('id=eq.')[1];return key?(records.has(key)?[{value:records.get(key)}]:[]):[...records.values()].map(value=>({value}));
 },emailApi:async(path,options)=>{if(path.startsWith('emails/receiving/'))return source;if(fail){fail=false;throw new Error('Temporary email service failure')}sent.push(JSON.parse(options.body));assert.equal(options.headers['Idempotency-Key'],'mot-copy-'+email.id);return {id:'forwarded-id'}}});
 async function invoke(payload={type:'email.received',data:{email_id:email.id}}){const signedReq=signed(payload),req=Readable.from([Buffer.from(signedReq.raw)]);req.method='POST';req.headers=signedReq.headers;const res={setHeader(){},status(code){this.code=code;return this},json(value){this.body=value;return this}};await handler(req,res);return res}
 return {invoke,records,sent,writes,handler};
}
test('verified confirmation saves separately, forwards once, safely accepts duplicate events',async()=>{
 const h=harness();assert.equal((await h.invoke()).code,200);assert.equal((await h.invoke()).body.duplicate,true);assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0].to,['chris@nissan-fleet.co.uk']);assert.match(h.sent[0].text,/BD53 MUD/);assert.equal([...h.records.values()][0].state,'confirmed');
});
test('forwarding retries without losing the confirmation; malformed mail still copied for checking',async()=>{
 const h=harness(email,{sendFails:true});assert.equal((await h.invoke()).code,503);assert.equal([...h.records.values()][0].forwarded,false);assert.equal((await h.invoke()).code,200);assert.equal(h.sent.length,1);
 const unparsed=harness({...email,text:'Fault Finder MOT Centre\nPlease call to check your booking'});await unparsed.invoke();assert.equal(unparsed.sent.length,1);assert.equal([...unparsed.records.values()][0].state,'review');
});
test('wrong sender/recipient ignored; failed authentication cannot make green or send copies',async()=>{
 for(const changes of [{from:'attacker@example.com'},{to:['someone@faliiloi.resend.app']}]){const h=harness({...email,...changes});assert.equal((await h.invoke()).body.ignored,true);assert.equal(h.records.size,0);assert.equal(h.sent.length,0)}
 const h=harness({...email,authentication:{dkim:'fail',dmarc:'fail'}});await h.invoke();assert.equal(h.sent.length,0);assert.equal([...h.records.values()][0].state,'review');
});
test('GET requires workshop login',async()=>{
 let touched=false;const handler=createMotHandler({login:async(req,res)=>{res.status(401).json({error:'Sign in'});return false},database:async()=>{touched=true;return []}}),res={setHeader(){},status(code){this.code=code;return this},json(value){this.body=value}};
 await handler({method:'GET'},res);assert.equal(res.code,401);assert.equal(touched,false);
});

test('Main and mechanics desktop/mobile MOT badges change only the requested status',()=>{
 const main=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 for(const source of [main,mechanicVariant(main)]){
  const names=['motConfirmationPresentation','plannerMotHeaderHtml','mobileMotAppointmentHtml'];
  const functions=names.map(name=>source.match(new RegExp('function '+name+'\\([^\\n]+'))?.[0]).join('\n');
  const context={window:{VectaMotBookings:{status:j=>motBookingStatus(j,[confirmation],[job])}},esc:v=>String(v).replaceAll('"','&quot;'),motTimeFromJob:j=>j.mot_time,hasMotJobType:()=>true};vm.createContext(context);vm.runInContext(functions,context);
  for(const renderer of ['plannerMotHeaderHtml','mobileMotAppointmentHtml']){
   const html=context[renderer](job),node=parseHTML(html).document.querySelector('span');assert.match(node.textContent,/MOT.*12:00.*✓/);assert.match(node.getAttribute('style'),/color:#15803d!important/);assert.match(node.title,/29421617/);
   const unmatched=context[renderer]({...job,mot_time:'13:00'});assert.doesNotMatch(unmatched,/#15803d|✓/);assert.match(unmatched,/needs checking/);
  }
 }
});

test('confirmed time survives stale local fields and exact quarter-hour times reopen unchanged',()=>{
 const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
 const functions=['motTimeFromJob','halfHourMotTimeOptions'].map(name=>html.match(new RegExp('function '+name+'\\([^\\n]+'))[0]).join('\n');
 const ctx={MOT_TIME_MARKER:/\[\[MOT_TIME:([^\]]+)\]\]/i,normaliseMotTime:x=>x||'',clockMinutes:s=>Number(s.slice(0,2))*60+Number(s.slice(3))};vm.createContext(ctx);vm.runInContext(functions,ctx);
 assert.equal(ctx.motTimeFromJob({mot_time:'09:00',customer_note:'Notes\n[[MOT_TIME:12:15]]'}),'12:15');
 assert.match(ctx.halfHourMotTimeOptions('12:15'),/<option value="12:15" selected>12:15<\/option>/);
 const booked={...job,drop_time:'12:15',mot_time:'09:00',customer_note:'[[MOT_TIME:12:15]]'};
 assert.equal(motBookingStatus(booked,[{...confirmation,time:'12:15'}],[booked]).confirmed,true);
});
