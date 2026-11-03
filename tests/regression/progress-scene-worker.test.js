import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createSceneService,imageBytes,cronAuthorised,requestLimit,default as handler} from '../../lib/progress-scene-worker.js';
import {sceneIdentity,sceneFingerprint,sceneStages,scenePrompt,qualityChecks,qualityPassed,publishedScenes,sceneUrl} from '../../lib/progress-scene-model.js';
const reg='AB12CDE',base='https://jywufozycuwuoshlulwl.supabase.co',now=Date.parse('2026-11-03T12:00:00Z');
function fixture({cap=40,quality=true,generateFailure=false}={}){
 const rows=new Map(),calls=[],generated=[];let clock=now,checks=0,publishes=0;
 const art={registration:reg,make:'MAZDA',model:'6',colour:'RED',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'};
 rows.set('vehicle_artwork:'+reg,{id:'vehicle_artwork:'+reg,value:art,updated_at:new Date(now).toISOString()});
 const jobs=[{id:'12345678-1234-4234-8234-123456789012',registration:reg,booking_date:'2026-11-03',status:'booked',archived:false}];
 const db=async(path,options={})=>{
  calls.push({path,options});const url=new URL('https://db.example/'+path),method=options.method||'GET';
  if(url.pathname==='/jobs')return jobs;
  const filter=url.searchParams.get('id');
  if(method==='GET'){
   if(filter.startsWith('in.('))return filter.slice(4,-1).split(',').map(id=>rows.get(id)).filter(Boolean);
   return rows.has(filter.slice(3))?[structuredClone(rows.get(filter.slice(3)))]:[];
  }
  const body=JSON.parse(options.body),id=body.id||filter.slice(3),old=rows.get(id);
  if(method==='POST'&&String(options.headers?.Prefer).includes('ignore-duplicates')&&old)return [];
  if(method==='PATCH'){
   if(!old)return [];
   if(url.searchParams.get('updated_at')&&url.searchParams.get('updated_at')!=='eq.'+old.updated_at)return [];
   if(url.searchParams.get('value->>owner')&&url.searchParams.get('value->>owner')!=='eq.'+old.value.owner)return [];
  }
  const saved={...old,...body,id,updated_at:new Date(++clock).toISOString()};rows.set(id,structuredClone(saved));return [structuredClone(saved)];
 };
 const storage={base,async prepare(){},async draft(){},async read(){return Buffer.from('test-image');},async publish(key){publishes++;return Object.fromEntries(sceneStages.map(s=>[s,base+'/storage/v1/object/public/progress-scenes/'+key+'/'+s+'.webp']));}};
 const generate=async(identity,stage)=>{generated.push({identity,stage});if(generateFailure&&stage==='underway')throw Error('provider timeout');return Buffer.from('image');};
 const validate=async()=>{checks++;return Object.fromEntries(qualityChecks.map(k=>[k,quality]));};
 return {rows,calls,jobs,generated,art,storage,db,generate,validate,service:createSceneService({db,storage,generate,validate,now:()=>clock,limit:()=>cap}),stats:()=>({checks,publishes})};
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
 assert.equal((await f.service.run()).idle,true);assert.equal(f.generated.length,3);
 const manifest=f.rows.get('progress_scenes_v1:'+reg).value;assert.equal(manifest.status,'ready');assert.ok(publishedScenes(manifest.identity,manifest,base));
 assert.equal(publishedScenes({...manifest.identity,colour:'BLUE'},manifest,base),null);
 assert.equal(publishedScenes(manifest.identity,{...manifest,registration:'OTHER'},base),null);
 assert.equal(publishedScenes(manifest.identity,{...manifest,scenes:{...manifest.scenes,ready:'https://evil.example/image.webp'}},base),null);
 assert.equal(f.rows.get('progress_scene_usage_v1:2026-11').value.requests,4);
});
test('failed visual checks never publish, retries stop after two attempts per image',async()=>{
 const f=fixture({quality:false});assert.equal((await f.service.run()).status,'pending');assert.equal((await f.service.run()).status,'needs_review');assert.equal((await f.service.run()).idle,true);
 assert.equal(f.generated.length,6);assert.equal(f.stats().publishes,0);assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.scenes,undefined);
});
test('provider failure saves successful drafts and only retries the missing image',async()=>{
 const f=fixture({generateFailure:true});await f.service.run();assert.equal(f.stats().checks,0);await f.service.run();assert.equal(f.generated.length,4);assert.equal(f.generated.filter(x=>x.stage==='waiting').length,1);assert.equal(f.stats().publishes,0);await f.service.run();assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'needs_review');
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
 data={...data,scenes:{...scenes,ready:'https://evil.example/car.webp'}};await document.getElementById('refresh').onclick();for(const card of document.querySelectorAll('[data-scene]'))assert.equal(card.querySelector('.approvedScene').hasAttribute('src'),false);
});
test('quality-provider timeouts also stop after two requests without regenerating good drafts',async()=>{
 const f=fixture();let checks=0;const service=createSceneService({db:f.db,storage:f.storage,generate:f.generate,validate:async()=>{checks++;throw Error('Quality provider timeout');},now:()=>now,limit:()=>40});
 await assert.rejects(service.run(),/timeout/);await assert.rejects(service.run(),/timeout/);assert.equal((await service.run()).idle,true);assert.equal(checks,2);assert.equal(f.generated.length,3);assert.equal(f.rows.get('progress_scenes_v1:'+reg).value.status,'needs_review');
});
test('provider adapter sends real reference images and only accepts WebP bytes; inspector receives all scene references',async()=>{
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
  assert.equal((await generate(identity,'waiting')).length,bytes.length);assert.equal(requests[0].url,'https://ai-gateway.vercel.sh/v1/images/edits');assert.equal(requests[0].body.output_format,'webp');assert.equal(requests[0].body.quality,'high');assert.equal(requests[0].body.images.length,2);assert.match(requests[0].body.images[1].image_url,/^data:image\/png;base64,/);
  assert.equal(qualityPassed(await validate(identity,[bytes,bytes,bytes])),true);assert.equal(requests[1].body.messages[1].content.filter(c=>c.type==='image_url').length,6);
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
 for(const card of document.querySelectorAll('[data-scene]')){assert.equal(card.querySelector('.vehicleLayer').hidden,true);assert.equal(card.querySelector('.approvedScene').hidden,true);}
});
test('real Illustrator-style supplier drawings retain the car while scripts, external DTDs and fallback objects are removed',async()=>{
 const {sceneModelSvg}=await import('../../lib/progress-scene-svg.js');const {Resvg}=await import('@resvg/resvg-js');
 const source='<?xml version="1.0"?><!DOCTYPE svg PUBLIC "supplier" "https://example.invalid/file.dtd" [<!ENTITY ns_ai "https://ns.adobe.com/">]><svg xmlns="http://www.w3.org/2000/svg" xmlns:i="&ns_ai;" width="299px" height="220px" viewBox="0 0 299 220" onload="RunScript(evt)"><script><![CDATA[top.applyScript()]]></script><switch><foreignObject><div>Unsafe fallback</div></foreignObject><g id="wheels" style="opacity:0.6;filter:url(#shadow)"><path d="M10 10 L100 10 L100 100 Z" fill="#123456" onclick="bad()"/><image href="file:///private/secret"/></g></switch><rect width="20" height="20" fill="url(https://example.invalid/remote)"/></svg>';
 const svg=sceneModelSvg(source);assert.doesNotMatch(svg,/DOCTYPE|ENTITY|script|foreignObject|onload|onclick|file:|example\.invalid|<image/);assert.match(svg,/id="wheels"/);assert.match(svg,/#123456/);assert.match(svg,/url\(#shadow\)/);
 const renderer=new Resvg(svg,{fitTo:{mode:'width',value:640}});const rendered=renderer.render();assert.equal(rendered.width,640);assert.ok(rendered.asPng().length>100);
});
