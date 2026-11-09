import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {relayTyreLookup} from '../../lib/tyre-relay.js';
import {catalogueGuide} from '../../lib/tyre-saved-guide.js';
import {bookingTyreParts} from '../../lib/tyre-cost-token.js';
import tyreGuide from '../../lib/tyre-guide-proxy.js';
const settings={showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1};
const captured=(size='205/55R16',checkedAt=new Date(Date.now()-2*86400000).toISOString(),unitPence=6200)=>({size,checkedAt,settings,catalogue:[{size,brand:'COMFORSER',model:'CF510 91V',unitPence,costNetPence:2086,defaultStockMinimum:1}]});
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
function client(){const ctx={setTimeout,clearTimeout,AbortController,Date};vm.runInNewContext(read('public/js/vecta-tyre-booking.js'),ctx);return ctx.VectaTyreBooking;}

test('saved fallback: offline, busy, errors, timeout and malformed live results use an independently timed exact-size catalogue',async()=>{
 for(const status of ['OFFLINE','BUSY','LOGIN_REQUIRED','SETTINGS_REQUIRED','DAILY_LIMIT','UNAVAILABLE','throw','MATCHED']){
  const calls=[];
  const result=await relayTyreLookup('205/55R16',4,{token:'a'.repeat(64),fetcher:async(_url,options)=>{
   const body=JSON.parse(options.body);calls.push({body,signal:options.signal});
   if(body.action==='enqueue'&&status==='throw')throw Error('timed out');
   return {ok:true,json:async()=>body.action==='cached'?{status:'MATCHED',result:captured()}:{status,result:{}}};
  }});
  assert.equal(result.priceSource,'saved');assert.equal(result.checkedAt.slice(0,10),captured().checkedAt.slice(0,10));
  assert.deepEqual(calls.map(x=>x.body.action),['enqueue','cached']);assert.notEqual(calls[0].signal,calls[1].signal);
 }
 for(const result of [captured('225/45R17'),captured('205/55R16','2020-01-01'),{...captured(),settings:{...settings,vatIncluded:false}}]){
  const data=await relayTyreLookup('205/55R16',1,{token:'a'.repeat(64),fetcher:async(_url,o)=>({ok:true,json:async()=>JSON.parse(o.body).action==='cached'?{status:'MATCHED',result}:{status:'OFFLINE'}})});
  assert.equal(data.status,'OFFLINE');
 }
});

test('saved prices retain genuine age, allow quantities 1–4 without stock promises, and carry an estimated private cost into bookings',()=>{
 const secret='s'.repeat(64),data={...captured(),priceSource:'saved'};
 for(let quantity=1;quantity<=4;quantity++){
  const result=catalogueGuide(data,{size:data.size,quantity,password:secret}),c=client();
  const clean=c.cleanResult(result,data.size,quantity),choice=clean.options[0].choices[0];
  assert.equal(choice.totalPence,6200*quantity);assert.equal(clean.checkedAt,data.checkedAt);assert.equal(clean.options[0].stockLevels.length,0);
  assert.match(c.priceNote(clean),/Saved guide prices.*last checked/);assert.ok(Date.now()-c.priceTime(clean)<1000);
  const body={tyre_size:data.size,tyre_quantity:quantity,tyre_choice:'Budget',tyre_brand:choice.brand,tyre_guide:{...choice,size:data.size,quantity}};
  const parts=bookingTyreParts(body,['Tyres'],secret);assert.equal(parts[0].cost_price,20.86);assert.equal(parts[0].cost_estimated,true);assert.match(parts[0].description,/Saved guide price.*Estimated supplier cost/);
  assert.throws(()=>bookingTyreParts(body,['Tyres'],secret,Date.now()+31*60000));
  assert.doesNotMatch(JSON.stringify(result),/costNetPence|20\.86/);
  for(const patch of [{servedAt:'2000-01-01'},{checkedAt:'2000-01-01'},{availabilityUnconfirmed:false}])assert.throws(()=>c.cleanResult({...result,...patch},data.size,quantity));
 }
 const noStock=catalogueGuide({...data,catalogue:data.catalogue.map(row=>({...row,defaultStockMinimum:0}))},{size:data.size,quantity:1});assert.equal(noStock.options.some(x=>x.available),false);
});

