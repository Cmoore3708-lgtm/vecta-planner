import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {PGlite} from '@electric-sql/pglite';
import {repairRequest,repairScope,cleanRepairEvidence,calculateRepairQuote} from '../../lib/repair-quote.js';
import {repairQuoteHandler} from '../../api/repair-quote.js';
import {readRepairGroups,repairFitment,matchingCatalogueCategories} from '../../workers/repair-quotes/general-gsf.mjs';
import {operationPattern} from '../../workers/repair-quotes/general-haynes.mjs';
import {readAlternatorTime} from '../../workers/repair-quotes/repair-time-reader.mjs';
import {lookupGeneralRepair} from '../../workers/repair-quotes/general-repair.mjs';
const now=Date.parse('2026-11-11T08:00:00Z'),stamp=new Date(now).toISOString();
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit front brake pads'});
function evidence(r=request){return {request:r,scope:repairScope.resolve(r.work),variant:'Test vehicle 2.0 diesel',fitmentEvidence:'Synthetic registration and front position fixture',catalogueComplete:true,checkedAt:stamp,parts:[{source:'GSF',registration:r.registration,variant:'Test vehicle 2.0 diesel',fitmentConfirmed:true,vatBasis:'EX_VAT',sku:'PAD123',brand:'Fixture',description:repairScope.resolve(r.work).part,costPence:2000,inStock:true,checkedAt:stamp}],labour:{source:'HAYNES_PRO',registration:r.registration,variant:'Test vehicle 2.0 diesel',operation:r.operation,operationId:'1BR1234567',operationLabel:'Renew the front brake pads',hoursMilli:700,unit:'hours',scopeConfirmed:true,checkedAt:stamp}};}
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
test('catalogue grammar accepts hundreds of scoped parts without a part whitelist',()=>{
 const parts=['ABS sensor','fuel pressure regulator','air conditioning compressor','door lock actuator','window regulator','oil cooler','oil pressure switch','camshaft sensor','crankshaft sensor','boost pressure sensor','air mass meter','throttle body','inlet manifold','exhaust manifold','EGR cooler','turbocharger','vacuum pump','fuel pump','injector','radiator fan','heater matrix','expansion tank','coolant temperature sensor','thermostat housing','water pump','auxiliary belt','belt tensioner','idler pulley','alternator pulley','engine mount','gearbox mount','clutch master cylinder','clutch slave cylinder','brake master cylinder','brake servo','brake hose','brake pipe','handbrake cable','handbrake motor','wheel hub','steering rack','track rod end','steering column joint','lower suspension arm','upper suspension arm','subframe bush','anti roll bar bush','drop link','coil spring','shock absorber','strut top mount','CV joint','CV boot','propshaft bearing','differential seal','gearbox seal','oil sump','sump gasket','rocker cover gasket','cylinder head gasket','timing chain kit','timing belt kit','wiper motor','washer pump','headlamp unit','lamp unit','fog lamp','indicator stalk','ignition switch','glow plug relay','starter solenoid','battery terminal','fuse box','parking sensor','reversing camera','boot latch','bonnet latch','door handle','mirror motor','seat belt buckle'];
 let checked=0;
 for(const part of parts)for(const position of ['','front ','rear ']){
  const r=repairRequest({registration:'NEW123',work:'Supply and fit '+position+part});
  assert.equal(r.quantity,1);assert.ok(['catalogue-replacement','alternator-replacement'].includes(r.operation));checked++;
 }
 assert.ok(checked>=200);
 assert.equal(repairScope.resolve('Supply and fit front brake pads').query,'brake pads');
 assert.equal(repairScope.resolve('Supply and fit rear brake discs').quantity,2);
 assert.equal(repairScope.resolve('Replace brake pads').status,'POSITION_REQUIRED');
 assert.equal(repairScope.resolve('Replace front left brake pads').status,'AXLE_SCOPE_REQUIRED');
 for(const work of ['replace pads and discs','diagnose alternator','replace alternator if faulty','replace front pads\nreplace rear pads'])assert.notEqual(repairScope.resolve(work).status,'SUPPORTED');
 assert.equal(repairScope.resolve('Supply and fit timing belt and water pump kit').status,'SUPPORTED');
});
test('parts cost quantity, marginal markup, rounded labour and VAT reconcile',()=>{
 const pads=calculateRepairQuote(evidence(),request,{now});assert.equal(pads.partsPence,3000);assert.equal(pads.chargedHoursMilli,1000);assert.equal(pads.totalIncVatPence,10000);
 const discs=repairRequest({registration:request.registration,work:'Supply and fit front brake discs'}),raw=evidence(discs);
 const price=calculateRepairQuote(raw,discs,{now});assert.equal(price.partsPence,6000);assert.equal(price.totalIncVatPence,13500);
 assert.equal(price.netPence+price.vatPence,price.totalIncVatPence);
 assert.throws(()=>repairRequest({...discs,quantity:1}),/INVALID_REQUEST/);
});
test('wrong part, position, stale prices and unrelated labour fail closed through repeated relay cleaning',()=>{
 const shuffled=evidence();shuffled.scope=Object.fromEntries(Object.entries(shuffled.scope).reverse());assert.doesNotThrow(()=>cleanRepairEvidence(shuffled,request,{now}));
 const cleaned=cleanRepairEvidence(evidence(),request,{now});assert.deepEqual(cleanRepairEvidence(cleaned,request,{now}),cleaned);
 for(const change of [r=>r.parts[0].description='Alternator',r=>r.scope.axle='rear',r=>r.labour.operation='alternator-replacement',r=>r.parts[0].registration='OTHER',r=>r.checkedAt='2020-01-01']){const raw=evidence();change(raw);assert.throws(()=>calculateRepairQuote(raw,request,{now}));}
});
test('API general activation is explicit, legacy registration gate stays in place',async()=>{
 let calls=0;const options={authenticate:async()=>true,now:()=>now,queue:async()=>{calls++;return {status:'MATCHED',result:evidence()};}};
 let res=response();await repairQuoteHandler({...options,env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_QUOTE_ALLOWED_REGISTRATIONS:'FV65JTY'}})({method:'POST',body:request},res);assert.equal(res.body.status,'SETTINGS_REQUIRED');assert.equal(calls,0);
 res=response();await repairQuoteHandler({...options,env:{REPAIR_QUOTING_ENABLED:'true',REPAIR_GENERAL_PRICING_ENABLED:'true',REPAIR_QUOTE_ALLOWED_REGISTRATIONS:'FV65JTY'}})({method:'POST',body:request},res);assert.equal(res.body.status,'MATCHED');assert.equal(res.body.quote.part.sku,'PAD123');assert.equal(calls,1);
});
test('supplier category matching uses observed GSF links, ignores other sites and partial word matches',()=>{
 const links=[{href:'https://trade.gsfcarparts.com/parts/Fuel%2520Pressure%2520Regulator',text:'Fuel Pressure Regulator'},{href:'https://evil.example/parts/Fuel%20Pressure%20Regulator',text:'Fuel Pressure Regulator'},{href:'/parts/Fuel%2520Pump',text:'Fuel Pump'},{href:'/basket',text:'Fuel Pressure Regulator'}];
 assert.deepEqual(matchingCatalogueCategories(links,'fuel pressure regulator'),['Fuel Pressure Regulator']);
 assert.deepEqual(matchingCatalogueCategories(links,'fuel pressure sensor'),[]);
 assert.deepEqual(matchingCatalogueCategories([{href:'/parts/Brake%2520Pad',text:'Brake Pad'}],'brake pads'),['Brake Pad']);
});
test('fitment and pack sizes prevent front/rear swaps and double-priced packs',()=>{
 const scope=repairScope.resolve(request.work);
 assert.equal(repairFitment([{attribute:'Fitting Position',value:'Front Axle'}],scope),true);
 for(const position of ['Rear Axle','Front and Rear Axle',''])assert.equal(repairFitment([{attribute:'Fitting Position',value:position}],scope),false);
 const discs=repairScope.resolve('Replace front brake discs');
 assert.equal(repairFitment([{attribute:'Fitting Position',value:'Front Axle'}],discs),false);
 assert.equal(repairFitment([{attribute:'Fitting Position',value:'Front Axle'},{attribute:'Pack Quantity',value:'2'}],discs),false);
 assert.equal(repairFitment([{attribute:'Fitting Position',value:'Front Axle'},{attribute:'Pack Quantity',value:'1'}],discs),true);
});
test('catalogue extractor keeps SKU, scoped attributes and all brand options in one group',()=>{
 const {document}=parseHTML('<main><section><h5>Brake Pads</h5><p>SKU: PAD123</p><button>Attributes</button><div><div><span>£20.00</span><b>Silver</b><span>Brake Pads</span><span>Local Branch</span></div><div><span>£30.00</span><b>Gold</b><span>Brake Pads</span><span>RDC</span></div></div><a href="/partdetails/DREPAD123">Part details</a></section></main>');
 const capture=readRepairGroups(document);assert.equal(capture.complete,true);assert.equal(capture.groups.length,1);assert.equal(capture.groups[0].options.length,2);assert.deepEqual(capture.groups[0].options.map(x=>x.pricePence),[2000,3000]);
 const more=document.createElement('button');more.textContent='Show More';document.querySelector('main').appendChild(more);assert.equal(readRepairGroups(document).complete,false);
});
test('Haynes exact part and position matching rejects wrong axle and multiple priced operations',()=>{
 const pattern=operationPattern(repairScope.resolve(request.work));
 function doc(rows){return parseHTML('<html><body><p>TOTAL TIME (H)</p><ul>'+rows.map(([label,id,time])=>'<li><span>'+label+'</span> <span>'+id+'</span> <span>'+time+'</span></li>').join('')+'</ul></body></html>').document;}
 const good=['Renew the front brake pads','1BR1234567','0.70'];
 assert.equal(readAlternatorTime({operationPattern:pattern},doc([good])).hoursMilli,700);
 assert.throws(()=>readAlternatorTime({operationPattern:pattern},doc([['Renew the rear brake pads','1BR1234568','0.30']])),/OPERATION_NOT_VISIBLE/);
 assert.throws(()=>readAlternatorTime({operationPattern:pattern},doc([good,['Renew the front brake pads with ceramic brakes','1BR1234568','1.20']])),/MULTIPLE_PRICED_OPERATIONS/);
});
test('general worker binds independently returned supplier evidence before returning a price',async()=>{
 const raw=evidence();
 const options={now:()=>now,gsf:async(_,r)=>{assert.deepEqual(r,request);return {part:raw.parts[0],fitmentEvidence:raw.fitmentEvidence,catalogueComplete:true};},haynes:async(_,r)=>{assert.deepEqual(r,request);return {variant:raw.variant,labour:raw.labour};}};
 const result=await lookupGeneralRepair({},request,options);assert.equal(calculateRepairQuote(result,request,{now}).totalIncVatPence,10000);
 await assert.rejects(lookupGeneralRepair({},request,{...options,haynes:async()=>({...await options.haynes(null,request),labour:{...raw.labour,registration:'WRONG'}})}),/LABOUR_REVIEW_REQUIRED/);
});
test('database protocol prevents old alternator workers taking general requests and retains queue deduplication',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create table public.gsf_service_jobs(status text,lease uuid,deadline timestamptz);');
  await db.exec(fs.readFileSync(new URL('../../docs/sql/repair-quote-queue.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261111064559_catalogue_repair_pricing.sql',import.meta.url),'utf8'));
  const rpc=async(action,payload)=>(await db.query('select public.vecta_repair_quote_queue($1,$2::jsonb) as value',[action,JSON.stringify(payload)])).rows[0].value;
  const job={request,actor:'a'.repeat(64)};
  await rpc('pull',{});assert.equal((await rpc('enqueue',job)).status,'SETTINGS_REQUIRED');
  await rpc('pull',{repairProtocol:2});assert.equal((await rpc('enqueue',job)).status,'PENDING');assert.equal((await rpc('enqueue',job)).status,'PENDING');
  assert.equal((await rpc('pull',{})).status,'IDLE');
  const task=await rpc('pull',{repairProtocol:2});assert.equal(task.status,'JOB');assert.deepEqual(task.request,request);
  assert.equal((await db.query('select count(*) as count from vecta_repair_quote_jobs')).rows[0].count,1);
  const wrong={...task.request,quantity:50};assert.equal((await rpc('enqueue',{...job,request:wrong})).status,'INVALID_REQUEST');
 }finally{await db.close();}
});

test('browser and worker use identical catalogue request grammar',()=>{assert.ok(fs.readFileSync('public/js/vecta-repair-quote.js','utf8').startsWith(fs.readFileSync('lib/repair-scope.js','utf8')));});

test('part accessories cannot be substituted for the requested component',()=>{for(const [part,query] of [['Brake Pad Fitting Kit','brake pads'],['Alternator Pulley','alternator'],['Fuel Pump Seal','fuel pump'],['High Pressure Fuel Pump','fuel pump']])assert.equal(repairScope.matchesDescription(part,query),false);assert.equal(repairScope.matchesDescription('Brake Pad Set','brake pads'),true);});
