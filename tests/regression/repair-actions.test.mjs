import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {repairRequest,repairScope,cleanRepairEvidence,cleanRepairChoices,calculateRepairQuote} from '../../lib/repair-quote.js';
import {lookupGeneralRepair} from '../../workers/repair-quotes/general-repair.mjs';
import {scopeForFitment,catalogueCategoryOptions} from '../../workers/repair-quotes/general-gsf.mjs';
import {createRepairBridge} from '../../workers/repair-quotes/shared-bridge.mjs';
import {requireChoice} from '../../workers/repair-quotes/choice-result.mjs';
import {repairQuoteHandler} from '../../api/repair-quote.js';
import {repairWorkerHandler} from '../../api/repair-quote-worker.js';
const now=Date.now(),stamp=new Date(now).toISOString(),partId='a'.repeat(32),labourId='b'.repeat(32),variant='Fixture vehicle';
const make=work=>repairRequest({registration:'AB12CDE',work,flow:'guided-v1'});
function selected(work){const r=make(work);return repairRequest({...r,choices:{...(r.lookup!=='labour'?{part:partId}:{}),...(r.lookup!=='parts'?{labour:labourId}:{})}});}
const part=r=>({vehicle:variant,fitmentEvidence:'Verified GSF registration and fitment',catalogueComplete:true,part:{source:'GSF',registration:r.registration,variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:'PART1',brand:'Fixture',description:'Radiator',costPence:5000,inStock:false,checkedAt:stamp,choiceId:partId}});
const labour=r=>({variant,labour:{source:'HAYNES_PRO',registration:r.registration,variant,operation:r.operation,operationId:'1FX00000001',operationLabel:'Renew the radiator',hoursMilli:1900,unit:'hours',scopeConfirmed:true,checkedAt:stamp,choiceId:labourId}});
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});

test('supply and fit are whole-word actions anywhere in varied requests, across hundreds of descriptions',()=>{
 const parts=['radiator','fuel pressure regulator','window regulator','ABS sensor','door lock actuator','clutch slave cylinder','air conditioning compressor','thermostat housing','starter motor','coolant pump','suspension arm','wheel bearing','wiper motor','ignition coil','turbocharger','exhaust silencer'];
 for(const noun of parts)for(const position of ['', 'front ', 'rear ', 'left ', 'right ', 'front left ', 'front right ', 'rear left ', 'rear right ', 'upper ', 'lower ', 'inner ', 'outer ', 'centre ', 'auxiliary ']){
  const item=position+noun;
  for(const [work,mode] of [['Please supply a '+item,'parts'],['Could you fit a new '+item+' please','labour'],[item+' — supply and fit','both'],['Supply '+item+' and fit it','both']]){
   const s=repairScope.resolve(work);assert.equal(s.status,'SUPPORTED',work);assert.equal(s.lookup||'both',mode,work);assert.ok(!/\b(?:please|supply|fit)\b/.test(s.query),work);
  }
 }
 assert.equal(repairScope.resolve('Supply only radiator').query,'radiator');
 assert.equal(repairScope.actions('supply hose fitting kit'),'parts');
 assert.equal(repairScope.actions('benefit and supply'),'parts');
 for(const work of ['Supply radiator, fit brake pads','Supply radiator but do not fit it','Fit radiator if required'])assert.notEqual(repairScope.resolve(work).status,'SUPPORTED');
});

test('only requested sources are called and included in the final totals',async()=>{
 for(const [work,partsCalls,labourCalls,gross] of [['Please supply radiator',1,0,9000],['Radiator to fit',0,1,12000],['Radiator supply and fit',1,1,21000]]){
  const r=selected(work),calls=[];
  const evidence=await lookupGeneralRepair({},r,{now:()=>now,gsf:async()=>{calls.push('GSF');return part(r);},haynes:async()=>{calls.push('Haynes');return labour(r);}});
  assert.equal(calls.filter(x=>x==='GSF').length,partsCalls);assert.equal(calls.filter(x=>x==='Haynes').length,labourCalls);
  const q=calculateRepairQuote(cleanRepairEvidence(evidence,r,{now}),r,{now});assert.equal(q.totalIncVatPence,gross);
  assert.equal(q.parts,undefined);
  if(!partsCalls){assert.equal(q.part,null);assert.equal(q.partsPence,0);assert.deepEqual(evidence.parts,[]);}
  if(!labourCalls){assert.equal(q.labour,null);assert.equal(q.labourPence,0);assert.equal(q.chargedHoursMilli,0);}
  for(const mutate of [v=>v.request.lookup=r.lookup==='parts'?'labour':'parts',v=>v.checkedAt='2020-01-01']){const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>cleanRepairEvidence(bad,r,{now}));}
 }
});