test('public relay fallback → booking cards → saved selection retains price source and date',async()=>{
 const oldEnv={...process.env},oldFetch=globalThis.fetch;
 process.env.HAYNES_RELAY_SITE_TOKEN='a'.repeat(64);process.env.GSF_SERVICE_QUOTE_SECRET='s'.repeat(64);delete process.env.TYRE_WORKER_URL;delete process.env.TYRE_WORKER_TOKEN;
 try{
  globalThis.fetch=async(_url,o)=>({ok:true,json:async()=>JSON.parse(o.body).action==='cached'?{status:'MATCHED',result:captured()}:{status:'OFFLINE'}});
  const res={setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};
  await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:4}},res);assert.equal(res.code,200);assert.equal(res.body.priceSource,'saved');
  const {parseHTML}=await import('linkedom'),{document}=parseHTML('<html><body><main></main></body></html>');
  const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:4,tyre_choice:'',nevos_vehicle:'no'};
  const ctx=vm.createContext({document,state:{form},VectaTyreBooking:client(),renderActions(){},esc:String,Intl,Date});
  const html=read('website/booking/index.html');vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),ctx);
  document.querySelector('main').innerHTML=ctx.tyreOptionsHtml();vm.runInContext('tyreGuideState={status:"matched",result:'+JSON.stringify(res.body)+'};refreshTyrePanel()',ctx);
  assert.match(document.querySelector('#tyreGuideStatus').textContent,/Saved guide prices/);assert.equal(document.querySelector('.tyre-guide-price').textContent,'£62');
  document.querySelector('[data-tyre-brand="COMFORSER"]').click();assert.equal(form.tyre_guide.priceSource,'saved');assert.equal(form.tyre_guide.totalPence,24800);
  assert.match(ctx.tyreBookingDescription(),/Saved guide price.*£248 total/);assert.match(ctx.tyreBookingDescription(),/Confirm price and availability/);assert.equal(ctx.tyreStockLimit('budget'),null);
  form.nevos_vehicle='yes';document.querySelector('main').innerHTML=ctx.tyreOptionsHtml();assert.equal(document.querySelector('[data-tyre-choice="Budget"]').disabled,true);
 }finally{process.env=oldEnv;globalThis.fetch=oldFetch;}
});

