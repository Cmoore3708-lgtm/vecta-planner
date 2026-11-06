import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { createVehicleLookup } from '../../api/vehicle-lookup.js';
import { servicePriceHandler } from '../../api/service-price.js';

const hosted = process.env.GITHUB_EVENT_NAME === 'pull_request' &&
  process.env.GITHUB_HEAD_REF === 'qa/nmuk-burst-591' && process.env.GITHUB_BASE_REF === 'amendment/booking-lookup-surge-retry' &&
  process.env.GITHUB_WORKFLOW === 'VECTA regression suite' && process.env.GITHUB_RUN_ATTEMPT === '1';
const local = !process.env.GITHUB_ACTIONS && process.env.SURGE_LOCAL === '1';
const origin = 'https://vecta-planner-bpwbjrphb-vectaplanner.vercel.app';
const revision = '244c56de639b509662addf79625f6b65a4c91660';
const html = readFileSync('public/booking.html','utf8');
const scripts = ['vecta-booking-tracking','vecta-booking-transfer','vecta-tyre-booking','vecta-haynes-booking','vecta-service-pricing','vecta-vehicle-image']
  .map(name=>new vm.Script(readFileSync('public/js/'+name+'.js','utf8')));
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if(m[1])scripts.push(new vm.Script(m[1]));
const pause = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const json=(data,status=200,headers={})=>Response.json(data,{status,headers});
async function call(handler,request){
  const response = {headers:new Headers(),setHeader(k,v){this.headers.set(k,v)},status(v){this.code=v;return this},json(body){this.body=body;return this}};
  await handler(request,response);
  return json(response.body,response.code,response.headers);
}
async function until(f){
  for(let i=0;i<150;i++){if(f())return;await pause(100)}
  throw Error('Timed out waiting for a form step');
}
test('registration, guide prices, calendar and competing bookings', {skip:!hosted&&!local}, async()=>{
  if(hosted){
    assert.ok(Date.now() < Date.parse('2026-11-07T00:00:00Z'),'one-off rehearsal expired');
    const get=async path=>{const r=await fetch(origin+path,{redirect:'error'});assert.equal(r.status,200);return r.json()};
    const [release,config]=await Promise.all([get('/api/supabase-config?action=release'),get('/api/supabase-config')]);
    assert.equal(release.environment,'preview');assert.equal(release.commit,revision);
    assert.equal(config.supabaseUrl,'https://brqsejjykrubxuofavuu.supabase.co');
    const page=await fetch(origin+'/booking.html',{redirect:'error'});
    assert.equal(page.status,200);assert.equal(await page.text(),html);
  }
  const saved=new Map(),reserved=new Set(),requests=[];
  const simulatedSlots=['2026-11-11','2026-11-12','2026-11-13'].map(date=>({date,time:'08:00',technician:'Alfie',hours:1}));
  const api=async(path,options)=>{
    if(hosted)return fetch(origin+path,{...options,redirect:'error'});
    if(path==='/api/availability')return json({slots:simulatedSlots});
    const body=JSON.parse(options.body);
    if(saved.has(body.request_id))return json(saved.get(body.request_id));
    if(reserved.has(body.appointment_date))return json({error:'That appointment is no longer available. Please choose another available date.'},409);
    reserved.add(body.appointment_date);
    const data={ok:true,request_id:body.request_id,date:body.appointment_date,time:body.appointment_time,receipt_email:'pending'};
    saved.set(data.request_id,data);return json(data,201);
  };
  let supplierCalls=0;
  const env={DVSA_CLIENT_ID:'fixture',DVSA_CLIENT_SECRET:'fixture',DVSA_SCOPE:'mot',DVSA_TOKEN_URL:'https://token.test',DVSA_API_KEY:'fixture'};
  const lookup=createVehicleLookup({env,fetch:async url=>{
    if(url===env.DVSA_TOKEN_URL)return json({access_token:'fixture',expires_in:600});
    supplierCalls++;await pause(50);
    return json({registration:url.split('/').at(-1),make:'TOYOTA',model:'AURIS',engineSize:1600,fuelType:'Petrol'});
  }});
  const pricing=servicePriceHandler({env:{GSF_SERVICE_PRICING_ENABLED:'true',GSF_SERVICE_PRICING_POLICY:readFileSync('workers/gsf/pricing-policy.example.json','utf8'),GSF_SERVICE_QUOTE_SECRET:'a'.repeat(64)},queue:async()=>({status:'BUSY'})});
  const sessions=Array.from({length:100},(_,i)=>{
    const reg='SUR'+String(i).padStart(5,'0'),{document,window}=parseHTML(html);
    const proto=window.HTMLElement.prototype;
    proto.showModal=function(){this.setAttribute('open','')};
    proto.close=function(){this.removeAttribute('open')};
    const s={i,reg,retries:0,prices:0,availability:0,responses:[],alerts:[]};
    const root={document,URL,URLSearchParams,location:{search:''},AbortController,AbortSignal,console,crypto,
      setTimeout:(fn,ms)=>setTimeout(fn,ms).unref(),clearTimeout,setInterval:(fn,ms)=>setInterval(fn,ms).unref(),clearInterval,alert:msg=>s.alerts.push(msg)};
    root.window=root;
    root.fetch=async(url,options)=>{
      const path=String(url).split('?')[0];
      if(path==='/api/vehicle-lookup'){
        const r=await call(lookup,{method:'GET',query:{reg}});if(r.status===503)s.retries++;
        return r;
      }
      if(path==='/api/haynes-vehicle')return json({status:'MATCHED',vehicle:{registration:reg,make:'TOYOTA',model:'AURIS',variant:'1.6',vehicle:'TOYOTA AURIS 1.6',typeId:'test'}});
      if(path==='/api/service-price'){
        s.prices++;return call(pricing,{method:'POST',body:JSON.parse(options.body),headers:{}});
      }
      if(path==='/api/availability'){
        s.availability++;return api(path,options);
      }
      if(path==='/api/website-booking'){
        const body=JSON.parse(options.body);
        assert.equal(body.registration,reg);assert.equal(body.email,'surge-591-'+i+'@example.invalid');
        assert.match(body.request_id,/^[a-f\d-]{36}$/);assert.deepEqual(body.job_types,['Full Service']);
        assert.ok(body.approximate_cost>0);assert.equal(body.mini_valet,true);
        assert.equal(s.selected,body.appointment_date);assert.equal(body.appointment_time,s.time);assert.ok(s.allowed);
        const r=await api(path,options);
        s.responses.push({status:r.status,id:body.request_id});requests.push(body.request_id);
        if(i===98&&r.status===201)throw new TypeError('Simulated lost response');
        return r;
      }
      return json({});
    };
    vm.createContext(root);scripts.forEach(script=>script.runInContext(root));
    s.doc=document;s.run=code=>vm.runInContext(code,root);
    return s;
  });
  await Promise.all(sessions.map(s=>s.run('state.form.registration="'+s.reg+'";lookup(state.form.registration)')));
  const recovered=sessions.filter(s=>s.retries>0);
  assert.equal(recovered.length,36);assert.equal(supplierCalls,100);
  for(const s of sessions){
    assert.equal(s.run('state.lookup'),'success');
    await until(()=>s.run('state.step')===2);
    s.doc.querySelector('[data-type="Service"]').onclick();
    s.doc.querySelector('[data-service-choice="Full Service"]').onclick();
    const mileage=s.doc.querySelector('[data-field="mileage"]');mileage.value='45000';mileage.oninput({target:mileage});
    s.doc.querySelector('[data-save-service-mileage]').onclick();
  }
  await Promise.all(sessions.map(async s=>{
    await until(()=>s.run('servicePriceState.reason')==='BUSY');
    assert.match(s.doc.querySelector('.service-live-price-status').textContent,/guide price/i);
    await s.doc.querySelector('#next').onclick();
    assert.equal(s.run('state.step'),3);
    assert.ok(s.doc.querySelector('[data-mot-date]'),'calendar missing for '+s.reg);
  }));
  const finishers=[...sessions.slice(0,5),...sessions.slice(93,100)];
  for(const s of finishers){
    const slotIndex=s.i===98?1:s.i===99?2:0;
    const slot=s.run('state.form.available_slots')[slotIndex];
    s.selected=slot.date;s.time=slot.time;s.allowed=true;
    s.doc.querySelector('[data-mot-date="'+slotIndex+'"]').onclick();
    await s.doc.querySelector('#next').onclick();assert.equal(s.run('state.step'),4);
    for(const [field,value] of Object.entries({customer_name:'Synthetic Surge 591',phone:'00000000000',email:'surge-591-'+s.i+'@example.invalid'})){
      const el=s.doc.querySelector('[data-field="'+field+'"]');el.value=value;el.oninput({target:el});
    }
    await s.doc.querySelector('#next').onclick();assert.equal(s.run('state.step'),5);
    const valet=s.doc.querySelector('.mini-valet-offer input');valet.checked=true;valet.onchange();
  }
  assert.equal(new Set(finishers.map(s=>s.selected)).size,3);
  await Promise.all(finishers.map(s=>s.doc.querySelector('#send').onclick()));
  const confirmed=finishers.filter(s=>s.doc.querySelector('.booking-receipt'));
  assert.equal(confirmed.length,3,JSON.stringify(finishers.map(s=>({i:s.i,requests:s.responses,alerts:s.alerts}))));
  assert.equal(confirmed.filter(s=>s.selected===finishers[0].selected).length,1);
  const conflicts=finishers.filter(s=>!confirmed.includes(s));
  assert.ok(conflicts.every(s=>s.responses.at(-1)?.status===409&&s.alerts.some(a=>/another.*date|no longer available/i.test(a))));
  const lost=sessions[98];assert.deepEqual(lost.responses.map(r=>r.status),[201,200]);
  assert.equal(new Set(lost.responses.map(r=>r.id)).size,1);
  console.log('REHEARSAL',JSON.stringify({hosted,lookups:sessions.length,initiallyBusy:recovered.length,supplierCalls,guidePrices:sessions.filter(s=>s.prices>0).length,calendars:sessions.filter(s=>s.availability===1).length,submissions:finishers.length,sharedSlot:10,conflicts:conflicts.length,confirmed:confirmed.length,lostResponseRecovered:true,confirmedRefs:confirmed.map(s=>s.responses[0].id)}));
});