test('choice validation allows labour without a GSF part only for fit-only requests',()=>{
 const r=make('Fit radiator'),result={request:r,stage:'HAYNES_LABOUR',options:[{id:labourId,label:'Renew the radiator',hoursMilli:1900}],checkedAt:stamp};
 assert.equal(cleanRepairChoices(result,r,{now}).options[0].hoursMilli,1900);
 assert.equal(repairRequest({...r,choices:{labour:labourId}}).choices.labour,labourId);
 assert.throws(()=>repairRequest({...r,choices:{part:partId}}));
 const p=make('Supply radiator');assert.throws(()=>repairRequest({...p,choices:{part:partId,labour:labourId}}));
 assert.throws(()=>cleanRepairChoices({...result,request:p},p,{now}));
 assert.throws(()=>repairRequest({...make('Supply and fit radiator'),choices:{labour:labourId}}));
 assert.throws(()=>repairRequest({...r,lookup:'parts'}));
 const scope=repairScope.resolve('Supply front left wishbone');
 assert.equal(scopeForFitment([{attribute:'Fitting Position',value:'Front Axle Left'}],scope).lookup,'parts');
 assert.match(catalogueCategoryOptions([{href:'/parts/914',text:'Control arm'}],'wishbone',scope)[0].work,/^Supply (?!and fit)/);
});

test('fit-only and supply-only worker tasks never open the unused supplier browser',async()=>{
 for(const work of ['Fit radiator','Supply radiator']){
  const r=make(work),calls=[],stage=r.lookup==='labour'?'HAYNES_LABOUR':'GSF_PART';let completed;
  const page=()=>({close:async()=>{}});
  const bridge=createRepairBridge({origin:'https://fixture.vercel.app',token:'a'.repeat(64),configPath:'/tmp/no-repair-action-config',
   gsfContext:{newPage:async()=>{calls.push('GSF');return page();}},openHaynesContext:async()=>{calls.push('Haynes');return {newPage:async()=>page(),close:async()=>{}};},
   lookup:async()=>requireChoice(r,stage,[],{now:()=>now}),rpc:async b=>{if(b.action==='pull'){assert.equal(b.repairProtocol,4);return {status:'JOB',id:'job',lease:'lease',request:r};}completed=b;return {status:'SAVED'};}});
  assert.equal(await bridge.tick(),'CHOICE_REQUIRED');assert.deepEqual(calls,[r.lookup==='labour'?'Haynes':'GSF']);assert.equal(completed.result.stage,stage);await bridge.close();
 }
});

test('both API boundaries preserve single-source evidence without adding the omitted charge',async()=>{
 for(const work of ['Supply radiator','Fit radiator']){
  const r=selected(work),evidence=await lookupGeneralRepair({},r,{now:()=>now,gsf:async()=>part(r),haynes:async()=>labour(r)}),token='a'.repeat(64);let saved;
  const worker=repairWorkerHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_QUOTE_WORKER_TOKEN:token},now:()=>now,queue:async(_a,p)=>{saved=p;return {status:'SAVED'};}}),res=response();
  await worker({method:'POST',headers:{authorization:'Bearer '+token},body:{action:'complete',id:'11111111-1111-1111-1111-111111111111',lease:'22222222-2222-2222-2222-222222222222',request:r,status:'MATCHED',result:evidence}},res);assert.equal(res.body.status,'SAVED');
  const manager=repairQuoteHandler({env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_GENERAL_PRICING_ENABLED:'true'},authenticate:async()=>true,now:()=>now,queue:async()=>({status:'MATCHED',result:saved.result})}),out=response();
  await manager({method:'POST',body:r},out);assert.equal(out.body.status,'MATCHED');assert.equal(out.body.quote[r.lookup==='parts'?'labourPence':'partsPence'],0);
 }
});

test('protocol 4 queues single-source requests while older workers cannot claim them',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table public.gsf_service_jobs(status text,lease uuid,deadline timestamptz);');
  for(const p of ['docs/sql/repair-quote-queue.sql','supabase/migrations/20261111064559_catalogue_repair_pricing.sql','supabase/migrations/20261111073607_guided_repair_choices.sql','supabase/migrations/20261112101239_repair_action_lookups.sql'])await db.exec(fs.readFileSync(p,'utf8'));
  const rpc=async(a,p)=>(await db.query('select public.vecta_repair_quote_queue($1,$2::jsonb) as value',[a,JSON.stringify(p)])).rows[0].value;
  for(const work of ['Supply radiator','Fit radiator']){
   const r=selected(work),job={actor:'a'.repeat(64),request:r};await rpc('pull',{repairProtocol:3});assert.equal((await rpc('enqueue',job)).status,'SETTINGS_REQUIRED');
   await rpc('pull',{repairProtocol:4});assert.equal((await rpc('enqueue',job)).status,'PENDING');
   for(const version of [1,2,3])assert.equal((await rpc('pull',{repairProtocol:version})).status,'IDLE');
   const task=await rpc('pull',{repairProtocol:4});assert.equal(task.status,'JOB');assert.equal(task.request.lookup,r.lookup);
   const result=await lookupGeneralRepair({},r,{now:()=>now,gsf:async()=>part(r),haynes:async()=>labour(r)});
   assert.equal((await rpc('complete',{...task,request:r,status:'MATCHED',result})).status,'SAVED');assert.equal((await rpc('enqueue',job)).status,'MATCHED');
  }
  assert.equal((await db.query("select has_function_privilege('anon','public.vecta_repair_quote_queue(text,jsonb)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
