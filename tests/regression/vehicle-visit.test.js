import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {londonDay,progressSnapshot} from '../../lib/job-progress.js';
import {garageReadyForCollection} from '../../lib/customer-garage.js';

const id='11111111-1111-4111-8111-111111111111',date='2026-11-18';
const job={id,registration:'AB12 CDE',booking_date:date,status:'booked'};
const rules=globalThis.VectaVisitRules;
test('morning defaults, persistent no-show, workshop, collection and future dates',()=>{
  const state=patch=>rules.state({...job,...patch},{today:date});
  assert.equal(state({}),'waiting');
  const missing={visit_presence:'missing',visit_presence_date:date};
  assert.equal(state(missing),'missing');
  assert.equal(state({...missing,status:'in_progress'}),'underway');
  assert.equal(state({...missing,visit_billing:'due'}),'due');
  assert.equal(state({...missing,visit_billing:'paid'}),'paid');
  assert.equal(state({...missing,visit_billing:'paid',visit_presence:'collected'}),'collected');
  assert.equal(state({...missing,booking_date:'2026-11-19'}),'scheduled');
  assert.equal(state({...missing,visit_presence_date:'2026-11-17'}),'waiting');
  assert.equal(londonDay(Date.parse('2026-07-01T23:00:00Z')),'2026-07-02');
});
test('registration tracking hides payment while private tracking and eligible alerts follow the invoice',()=>{
  const paid={...job,visit_billing:'paid',source:'staff'};
  const now=Date.parse(date+'T10:00Z');
  assert.match(progressSnapshot(paid,{account:'Staff',now}).title,/Paid/);
  assert.doesNotMatch(progressSnapshot(paid,{now}).title,/paid|payment/i);
  assert.equal(garageReadyForCollection({...job,status:'ready_to_invoice',source:'staff'}),false);
  assert.equal(garageReadyForCollection(paid),true);
  assert.equal(garageReadyForCollection({...paid,visit_presence:'collected',visit_presence_date:date}),false);
});
test('Postgres updates visit billing atomically on invoice creation, payment changes and cancellation',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create table jobs(id uuid primary key,registration text,booking_date date);create table invoices(id int primary key,job_id uuid,registration text,status text,payment_method text,fleet_customer text,eom_month text,source text);');
    await db.exec(readFileSync('supabase/migrations/20261118075500_vehicle_visit_tracking.sql','utf8'));
    await db.query('insert into jobs values ($1,$2,$3)',[id,job.registration,date]);
    const billing=async()=>(await db.query('select visit_billing from jobs')).rows[0].visit_billing;
    await db.query("insert into invoices(id,job_id,registration,status) values (1,$1,'AB12CDE','draft')",[id]);
    assert.equal(await billing(),null);
    await db.exec("update invoices set status='saved'");assert.equal(await billing(),'due');
    for(const method of ['card','cash','bacs']){
      await db.query('update invoices set payment_method=$1',[method]);assert.equal(await billing(),'paid');
      await db.exec("update invoices set payment_method=''");assert.equal(await billing(),'due');
    }
    await db.exec("update invoices set status='part_paid',payment_method='card'");assert.equal(await billing(),'due');
    await db.exec("update invoices set status='void'");assert.equal(await billing(),null);
    await db.exec("update invoices set status='saved',registration='OTHER'");assert.equal(await billing(),null);
    await db.exec("update invoices set registration='AB12CDE',source='fleet_eom'");assert.equal(await billing(),null);
    await db.exec("update invoices set source=null");assert.equal(await billing(),'paid');
    await db.query("insert into invoices(id,job_id,registration,status) values (2,$1,'AB12CDE','saved')",[id]);assert.equal(await billing(),'due');
    await db.exec('delete from invoices where id=2');assert.equal(await billing(),'paid');
    await db.exec('delete from invoices');assert.equal(await billing(),null);
  }finally{await db.close();}
});
