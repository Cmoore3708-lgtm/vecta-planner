import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import sharp from 'sharp';
import {createSceneService,imageBytes,providerImageBytes,cronAuthorised,requestLimit,default as handler} from '../../lib/progress-scene-worker.js';
import {requestScenePreparation,sceneRequestId} from '../../lib/progress-scene-demand.js';
import {sceneIdentity,sceneFingerprint,sceneStages,scenePrompt,qualityChecks,qualityPassed,publishedScenes,sceneUrl} from '../../lib/progress-scene-model.js';
const reg='AB12CDE',base='https://jywufozycuwuoshlulwl.supabase.co',now=Date.parse('2026-11-03T12:00:00Z');
function fixture({cap=40,quality=true,generateFailure=false,viewed=true}={}){
 const rows=new Map(),calls=[],generated=[],drafts=new Map();let clock=now,checks=0,publishes=0;
 const art={registration:reg,make:'MAZDA',model:'6',colour:'RED',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'};
 rows.set('vehicle_artwork:'+reg,{id:'vehicle_artwork:'+reg,value:art,updated_at:new Date(now).toISOString()});
 const jobs=[{id:'12345678-1234-4234-8234-123456789012',registration:reg,booking_date:'2026-11-03',status:'booked',archived:false}];
 if(viewed)rows.set(sceneRequestId(reg),{id:sceneRequestId(reg),value:{registration:reg,fingerprint:sceneFingerprint(sceneIdentity(reg,[...rows.values()])),source:{kind:'job',id:jobs[0].id},status:'pending',requested_at:new Date(now).toISOString()},updated_at:new Date(now).toISOString()});
 const db=async(path,options={})=>{
  calls.push({path,options});const url=new URL('https://db.example/'+path),method=options.method||'GET';
  if(url.pathname==='/jobs')return jobs;
  const filter=url.searchParams.get('id');
  if(method==='GET'){
   if(filter.startsWith('in.('))return filter.slice(4,-1).split(',').map(id=>rows.get(id)).filter(Boolean);
   const found=filter.startsWith('like.')?[...rows.values()].filter(r=>r.id.startsWith(filter.slice(5,-1))):rows.has(filter.slice(3))?[rows.get(filter.slice(3))]:[];
   return structuredClone(found.filter(r=>!url.searchParams.has('value->>status')||'eq.'+r.value.status===url.searchParams.get('value->>status')));
  }
  const body=JSON.parse(options.body),id=body.id||filter.slice(3),old=rows.get(id);
  if(method==='POST'&&String(options.headers?.Prefer).includes('ignore-duplicates')&&old)return [];
  if(method==='PATCH'){
   if(!old)return [];
   for(const key of ['fingerprint','status'])if(url.searchParams.has('value->>'+key)&&url.searchParams.get('value->>'+key)!=='eq.'+old.value[key])return [];
   if(url.searchParams.get('updated_at')&&url.searchParams.get('updated_at')!=='eq.'+old.updated_at)return [];
   if(url.searchParams.get('value->>owner')&&url.searchParams.get('value->>owner')!=='eq.'+old.value.owner)return [];
  }
  const saved={...old,...body,id,updated_at:new Date(++clock).toISOString()};rows.set(id,structuredClone(saved));return [structuredClone(saved)];
 };
 const storage={base,async prepare(){},async draft(key,stage,bytes){drafts.set(key+':'+stage,bytes);},async read(key,stage){const bytes=drafts.get(key+':'+stage);if(!bytes)throw Error('Missing draft');return bytes;},async publish(key){publishes++;return Object.fromEntries(sceneStages.map(s=>[s,base+'/storage/v1/object/public/progress-scenes/'+key+'/'+s+'.webp']));}};
 const generate=async(identity,stage,reference)=>{generated.push({identity,stage,reference});if(generateFailure&&stage==='underway')throw Error('provider timeout');return Buffer.from('image:'+stage);};
 const validate=async()=>{checks++;return Object.fromEntries(qualityChecks.map(k=>[k,quality]));};
 return {rows,calls,jobs,generated,art,advance:ms=>{clock+=ms;},storage,db,generate,validate,service:createSceneService({db,storage,generate,validate,now:()=>clock,limit:()=>cap}),stats:()=>({checks,publishes})};
}
test('arbitrary makes/models/colours get distinct complete-scene fingerprints and prompts',()=>{
 for(const [make,model,colour]of [['MAZDA','6','RED'],['FORD','Transit','WHITE'],['NISSAN','Leaf (ZE1)','GREY']]){
  const identity=sceneIdentity(reg,[{id:'vehicle_artwork:'+reg,value:{make,model,colour,imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'}}]);
  assert.ok(identity);for(const stage of sceneStages){const prompt=scenePrompt(identity,stage);assert.ok(prompt.includes(make)&&prompt.includes(model)&&prompt.includes(colour)&&prompt.includes(reg));}
  assert.notEqual(sceneFingerprint(identity),sceneFingerprint({...identity,colour:'BLUE'}));assert.notEqual(sceneFingerprint(identity),sceneFingerprint({...identity,registration:'ZZ99ZZZ'}));
 }
 assert.equal(sceneIdentity(reg,[]),null);assert.equal(sceneIdentity('bad&select=*',[]),null);
 assert.equal(qualityPassed({same_vehicle:true}),false);
});
test('worker generates all three once, validates them, publishes together and reuses the set',async()=>{
 const f=fixture();assert.equal((await f.service.run()).status,'ready');assert.equal(f.generated.length,3);assert.deepEqual(f.stats(),{checks:1,publishes:1});
 assert.deepEqual(f.generated.map(item=>item.stage),['ready','waiting','underway']);
 assert.equal(f.generated[0].reference,undefined);
 for(const item of f.generated.slice(1))assert.deepEqual(item.reference,Buffer.from('image:ready'));
 assert.equal((await f.service.run()).idle,true);assert.equal(f.generated.length,3);
 const manifest=f.rows.get('progress_scenes_v1:'+reg).value;assert.equal(manifest.status,'ready');assert.ok(publishedScenes(manifest.identity,manifest,base));
 assert.equal(publishedScenes({...manifest.identity,colour:'BLUE'},manifest,base),null);
 assert.equal(publishedScenes(manifest.identity,{...manifest,registration:'OTHER'},base),null);
 assert.equal(publishedScenes(manifest.identity,{...manifest,scenes:{...manifest.scenes,ready:'https://evil.example/image.webp'}},base),null);
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,4);
});
test('future and past bookings never generate, even with queued demand',async()=>{
 for(const day of ['2026-11-02','2026-11-27']){
  const f=fixture();f.jobs[0].booking_date=day;
  assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,0);
  assert.equal(f.rows.get(sceneRequestId(reg)).value.status,'booking_unavailable');
  assert.equal(f.rows.has('progress_scene_usage_v1:2026-11'),false);
 }
 const untouched=fixture({viewed:false});assert.equal((await untouched.service.run()).idle,true);assert.equal(untouched.generated.length,0);
});
test('an early or legacy view cannot trigger generation on the booking day; a fresh view can',async()=>{
 for(const timestamp of [undefined,'invalid','2026-11-02T12:00:00Z']){
  const f=fixture();f.rows.get(sceneRequestId(reg)).value.requested_at=timestamp;
  assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,0);
  const identity=sceneIdentity(reg,[...f.rows.values()]);
  await requestScenePreparation({db:f.db,identity,source:{kind:'job',id:f.jobs[0].id},now});
  assert.equal((await f.service.run()).status,'ready');assert.equal(f.generated.length,3);
 }
});
test('UK summer midnight, not UTC midnight, controls booking-day generation',async()=>{
 for(const [instant,expected] of [['2026-07-01T22:59:59Z',0],['2026-07-01T23:00:00Z',3]]){
  const f=fixture(),time=Date.parse(instant);f.jobs[0].booking_date='2026-07-02';
  f.rows.get(sceneRequestId(reg)).value.requested_at=instant;
  const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:f.validate,now:()=>time,limit:()=>40});
  await service.run();assert.equal(f.generated.length,expected);
 }
});
test('rescheduling while preparing prevents further paid image requests',async()=>{
 const f=fixture();const service=createSceneService({db:f.db,storage:f.storage,generate:async(...args)=>{const image=await f.generate(...args);f.jobs[0].booking_date='2026-11-04';return image;},validate:f.validate,now:()=>now,limit:()=>40});
 await assert.rejects(service.run(),/booking day/);assert.equal(f.generated.length,1);assert.equal(f.stats().checks,0);
});
test('failed visual checks never publish, retries stop after two attempts per image',async()=>{
 const f=fixture({quality:false});assert.equal((await f.service.run()).status,'pending');assert.equal((await f.service.run()).status,'needs_review');assert.equal((await f.service.run()).idle,true);
 assert.equal(f.generated.length,6);assert.equal(f.stats().publishes,0);assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.scenes,undefined);
});
test('provider failure saves successful drafts and only retries the missing image',async()=>{
 const f=fixture({generateFailure:true});await f.service.run();assert.equal(f.stats().checks,0);await f.service.run();assert.equal(f.generated.length,4);assert.equal(f.generated.filter(x=>x.stage==='waiting').length,1);assert.equal(f.stats().publishes,0);await f.service.run();assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'needs_review');
 assert.equal(f.generated.filter(x=>x.stage==='ready').length,1);
 for(const item of f.generated.filter(x=>x.stage==='underway'))assert.deepEqual(item.reference,Buffer.from('image:ready'));
});
test('a failed clean reference never generates independent scenes and stops after two attempts',async()=>{
 const f=fixture(),stages=[];
 const service=createSceneService({db:f.db,storage:f.storage,generate:async(_identity,stage)=>{stages.push(stage);throw Error('provider timeout');},validate:f.validate,now:()=>now,limit:()=>40});
 assert.equal((await service.run()).status,'pending');assert.equal((await service.run()).status,'pending');assert.equal((await service.run()).idle,true);
 assert.deepEqual(stages,['ready','ready']);assert.equal(f.stats().checks,0);assert.equal(f.stats().publishes,0);
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,2);
 assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'needs_review');
});
test('a slow reference is saved and resumed without paying to regenerate it',async()=>{
 const f=fixture(),original=f.storage.draft;
 f.storage.draft=async(key,stage,bytes)=>{await original(key,stage,bytes);if(stage==='ready')f.advance(95000);};
 assert.equal((await f.service.run()).status,'pending');assert.deepEqual(f.generated.map(x=>x.stage),['ready']);
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,1);
 assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.drafts.ready,true);
 assert.equal((await f.service.run()).status,'ready');assert.deepEqual(f.generated.map(x=>x.stage),['ready','waiting','underway']);
 for(const item of f.generated.slice(1))assert.deepEqual(item.reference,Buffer.from('image:ready'));
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,4);
});
test('different or uncertain alloys alone reject the entire set with bounded retries',async()=>{
 for(const mismatch of [false,undefined]){
  const f=fixture();const validate=async()=>({...Object.fromEntries(qualityChecks.map(k=>[k,true])),same_alloy_wheels:mismatch});
  assert.equal(qualityPassed(await validate()),false);
  const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate,now:()=>now,limit:()=>40});
  assert.equal((await service.run()).status,'pending');assert.equal((await service.run()).status,'needs_review');assert.equal((await service.run()).idle,true);
  assert.equal(f.stats().publishes,0);assert.equal(f.generated.length,6);
  assert.deepEqual(f.rows.get('progress_scenes_v1:'+reg).value.failed_checks,['same_alloy_wheels']);
 }
});
test('incorrect or uncertain manufacturer branding cannot publish a new scene set',async()=>{
 for(const check of ['correct_manufacturer_emblems','exterior_emblems_raised','floor_emblem_painted_in_perspective']){
  for(const result of [false,undefined]){
   const f=fixture();
   const validate=async()=>({...Object.fromEntries(qualityChecks.map(k=>[k,true])),[check]:result});
   const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate,now:()=>now,limit:()=>40});
   assert.equal((await service.run()).status,'pending');
   assert.equal((await service.run()).status,'needs_review');
   assert.equal((await service.run()).idle,true);
   assert.equal(f.stats().publishes,0);
   assert.deepEqual(f.rows.get('progress_scenes_v1:'+reg).value.failed_checks,[check]);
  }
 }
});
test('monthly reservations and distributed worker lock prevent duplicate or over-limit generation',async()=>{
 const f=fixture({cap:3});await assert.rejects(f.service.run(),/limit reached/);assert.equal(f.generated.length,0);
 const g=fixture();g.rows.set('progress_scene_worker_lock_v1',{id:'progress_scene_worker_lock_v1',value:{owner:'other',until:now+600000},updated_at:new Date(now).toISOString()});assert.deepEqual(await g.service.run(),{busy:true});assert.equal(g.generated.length,0);
 const h=fixture();const result=await Promise.all([h.service.run(),h.service.run()]);assert.equal(result.filter(r=>r.busy).length,1);assert.equal(h.generated.length,3);
});
test('dry runs are read-only and cancelled jobs never generate',async()=>{
 const f=fixture();const result=await f.service.run({dryRun:true});assert.equal(result.paid_generation,false);assert.equal(f.generated.length,0);assert.ok(f.calls.every(c=>!c.options.method));
 f.jobs[0].status='cancelled';assert.equal((await f.service.run()).idle,true);assert.equal(f.generated.length,0);
});
test('model correction during generation prevents publication of stale vehicle scenes',async()=>{
 const f=fixture();const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:async()=>{f.art.colour='BLUE';return Object.fromEntries(qualityChecks.map(k=>[k,true]));},now:()=>now,limit:()=>40});
 assert.equal((await service.run()).status,'identity_changed');assert.equal(f.stats().publishes,0);
});
test('unsafe or incomplete image payloads and URLs cannot become customer scenes',()=>{
 for(const value of [null,'AAAA','https://evil/image.webp','='.repeat(30)])assert.throws(()=>imageBytes(value));
 const bytes=Buffer.alloc(1100);bytes.write('RIFF');bytes.write('WEBP',8);assert.equal(imageBytes(bytes.toString('base64')).length,1100);
 assert.equal(sceneUrl(base+'/storage/v1/object/public/progress-scenes/'+'a'.repeat(64)+'/waiting.webp',base,'waiting'),true);assert.equal(sceneUrl(base+'/storage/v1/object/public/progress-scenes/'+'a'.repeat(64)+'/waiting.webp?token=evil',base,'waiting'),false);
});
test('public callers cannot run generation; disabled scheduler performs no provider or database requests',async()=>{
 const names=['CRON_SECRET','VECTA_PROGRESS_SCENES_ENABLED','VECTA_PROGRESS_SCENES_BUDGET_CONFIRMED','VECTA_PROGRESS_SCENES_MONTHLY_REQUESTS'],old=Object.fromEntries(names.map(k=>[k,process.env[k]])),original=global.fetch;
 Object.assign(process.env,{CRON_SECRET:'test-secret',VECTA_PROGRESS_SCENES_ENABLED:'0',VECTA_PROGRESS_SCENES_MONTHLY_REQUESTS:'40'});let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected request');};
 const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
 try{
  for(const req of [{method:'GET',headers:{}},{method:'POST',headers:{host:'planner.example',origin:'https://evil.example'},body:{action:'run'}}]){const r=response();await handler(req,r);assert.equal(r.code,401);}
  const r=response();await handler({method:'GET',headers:{authorization:'Bearer test-secret'}},r);assert.equal(r.body.paid_generation,false);assert.equal(calls,0);
  assert.equal(cronAuthorised({headers:{authorization:'Bearer test-secret-extra'}}),false);assert.equal(requestLimit(),40);process.env.VECTA_PROGRESS_SCENES_MONTHLY_REQUESTS='0';assert.equal(requestLimit(),0);
 }finally{global.fetch=original;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('customer renderer accepts trusted complete sets for any registration and rejects arbitrary image origins',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 const scenes=Object.fromEntries(sceneStages.map(s=>[s,base+'/storage/v1/object/public/progress-scenes/'+'a'.repeat(64)+'/'+s+'.webp']));let data={registration:reg,stage:'underway',title:'Working',scenes};
 const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
 for(const card of document.querySelectorAll('[data-scene]')){assert.equal(card.querySelector('.approvedScene').getAttribute('src'),scenes[card.dataset.scene]);assert.equal(card.querySelector('.vehicleLayer').hidden,true);}
 data={...data,stage:'scheduled',title:'Your booking is confirmed'};await document.getElementById('refresh').onclick();
 for(const card of document.querySelectorAll('[data-scene]')){assert.equal(card.querySelector('.approvedScene').hidden,true);assert.equal(card.querySelector('.approvedScene').hasAttribute('src'),false);}
 data={...data,scenes:{...scenes,ready:'https://evil.example/car.webp'}};await document.getElementById('refresh').onclick();for(const card of document.querySelectorAll('[data-scene]'))assert.equal(card.querySelector('.approvedScene').hasAttribute('src'),false);
});
test('quality-provider timeouts also stop after two requests without regenerating good drafts',async()=>{
 const f=fixture();let checks=0;const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:async()=>{checks++;throw Error('Quality provider timeout');},now:()=>now,limit:()=>40});
 await assert.rejects(service.run(),/timeout/);await assert.rejects(service.run(),/timeout/);assert.equal((await service.run()).idle,true);assert.equal(checks,2);assert.equal(f.generated.length,3);assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'needs_review');
});
test('provider image normalization accepts real PNG/JPEG and rejects malformed or oversized images',async()=>{
 const source=fs.readFileSync(new URL('../../public/assets/progress/yd72omh-ready.webp',import.meta.url)),originalMeta=await sharp(source).metadata();
 for(const format of ['png','jpeg','webp']){
  const input=await sharp(source).toFormat(format).toBuffer();
  const output=await providerImageBytes(input.toString('base64'));
  const meta=await sharp(output).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,originalMeta.width);assert.equal(meta.height,originalMeta.height);
 }
 await assert.rejects(providerImageBytes(Buffer.alloc(1100).toString('base64')));
 const huge=await sharp({create:{width:2100,height:2100,channels:3,background:'#888'}}).png().toBuffer();
 await assert.rejects(providerImageBytes(huge.toString('base64')));
});
test('provider adapter sends real reference images and stores WebP bytes; inspector receives all scene references',async()=>{
 const {generate,validate}=await import('../../lib/progress-scene-worker.js');
 const names=['VECTA_PROGRESS_SCENES_GATEWAY_KEY','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VERCEL_ENV','VERCEL_PROJECT_NAME','VERCEL_PROJECT_PRODUCTION_URL'],old=Object.fromEntries(names.map(k=>[k,process.env[k]])),original=global.fetch;
 Object.assign(process.env,{VECTA_PROGRESS_SCENES_GATEWAY_KEY:'test-only-key',VITE_SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'test-service-key',VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example'});
 const bytes=fs.readFileSync(new URL('../../public/assets/progress/yd72omh-ready.webp',import.meta.url)),requests=[];
 global.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/workshop_settings'))return Response.json([{value:{svg:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="red"/></svg>'}}]);
  requests.push({url:String(url),body:JSON.parse(options.body)});
  return String(url).endsWith('/images/edits')?Response.json({data:[{b64_json:bytes.toString('base64')}]}):Response.json({choices:[{message:{content:JSON.stringify(Object.fromEntries(qualityChecks.map(k=>[k,true])))}}]});
 };
 try{
  const identity={registration:reg,make:'MAZDA',model:'6',colour:'RED',image_url:'https://www.haynespro-assets.com/workshop/images/123.svg'};
  assert.equal((await generate(identity,'waiting',bytes)).length,bytes.length);assert.equal(requests[0].url,'https://ai-gateway.vercel.sh/v1/images/edits');assert.equal(requests[0].body.output_format,'webp');assert.equal(requests[0].body.quality,'high');assert.equal(requests[0].body.images.length,3);assert.match(requests[0].body.images[1].image_url,/^data:image\/png;base64,/);assert.equal(requests[0].body.images[2].image_url,'data:image/webp;base64,'+bytes.toString('base64'));assert.match(requests[0].body.prompt,/Reference 3.*EXACT alloy rims/);
  assert.equal(qualityPassed(await validate(identity,[bytes,bytes,bytes])),true);assert.equal(requests[1].body.messages[1].content.filter(c=>c.type==='image_url').length,6);assert.match(requests[1].body.messages[0].content,/ONLY the large foreground customer car/);assert.match(requests[1].body.messages[0].content,/spacing is immaterial/);assert.match(requests[1].body.messages[0].content,/same_alloy_wheels.*spoke count/);await assert.rejects(generate(identity,'underway'),/clean vehicle reference/);await generate(identity,'ready');assert.equal(requests[2].body.images.length,2);
 }finally{global.fetch=original;for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('manager retry is leased and cannot reset a vehicle while another worker owns preparation',async()=>{
 const f=fixture();await f.service.run();f.rows.set('progress_scene_worker_lock_v1',{id:'progress_scene_worker_lock_v1',value:{owner:'other',until:now+600000},updated_at:new Date(now).toISOString()});await assert.rejects(f.service.retry(reg),/busy/);assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'ready');
});
test('a completed booking today can still receive its finished scenes, including archived completion',async()=>{
 const f=fixture();f.jobs[0].status='completed';f.jobs[0].archived=true;assert.equal((await f.service.run()).status,'ready');assert.equal(f.generated.length,3);
});
test('once automatic preparation is enabled, a missing complete set never falls back to rejected component overlays',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 const data={registration:reg,stage:'underway',title:'Working',scene_state:'unavailable',image_url:'https://www.haynespro-assets.com/workshop/images/123.svg'};let mounts=0;
 const context={document,window:{addEventListener(){},VectaVehicleImage:{mount(){mounts++;}}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
 assert.equal(mounts,0);assert.equal(document.getElementById('progressScene').hidden,false);assert.match(document.getElementById('sceneCaption').textContent,/status is up to date/);
 for(const card of document.querySelectorAll('[data-scene]')){assert.equal(card.querySelector('.vehicleLayer').hidden,true);assert.equal(card.querySelector('.approvedScene').hidden,true);assert.equal(card.querySelector('.sceneBackground').hidden,true);assert.equal(card.querySelector('.sceneArt').hidden,true);}
});
test('real Illustrator-style supplier drawings retain the car while scripts, external DTDs and fallback objects are removed',async()=>{
 const {sceneModelSvg}=await import('../../lib/progress-scene-svg.js');const {Resvg}=await import('@resvg/resvg-js');
 const source='<?xml version="1.0"?><!DOCTYPE svg PUBLIC "supplier" "https://example.invalid/file.dtd" [<!ENTITY ns_ai "https://ns.adobe.com/">]><svg xmlns="http://www.w3.org/2000/svg" xmlns:i="&ns_ai;" width="299px" height="220px" viewBox="0 0 299 220" onload="RunScript(evt)"><script><![CDATA[top.applyScript()]]></script><switch><foreignObject><div>Unsafe fallback</div></foreignObject><g id="wheels" style="opacity:0.6;filter:url(#shadow)"><path d="M10 10 L100 10 L100 100 Z" fill="#123456" onclick="bad()"/><image href="file:///private/secret"/></g></switch><rect width="20" height="20" fill="url(https://example.invalid/remote)"/></svg>';
 const svg=sceneModelSvg(source);assert.doesNotMatch(svg,/DOCTYPE|ENTITY|script|foreignObject|onload|onclick|file:|example\.invalid|<image/);assert.match(svg,/id="wheels"/);assert.match(svg,/#123456/);assert.match(svg,/url\(#shadow\)/);
 const renderer=new Resvg(svg,{fitTo:{mode:'width',value:640}});const rendered=renderer.render();assert.equal(rendered.width,640);assert.ok(rendered.asPng().length>100);
});
test('old rejected drafts get one foreground-only recheck without regenerating images',async()=>{
 const f=fixture({quality:false});await f.service.run();await f.service.run();
 const saved=f.rows.get('progress_scenes_v1:'+reg);delete saved.value.review_version;saved.value.drafts={};f.rows.get(sceneRequestId(reg)).value.status='pending';
 let checks=0;
 const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:async()=>{checks++;return Object.fromEntries(qualityChecks.map(k=>[k,true]));},now:()=>now,limit:()=>40});
 assert.equal((await service.run()).status,'ready');assert.equal(f.generated.length,6);assert.equal(checks,1);
 const manifest=f.rows.get('progress_scenes_v1:'+reg).value;assert.ok(publishedScenes(manifest.identity,manifest,base));assert.deepEqual(manifest.failed_checks,[]);
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,9);
 assert.equal((await service.run()).idle,true);assert.equal(checks,1);
});
test('a failed recovery remains private and is never repeatedly billed',async()=>{
 const f=fixture({quality:false});await f.service.run();await f.service.run();delete f.rows.get('progress_scenes_v1:'+reg).value.review_version;f.rows.get(sceneRequestId(reg)).value.status='pending';
 assert.equal((await f.service.run()).status,'needs_review');assert.equal((await f.service.run()).idle,true);
 assert.equal(f.generated.length,6);assert.equal(f.stats().checks,3);assert.equal(f.stats().publishes,0);
});
test('recovery honours identity changes and the existing monthly budget',async()=>{
 for(const scenario of ['identity','budget']){
  const f=fixture({quality:false});await f.service.run();await f.service.run();delete f.rows.get('progress_scenes_v1:'+reg).value.review_version;f.rows.get(sceneRequestId(reg)).value.status='pending';
  const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:async()=>{f.art.colour='BLUE';return Object.fromEntries(qualityChecks.map(k=>[k,true]));},now:()=>now,limit:()=>scenario==='budget'?8:40});
  if(scenario==='budget')await assert.rejects(service.run(),/limit reached/);else assert.equal((await service.run()).status,'identity_changed');
  assert.equal(f.stats().publishes,0);assert.equal(f.generated.length,6);
 }
});

