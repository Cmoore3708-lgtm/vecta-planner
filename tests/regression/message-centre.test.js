import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import handler,{historyQuery,preparedRecord} from '../../api/message-centre.js';
import {managerSessionCookie} from '../../middleware.js';

const id='11111111-1111-4111-8111-111111111111';
const record={id,occurred_at:'2026-10-22T14:30:00.000Z',registration:'ab12 cde',method:'whatsapp',kind:'invoice',recipient:'447700900123',body:'Your invoice: https://workshop.example/i/example'};
test('prepared records normalise registration and cannot assert sent or delivered status',()=>{
  const row=preparedRecord({...record,status:'sent',sender:'forged'},Date.parse('2026-10-22T15:00Z'));
  assert.equal(row.registration,'AB12CDE');assert.equal(row.body,record.body);assert.equal(row.status,undefined);assert.equal(row.sender,undefined);
  assert.throws(()=>preparedRecord({...record,method:'system'}),/method/);
  assert.throws(()=>preparedRecord({...record,occurred_at:'2100-01-01'}),/time/);
});
test('vehicle search is sanitised; stable pagination preserves microseconds and rejects filter injection',()=>{
  assert.equal(historyQuery({registration:'ab12 cde'}).get('registration'),'like.*AB12CDE*');
  const cursor={time:'2026-10-22T14:30:00.123456+00:00',id:'prepared:'+id};
  const query=historyQuery({cursor:Buffer.from(JSON.stringify(cursor)).toString('base64url')});
  assert.ok(query.get('or').includes(cursor.time));
  assert.throws(()=>historyQuery({cursor:Buffer.from(JSON.stringify({...cursor,id:'x),status.eq.sent'})).toString('base64url')}),/page/);
  assert.throws(()=>historyQuery({id:'prepared:x&select=*'}),/reference/);
});
test('history API requires manager auth and same-origin writes; retries are immutable and never send messages',async()=>{
  const names=['VECTA_MAIN_USER','VECTA_MAIN_PASSWORD','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VERCEL_ENV'];
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]])),originalFetch=globalThis.fetch;
  Object.assign(process.env,{VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'message-test',VITE_SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only',VERCEL_ENV:'production'});
  const cookie=(await managerSessionCookie({user:'manager',password:'message-test'})).split(';')[0],calls=[],rows=new Map();
  globalThis.fetch=async(url,options={})=>{
    calls.push({url,options});assert.ok(url.startsWith('https://mock.invalid/rest/v1/'));
    if(options.method==='POST'){
      const row=JSON.parse(options.body);if(!rows.has(row.id))rows.set(row.id,row);
      assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
      return {ok:true,status:204};
    }
    return {ok:true,status:200,json:async()=>Array.from({length:51},(_,n)=>({id:'prepared:'+n,occurred_at:'2026-10-22T14:30:00.123456+00:00'}))};
  };
  async function run(method,body,headers={cookie,host:'workshop.example',origin:'https://workshop.example','content-type':'application/json'},query={}){
    let status,data;await handler({method,body,headers,query},{setHeader(){},status(s){status=s;return this},json(d){data=d;return this}});return {status,data};
  }
  try{
    assert.equal((await run('GET',null,{host:'workshop.example'})).status,401);assert.equal(calls.length,0);
    assert.equal((await run('POST',record,{cookie,host:'workshop.example',origin:'https://evil.example','content-type':'application/json'})).status,403);
    const body={...record,occurred_at:new Date().toISOString(),status:'sent'};
    assert.equal((await run('POST',body)).status,200);assert.equal((await run('POST',{...body,body:'changed'})).status,200);
    assert.equal(rows.size,1);assert.equal(rows.get(id).body,body.body);assert.equal(rows.get(id).status,undefined);
    const page=await run('GET');assert.equal(page.data.messages.length,50);assert.ok(page.data.next_cursor);
    assert.equal(JSON.parse(Buffer.from(page.data.next_cursor,'base64url')).time,'2026-10-22T14:30:00.123456+00:00');
  }finally{globalThis.fetch=originalFetch;for(const [key,value] of Object.entries(previous))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});

function browser(){
  const {document}=parseHTML('<html><head></head><body><div id="vectaMessageCentre"></div></body></html>'),storage={},calls=[];
  Object.defineProperties(storage,{
    getItem:{value:key=>storage[key]??null},setItem:{value:(key,value)=>{storage[key]=value}},removeItem:{value:key=>{delete storage[key]}}
  });
  let offline=true;
  const context={document,console,URL,URLSearchParams,Date,Set,AbortSignal,crypto,localStorage:storage,setTimeout(){},window:{location:{origin:'https://workshop.example'},addEventListener(){},alert(){throw Error('Unexpected alert')}},fetch:async(url,options)=>{
    calls.push({url,body:options?.body&&JSON.parse(options.body)});if(offline)throw Error('Offline');return {ok:true,json:async()=>({recorded:true})};
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-message-centre.js',import.meta.url),'utf8'),context);
  return {api:context.window.vectaMessages,storage,calls,online(){offline=false}};
}
test('offline WhatsApp preparation preserves exact text and retries with the same ID without sending',async()=>{
  const b=browser(),body='Hello Jane,\nYour total is £175.00.\nInvoice: https://workshop.example/i/test';
  const saved=b.api.fromUrl('https://wa.me/447700900123?text='+encodeURIComponent(body),{registration:'AB12 CDE',kind:'invoice'});
  await b.api.flush();assert.equal(Object.keys(b.storage).length,1);
  assert.equal(b.calls[0].body.body,body);assert.equal(b.calls[0].body.method,'whatsapp');assert.equal(b.calls[0].body.registration,'AB12CDE');
  b.online();await b.api.flush();assert.equal(Object.keys(b.storage).length,0);assert.equal(b.calls.at(-1).body.id,saved);
  assert.ok(b.calls.every(c=>c.url==='/api/message-centre'));
});
test('new records added during an in-flight flush all save, without changing previously queued records',async()=>{
  const b=browser();b.online();
  b.api.fromUrl('mailto:jane%40example.com?subject=Booking&body=First',{registration:'AB12 CDE',kind:'booking_confirmation'});
  b.api.fromUrl('mailto:john%40example.com?subject=Booking&body=Second',{registration:'XY34 ZAB',kind:'booking_confirmation'});
  await b.api.flush();assert.equal(Object.keys(b.storage).length,0);assert.equal(b.calls.length,2);
  assert.equal(b.calls[0].body.body,'First');assert.equal(b.calls[1].body.body,'Second');assert.notEqual(b.calls[0].body.id,b.calls[1].body.id);
});
