import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {acknowledgePortalMessages,markPortalRead} from '../../lib/workshop-read-state.js';
import {portalWrite,portalQueue,portalSnapshot} from '../../lib/customer-portal.js';
import handler from '../../lib/job-progress-handler.js';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const job={id:id(9),registration:'TEST001',customer_email:'driver@example.invalid',booking_date:'2026-11-20',status:'booked'};
function database(){
 const rows=[1,2,3,4].map(n=>({id:id(n),seq:n,job_id:n===3?id(8):job.id,registration:job.registration,customer_email:job.customer_email,actor:'customer',kind:'message',message:'Question '+n,created_at:'2026-11-17T12:00:00Z',manager_alert:true,mechanic_at:n===2?'2026-11-17T12:00:00Z':null}));
 const calls=[],state={failReply:false,failAck:false};
 async function db(path,options={}){
  const url=new URL(path,'https://example.invalid'),params=url.searchParams,body=options.body&&JSON.parse(options.body);calls.push({path,body,method:options.method});
  if(url.pathname==='/rpc/vecta_customer_portal_write'){
   if(state.failReply)return {code:409,error:'Reply not saved'};
   let row=rows.find(r=>r.id===body.p_id);const replayed=!!row;
   if(!row){row={id:body.p_id,seq:5,job_id:body.p_job_id,actor:body.p_actor,kind:body.p_kind,message:body.p_message,details:body.p_details};rows.push(row);}
   return {code:200,event_id:row.id,replayed};
  }
  const source=url.pathname==='/customer_portal_events'?rows:url.pathname==='/jobs'?[job]:[];
  const found=source.filter(row=>[...params].every(([k,v])=>['select','order','limit','or'].includes(k)?true:v.startsWith('in.')?v.slice(4,-1).split(',').includes(row[k]):v==='is.null'?row[k]==null:v==='not.is.null'?row[k]!=null:v.startsWith('lt.')?row[k]<Number(v.slice(3)):v.startsWith('eq.')?String(row[k])===v.slice(3):true));
  if(options.method==='PATCH'){if(state.failAck)throw Error('Acknowledgement offline');for(const row of found)Object.assign(row,body);}
  return structuredClone(found);
 }
 return {rows,calls,state,db};
}
test('old read receipts never resolve outstanding messages; only explicit acknowledgement changes the role receipt',async()=>{
 const h=database();await markPortalRead(h.db,'manager',[id(1)]);
 assert.equal((await portalQueue(h.db)).events.find(e=>e.id===id(1)).acknowledged_at,null);
 assert.deepEqual(await acknowledgePortalMessages(h.db,'manager',[id(1)]),{acknowledged_ids:[id(1)]});const stamp=h.rows[0].manager_acknowledged_at;
 await acknowledgePortalMessages(h.db,'manager',[id(1)]);assert.equal(h.rows[0].manager_acknowledged_at,stamp);
 assert.equal(h.rows[1].manager_acknowledged_at,undefined);assert.equal(h.rows[0].message,'Question 1');
 assert.deepEqual(await acknowledgePortalMessages(h.db,'mechanic',[id(1),id(2)]),{acknowledged_ids:[id(2)]});
 assert.equal(h.rows[0].mechanic_acknowledged_at,undefined);assert.ok(h.rows[1].mechanic_acknowledged_at);
 assert.ok((await portalQueue(h.db)).events.find(e=>e.id===id(1)).acknowledged_at);
 assert.equal('acknowledged_at' in (await portalSnapshot(h.db,{job})).events[0],false);
});
test('a saved reply acknowledges only captured IDs on that customer job and cannot clear concurrent or cross-job messages',async()=>{
 const h=database();h.rows.push({...h.rows[0],id:id(6),seq:6});
 const result=await portalWrite(h.db,{job},{id:id(5),message:'We will call you.',reply_to_event_ids:[id(1),id(3),id(6)]},'workshop');
 assert.equal(result.ok,true);assert.deepEqual(result.acknowledged_ids,[id(1)]);assert.ok(h.rows[0].manager_acknowledged_at);
 for(const n of [2,3,4,6])assert.equal(h.rows.find(r=>r.id===id(n)).manager_acknowledged_at,undefined);
 // Retry with different IDs must use the actual persisted reply, not later messages.
 const retry=await portalWrite(h.db,{job},{id:id(5),message:'We will call you.',reply_to_event_ids:[id(2)]},'workshop');
 assert.deepEqual(retry.acknowledged_ids,[id(1)]);assert.equal(h.rows[1].manager_acknowledged_at,undefined);
});
test('failed replies do not acknowledge; acknowledgement failures do not misreport or duplicate a successful reply',async()=>{
 const h=database(),body={id:id(5),message:'We will call you.',reply_to_event_ids:[id(1)]};
 h.state.failReply=true;await assert.rejects(portalWrite(h.db,{job},body,'workshop'),/Reply not saved/);assert.equal(h.calls.some(c=>c.method==='PATCH'),false);
 h.state.failReply=false;h.state.failAck=true;const saved=await portalWrite(h.db,{job},body,'workshop');assert.equal(saved.ok,true);assert.equal(saved.acknowledgement_pending,true);assert.equal(h.rows[0].manager_acknowledged_at,undefined);
 h.state.failAck=false;const retry=await portalWrite(h.db,{job},body,'workshop');assert.deepEqual(retry.acknowledged_ids,[id(1)]);assert.equal(h.rows.filter(r=>r.actor==='workshop').length,1);
});
test('acknowledgement validates IDs, role, same-origin and sign-in before writing',async t=>{
 const db=()=>{throw Error('Must not access DB');};
 for(const ids of [null,['invalid'],Array(101).fill(id(1))])await assert.rejects(acknowledgePortalMessages(db,'manager',ids),/valid messages/);
 await assert.rejects(acknowledgePortalMessages(db,'customer',[id(1)]),/sign-in/);
 const old={VECTA_MAIN_USER:process.env.VECTA_MAIN_USER,VECTA_MAIN_PASSWORD:process.env.VECTA_MAIN_PASSWORD};Object.assign(process.env,{VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'test-password'});
 t.after(()=>{for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 for(const cross of [false,true]){const res={setHeader(){},status(code){this.code=code;return this;},json(){}};await handler({method:'POST',headers:{host:'planner.invalid','content-type':'application/json',...(cross?{origin:'https://other.invalid'}:{})},body:{action:'portal-acknowledge',event_ids:[id(1)]}},res);assert.equal(res.code,cross?403:401);}
});
test('upgrade preserves historical read messages as outstanding with unchanged RLS and no public grants',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create table customer_portal_events(id uuid primary key,message text,manager_read_at timestamptz);alter table customer_portal_events enable row level security;`);
  await db.query('insert into customer_portal_events values($1,$2,now())',[id(1),'Keep this message']);
  const sql=readFileSync('supabase/migrations/20261117163928_outstanding_customer_messages.sql','utf8');await db.exec(sql);await db.exec(sql);
  const row=(await db.query('select * from customer_portal_events')).rows[0];assert.equal(row.message,'Keep this message');assert.ok(row.manager_read_at);assert.equal(row.manager_acknowledged_at,null);assert.equal(row.mechanic_acknowledged_at,null);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname='customer_portal_events'")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_table_privilege('${role}','customer_portal_events','update') a`)).rows[0].a,false);
 }finally{await db.close();}
});
