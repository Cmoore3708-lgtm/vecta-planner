import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {dispatchTaskReminders} from '../../api/task-reminders.js';

test('only due, unfinished reminders reach manager devices and each delivery is leased separately',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table tasks(id uuid primary key, task_text text, done boolean);
    create table workshop_push_subscriptions(endpoint text primary key, subscription jsonb, audience text);`);
  await db.exec(fs.readFileSync('supabase/migrations/20261127162000_task_reminders.sql','utf8'));
  await db.exec(`insert into workshop_push_subscriptions values ('phone','{}','manager'),('tablet','{}','mechanic');
   insert into tasks values (gen_random_uuid(),'Take car for MOT',false,now()-interval '1 minute'),
    (gen_random_uuid(),'Monday quote',false,now()+interval '1 day'),(gen_random_uuid(),'Completed',true,now());`);
  const claim=async()=>(await db.query('select * from claim_task_reminders()')).rows;
  const [row]=await claim();assert.equal(row.endpoint,'phone');assert.equal(row.task_text,'Take car for MOT');
  assert.deepEqual(await claim(),[]);
  await db.exec("update task_reminder_deliveries set retry_at=now()-interval '1 minute'");
  assert.equal((await claim()).length,1);
  await db.exec('update task_reminder_deliveries set sent=true,retry_at=now()');
  assert.deepEqual(await claim(),[]);
  await db.exec("update tasks set remind_at=now() where task_text='Take car for MOT'");
  assert.equal((await claim()).length,1);
 }finally{await db.close()}
});

test('sends the actual reminder with high urgency and retries temporary failures independently',async()=>{
 const writes=[],payloads=[];
 const subscriptions=['working','temporary','expired'].map(endpoint=>({task_id:'abc',remind_at:'2026-11-30T09:00:00Z',task_text:'Work out the quote',endpoint,subscription:{endpoint}}));
 const result=await dispatchTaskReminders(async(path,options)=>{if(path.startsWith('rpc/'))return subscriptions;writes.push([path,options.method])},async(s,payload,options)=>{
  if(s.endpoint!=='working')throw Object.assign(Error(),{statusCode:s.endpoint==='expired'?410:503});payloads.push([payload,options]);
 });
 assert.deepEqual(result,{claimed:3,failed:1});
 assert.equal(payloads[0][0].body,'Work out the quote');assert.equal(payloads[0][1].urgency,'high');
 assert.equal(writes.length,2);assert.ok(writes.some(([p,m])=>p.includes('working')&&m==='PATCH'));
});
