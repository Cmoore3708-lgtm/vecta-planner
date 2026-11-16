import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import handler from '../../api/whatsapp-webhook.js';
import {whatsappHistoryConfig,whatsappEvents,rawWebhookBody,validSignature} from '../../lib/whatsapp-history.js';
import {historyQuery} from '../../api/message-centre.js';

const settings={phoneId:'12345',accountId:'67890',secret:'fixture-secret',verifyToken:'fixture-verification'};
const message={id:'wamid.fixture==',from:'447700900123',timestamp:'1794823200',type:'text',text:{body:'Hello Chris,\nIs my car ready?'}};
const payload=(messages=[message],field='messages')=>({object:'whatsapp_business_account',entry:[{id:settings.accountId,changes:[{field,value:{messaging_product:'whatsapp',metadata:{phone_number_id:settings.phoneId,display_phone_number:'447700900999'},[field==='messages'?'messages':'message_echoes']:messages}}]}]});
const signature=raw=>'sha256='+createHmac('sha256',settings.secret).update(raw).digest('hex');
test('raw bytes, signature, size and dedicated Test credentials are required',async()=>{
  const raw=Buffer.from(JSON.stringify(payload(),null,2));
  assert.equal(validSignature(raw,signature(raw),settings.secret),true);
  assert.equal(validSignature(Buffer.from(JSON.stringify(payload())),signature(raw),settings.secret),false);
  assert.equal(validSignature(raw,'sha256=00',settings.secret),false);
  assert.equal(validSignature(raw,signature(raw),'wrong'),false);
  const request=new Request('https://fixture.invalid',{method:'POST',body:raw});
  assert.deepEqual(await rawWebhookBody(request),raw);
  await assert.rejects(rawWebhookBody(new Request('https://fixture.invalid',{method:'POST',body:Buffer.alloc(4*1024*1024+1)})),/large/);
  const env={WHATSAPP_PHONE_NUMBER_ID:settings.phoneId,WHATSAPP_BUSINESS_ACCOUNT_ID:settings.accountId,WHATSAPP_APP_SECRET:settings.secret,WHATSAPP_WEBHOOK_VERIFY_TOKEN:settings.verifyToken};
  assert.deepEqual(whatsappHistoryConfig(env,false),settings);
  assert.equal(whatsappHistoryConfig(env,true),null,'Test must not inherit production WhatsApp credentials');
  assert.deepEqual(whatsappHistoryConfig(Object.fromEntries(Object.entries(env).map(([k,v])=>['VECTA_TEST_'+k,v])),true),settings);
});
test('incoming text, outgoing echoes, media and private user IDs retain honest content and direction',()=>{
  const [incoming]=whatsappEvents(payload(),settings);
  assert.equal(incoming.body,message.text.body);assert.equal(incoming.direction,'incoming');assert.equal(incoming.sender,message.from);
  const echo={...message,from:'447700900999',to:'447700900123',text:{body:'Ready to collect.'}};
  const [outgoing]=whatsappEvents(payload([echo],'smb_message_echoes'),settings);assert.equal(outgoing.direction,'outgoing');assert.equal(outgoing.recipient,echo.to);
  const [media]=whatsappEvents(payload([{...message,type:'image',image:{caption:'Here is the damage',id:'media-id'}}]),settings);
  assert.match(media.body,/open WhatsApp to view/);assert.match(media.body,/damage/);
  const [privateUser]=whatsappEvents(payload([{...message,from:undefined,from_user_id:'US.fixture'}]),settings);assert.equal(privateUser.sender,'US.fixture');
  const wrong=payload();wrong.entry[0].id='999';assert.equal(whatsappEvents(wrong,settings).length,0);
  const wrongPhone=payload();wrongPhone.entry[0].changes[0].value.metadata.phone_number_id='999';assert.equal(whatsappEvents(wrongPhone,settings).length,0);
  const status=payload();delete status.entry[0].changes[0].value.messages;status.entry[0].changes[0].value.statuses=[{id:message.id,status:'read'}];assert.deepEqual(whatsappEvents(status,settings),[]);
});
test('webhook verifies ownership, persists once on retry and returns failure when storage fails',async()=>{
  const env={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app',VITE_SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',WHATSAPP_PHONE_NUMBER_ID:settings.phoneId,WHATSAPP_BUSINESS_ACCOUNT_ID:settings.accountId,WHATSAPP_APP_SECRET:settings.secret,WHATSAPP_WEBHOOK_VERIFY_TOKEN:settings.verifyToken};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch;
  Object.assign(process.env,env);const saved=new Map();let calls=0,failed=false;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://fixture.invalid/rest/v1/workshop_whatsapp_events?on_conflict=id');assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');if(failed)return {ok:false};for(const row of JSON.parse(options.body))if(!saved.has(row.id))saved.set(row.id,row);return {ok:true};};
  async function run(body=Buffer.from(JSON.stringify(payload())),headers={},method='POST',query={}){
    const response=await handler.fetch(new Request('https://fixture.invalid/api/whatsapp-webhook?'+new URLSearchParams(query),{method,body:method==='POST'?body:undefined,headers:{'content-type':'application/json','x-hub-signature-256':signature(body),...headers}}));
    return {status:response.status,data:response.headers.get('content-type').includes('application/json')?await response.json():await response.text()};
  }
  try{
    assert.equal((await run(undefined,{},'GET',{'hub.mode':'subscribe','hub.verify_token':'wrong','hub.challenge':'123'})).status,403);
    assert.deepEqual(await run(undefined,{},'GET',{'hub.mode':'subscribe','hub.verify_token':settings.verifyToken,'hub.challenge':'123'}),{status:200,data:'123'});
    assert.equal((await run(undefined,{'x-hub-signature-256':'sha256=bad'})).status,401);assert.equal(calls,0);
    assert.equal((await run()).status,200);assert.equal((await run()).status,200);assert.equal(saved.size,1);
    failed=true;assert.equal((await run()).status,503);
    delete process.env.WHATSAPP_APP_SECRET;assert.equal((await run()).status,503);
  }finally{globalThis.fetch=oldFetch;for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('channel, phone search and pagination combine without allowing query injection',()=>{
  const cursor=Buffer.from(JSON.stringify({time:'2026-11-16T10:00:00.123456+00:00',id:'whatsapp:'+'a'.repeat(64)})).toString('base64url');
  const params=historyQuery({method:'whatsapp',contact:'07700 900123',cursor});
  assert.equal(params.get('method'),'eq.whatsapp');assert.match(params.get('and'),/447700900123/);assert.match(params.get('or'),/123456/);
  assert.throws(()=>historyQuery({method:'whatsapp,system'}),/method/);assert.throws(()=>historyQuery({contact:'),id.neq.1'}),/phone/);
});
test('upgrade preserves old records, correctly filters WhatsApp, handles out-of-order edits/deletions and blocks browser access',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create table public.jobs(id uuid primary key,registration text,created_at timestamptz,booking_date date,work_required text,card_type text);
      create table public.nmuk_service_reminder_sends(id text primary key,job_id text,recipient text,status text,error text,sent_at timestamptz,created_at timestamptz default now());`);
    await db.exec(readFileSync('supabase/migrations/20261022150918_message_centre.sql','utf8'));
    await db.exec("insert into workshop_messages(id,method,kind,body,recipient) values('11111111-1111-4111-8111-111111111111','whatsapp','invoice','Prepared invoice','447700900123'); insert into nmuk_service_reminder_sends(id,status,recipient) values ('approval-wa:test','sent','447700900123'),('portal-wa:test','sent','447700900123'),('email:test','sent','fixture@example.invalid');");
    const before=(await db.query('select count(*)::int n from workshop_message_history')).rows[0].n;
    await db.exec(readFileSync('supabase/migrations/20261116152347_whatsapp_message_history.sql','utf8'));
    assert.equal((await db.query('select count(*)::int n from workshop_message_history')).rows[0].n,before);
    assert.equal((await db.query("select count(*)::int n from workshop_message_history where method='whatsapp'")).rows[0].n,3);
    const save=async row=>db.query('insert into workshop_whatsapp_events select * from jsonb_populate_record(null::workshop_whatsapp_events,$1::jsonb) on conflict do nothing',[JSON.stringify({...row,recorded_at:new Date().toISOString()})]);
    const edit={...message,id:'wamid.edit',timestamp:'1794823300',type:'edit',edit:{original_message_id:message.id,message:{type:'text',text:{body:'I will collect at 4pm.'}}}};
    await save(whatsappEvents(payload([edit]),settings)[0]);
    const original=whatsappEvents(payload(),settings)[0];await save(original);await save(original);
    let rows=(await db.query("select * from workshop_message_history where id like 'whatsapp:%'")).rows;
    assert.equal(rows.length,1);assert.match(rows[0].body,/Edited.*\nI will collect at 4pm/);assert.equal(rows[0].status,'received');assert.equal(rows[0].registration,'');
    const revoke={...message,id:'wamid.revoke',timestamp:'1794823400',type:'revoke',revoke:{original_message_id:message.id}};
    await save(whatsappEvents(payload([revoke]),settings)[0]);await save(original);
    assert.equal((await db.query("select body from workshop_message_history where id like 'whatsapp:%'")).rows[0].body,'[Deleted in WhatsApp]');
    const permissions=(await db.query("select relrowsecurity,has_table_privilege('anon',oid,'select') anon,has_table_privilege('authenticated',oid,'insert') authenticated,has_table_privilege('service_role',oid,'insert') service from pg_class where relname='workshop_whatsapp_events'")).rows[0];
    assert.deepEqual(permissions,{relrowsecurity:true,anon:false,authenticated:false,service:true});
    assert.equal((await db.query("select has_table_privilege('anon','workshop_message_history','select') allowed")).rows[0].allowed,false);
  }finally{await db.close();}
});