test('only a verified view queues work; repeated and simultaneous views never reset saved images',async()=>{
 const f=fixture({viewed:false}),identity=sceneIdentity(reg,[...f.rows.values()]),source={kind:'job',id:f.jobs[0].id};
 assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,0);
 const view=()=>requestScenePreparation({db:f.db,identity,source,now});
 await Promise.all([view(),view()]);assert.equal([...f.rows.keys()].filter(id=>id.startsWith('progress_scene_request_v1:')).length,1);
 assert.equal((await f.service.run()).status,'ready');
 const saved=structuredClone(f.rows.get('progress_scenes_v1:'+reg));
 for(let i=0;i<5;i++){await view();assert.deepEqual(await f.service.run(),{idle:true});}
 assert.deepEqual(f.rows.get('progress_scenes_v1:'+reg),saved);assert.equal(f.generated.length,3);assert.equal(f.stats().checks,1);
});
test('supplier artwork URL changes keep the complete saved set; model or colour corrections require a new view',async()=>{
 const f=fixture();await f.service.run();const manifest=f.rows.get('progress_scenes_v1:'+reg).value;
 f.art.imageUrl='https://www.haynespro-assets.com/workshop/images/456.svg';
 let identity=sceneIdentity(reg,[...f.rows.values()]);assert.deepEqual(publishedScenes(identity,manifest,base),manifest.scenes);
 assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,3);
 f.art.colour='BLUE';identity=sceneIdentity(reg,[...f.rows.values()]);assert.equal(publishedScenes(identity,manifest,base),null);
 assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,3);
 await requestScenePreparation({db:f.db,identity,source:{kind:'job',id:f.jobs[0].id},now});
 assert.equal((await f.service.run()).status,'ready');assert.equal(f.generated.length,6);
});
test('viewing a failed set does not reset its attempts or keep paying for regeneration',async()=>{
 const f=fixture({quality:false});await f.service.run();await f.service.run();
 const identity=sceneIdentity(reg,[...f.rows.values()]),before=structuredClone(f.rows.get('progress_scenes_v1:'+reg));
 for(let i=0;i<5;i++){assert.equal(await requestScenePreparation({db:f.db,identity,source:{kind:'job',id:f.jobs[0].id},now}),'unavailable');assert.deepEqual(await f.service.run(),{idle:true});}
 assert.deepEqual(f.rows.get('progress_scenes_v1:'+reg),before);assert.equal(f.generated.length,6);
});
test('a targeted first-view run cannot generate images for an unviewed car or another queued car',async()=>{
 const f=fixture();assert.deepEqual(await f.service.run({registration:'XX99XXX'}),{idle:true});assert.equal(f.generated.length,0);
 assert.equal((await f.service.run({registration:reg})).status,'ready');assert.equal(f.generated.length,3);
});
test('a changed identity with an old pending view never automatically regenerates',async()=>{
 const f=fixture();f.art.colour='BLUE';assert.deepEqual(await f.service.run(),{idle:true});assert.equal(f.generated.length,0);
 assert.equal(f.rows.get(sceneRequestId(reg)).value.status,'identity_changed');
});
test('first-view preparation keeps status visible, polls for saved images and never shows old overlays',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 const requests=[],timers=[];
 const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:(fn,delay)=>{timers.push({fn,delay});return 1;},clearTimeout(){},fetch:async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({registration:reg,stage:'underway',title:'In the workshop',scene_state:'preparing'})};}};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
 assert.equal(requests[0].request_scenes,true);assert.equal(document.getElementById('statusTitle').textContent,'In the workshop');
 assert.equal(document.getElementById('sceneCaption').textContent,'Connecting to our live booking system. This may take several minutes.');assert.equal(document.getElementById('sceneCaption').classList.contains('connecting'),true);assert.equal(timers.at(-1).delay,15000);
 for(const card of document.querySelectorAll('[data-scene]'))assert.equal(card.querySelector('.sceneArt').hidden,true);
});


test('connection banner appears immediately on first open and clears when saved images arrive',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 let respond;const pending=new Promise(resolve=>{respond=resolve;});
 const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:()=>pending};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);
 const caption=document.getElementById('sceneCaption');assert.equal(caption.hidden,false);assert.equal(caption.classList.contains('connecting'),true);
 assert.equal(caption.nextElementSibling.id,'progressScene');assert.match(caption.textContent,/Connecting to our live booking system/);assert.match(caption.textContent,/may take several minutes/);
 const scenes=Object.fromEntries(sceneStages.map(stage=>[stage,base+'/storage/v1/object/public/progress-scenes/'+'a'.repeat(64)+'/'+stage+'.webp']));
 respond({ok:true,json:async()=>({registration:reg,stage:'underway',title:'In the workshop',scenes})});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(caption.hidden,true);assert.equal(caption.classList.contains('connecting'),false);
 for(const card of document.querySelectorAll('[data-scene]'))assert.equal(card.querySelector('.approvedScene').getAttribute('src'),scenes[card.dataset.scene]);
});