test('Postgres upgrade, learning, queue priority, throttling, failed results and access controls',async()=>{
 const db=new PGlite();
 try{
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table public.haynes_relay_worker(id int,token_hash text,site_token_hash text); insert into public.haynes_relay_worker values(1,'worker','site');");
  await db.exec(read('docs/sql/tyre-relay.sql'));
  const initial=captured();await db.query("insert into public.tyre_relay_jobs(size,quantity,status,result) values($1,1,'MATCHED',$2)",[initial.size,JSON.stringify(initial)]);
  await db.exec(read('docs/sql/tyre-price-catalogue.sql'));
  const rpc=async(action,payload={},token=['pull','complete'].includes(action)?'worker':'site')=>(await db.query('select public.tyre_relay($1,$2::jsonb,$3) as r',[action,JSON.stringify(payload),token])).rows[0].r;
  const scalar=async(sql)=>(await db.query(sql)).rows[0];
  assert.equal((await scalar('select count(*)::int as n from public.tyre_price_catalogue')).n,60);
  assert.equal((await rpc('cached',{size:initial.size,quantity:4})).result.checkedAt,initial.checkedAt);
  assert.equal((await rpc('cached',{size:initial.size,quantity:1},'worker')).status,'UNAUTHORIZED');
  assert.equal((await rpc('pull',{},'site')).status,'UNAUTHORIZED');
  assert.equal((await scalar("select has_table_privilege('anon','public.tyre_price_catalogue','SELECT') as allowed")).allowed,false);
  assert.equal((await scalar("select has_function_privilege('authenticated','public.tyre_relay(text,jsonb,text)','EXECUTE') as allowed")).allowed,false);
  await db.exec("grant select on public.haynes_relay_worker to service_role; set role service_role;");
  // Offline customer searches teach new sizes, including requests with no price yet.
  assert.equal((await rpc('enqueue',{size:'255/30R20',quantity:2})).status,'OFFLINE');
  assert.equal((await scalar("select search_count from public.tyre_price_catalogue where size='255/30R20'")).search_count,1);
  assert.equal((await rpc('pull')).status,'IDLE'); // customer activity defers warming
  await db.exec("update public.tyre_price_catalogue set last_requested_at=null;");
  const bg=await rpc('pull');assert.equal(bg.status,'JOB');assert.equal(bg.size,'255/30R20');
  assert.equal((await rpc('pull')).status,'IDLE'); // never overlap supplier searches
  // Customer queue gets the next pull, even during background throttling.
  const customer=await rpc('enqueue',{size:initial.size,quantity:2});assert.equal(customer.status,'PENDING');
  const fresh=captured(bg.size,new Date().toISOString(),9900);
  assert.equal((await rpc('complete',{id:bg.id,lease:bg.lease,status:'MATCHED',result:fresh})).status,'SAVED');
  const work=await rpc('pull');assert.equal(work.id,customer.id);
  assert.equal((await rpc('complete',{id:work.id,lease:bg.lease,status:'MATCHED',result:captured(initial.size,new Date().toISOString())})).status,'EXPIRED');
  assert.equal((await rpc('complete',{id:work.id,lease:work.lease,status:'UNAVAILABLE'})).status,'SAVED');
  assert.equal((await rpc('cached',{size:initial.size,quantity:2})).result.checkedAt,initial.checkedAt); // failure never overwrites
  await db.exec("update public.tyre_price_catalogue set last_requested_at=null;");assert.equal((await rpc('pull')).status,'IDLE'); // 30-second rate limit
  assert.equal((await rpc('enqueue',{size:bg.size,quantity:1})).status,'MATCHED'); // real fresh cache
  // Completing an empty search preserves the previous successful snapshot.
  const job=await rpc('enqueue',{size:initial.size,quantity:1});const pulled=await rpc('pull');assert.equal(pulled.id,job.id);
  await rpc('complete',{id:pulled.id,lease:pulled.lease,status:'MATCHED',result:{...captured(initial.size,new Date().toISOString()),catalogue:[]}});
  assert.equal((await rpc('cached',{size:initial.size,quantity:1})).result.checkedAt,initial.checkedAt);
  // A late lease cannot update prices; queue deletion cannot remove learned prices.
  const late=await rpc('enqueue',{size:'205/65R15',quantity:1});const lease=await rpc('pull');assert.equal(lease.id,late.id);
  await db.query("update public.tyre_relay_jobs set deadline=now()-interval '1 second' where id=$1",[late.id]);
  assert.equal((await rpc('complete',{id:late.id,lease:lease.lease,status:'MATCHED',result:captured('205/65R15',new Date().toISOString())})).status,'EXPIRED');
  await db.exec("delete from public.tyre_relay_jobs; update public.tyre_price_catalogue set last_requested_at=null;");
  const next=await rpc('pull');assert.equal(next.status,'JOB');
  await rpc('complete',{id:next.id,lease:next.lease,status:'LOGIN_REQUIRED'});
  await db.exec("update public.tyre_relay_jobs set created_at=now()-interval '11 minutes';");assert.equal((await rpc('pull')).status,'IDLE'); // login pause
  await db.exec("update public.tyre_relay_runtime set background_after=null; delete from public.tyre_relay_jobs; update public.tyre_price_catalogue set last_attempt_at=null;");
  const retry=await rpc('pull');assert.equal(retry.status,'JOB');
  await rpc('complete',{id:retry.id,lease:retry.lease,status:'UNAVAILABLE'});
  assert.equal((await rpc('pull')).status,'IDLE'); // ordinary failure gets only a brief cooldown
  await db.query("update public.tyre_price_catalogue set last_attempt_at=now() where checked_at is null and size<>$1",[retry.size]);
  await db.exec("update public.tyre_relay_runtime set background_after=now()-interval '1 second'; update public.tyre_relay_jobs set created_at=now()-interval '31 seconds';");
  const secondTry=await rpc('pull');assert.equal(secondTry.status,'JOB');assert.equal(secondTry.size,retry.size); // retry once after the first sweep
  await rpc('complete',{id:secondTry.id,lease:secondTry.lease,status:'UNAVAILABLE'});
  await db.exec("update public.tyre_relay_runtime set background_after=now()-interval '1 second'; update public.tyre_relay_jobs set created_at=now()-interval '31 seconds';");
  const afterSecondFailure=await rpc('pull');assert.equal(afterSecondFailure.status,'JOB');assert.notEqual(afterSecondFailure.size,retry.size); // never loop one unavailable size forever
  assert.equal((await rpc('cached',{size:bg.size,quantity:1})).result.catalogue[0].unitPence,9900);
  await db.exec("update public.tyre_price_catalogue set checked_at=now()-interval '91 days' where result is not null;");assert.equal((await rpc('cached',{size:bg.size,quantity:1})).status,'UNAVAILABLE');
 }finally{await db.close();}
});
