import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneralRepairSession} from '../../workers/repair-quotes/general-repair.mjs';
import {lookupRepair} from '../../workers/repair-quotes/catalogue.mjs';
import {repairRequest,calculateRepairQuote} from '../../lib/repair-quote.js';
import {requireChoice} from '../../workers/repair-quotes/choice-result.mjs';
const partId='a'.repeat(32),labourId='b'.repeat(32);
const initial=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1',choices:{part:partId}});
const change=(choices,extra={})=>repairRequest({...initial,...extra,choices:{...initial.choices,...choices}});
function setup(){
 let clock=Date.parse('2026-11-11T18:00:00Z'),gsfReads=0,haynesReads=0,changed=false,mutate=false;
 const stamp=()=>new Date(clock).toISOString();
 const session=createGeneralRepairSession({now:()=>clock,gsf:async(_,r)=>{
  gsfReads++;if(changed)requireChoice(r,'GSF_PART',[{id:'c'.repeat(32),label:'Updated supplier price',costPence:6000}],{now:()=>clock});
  return {catalogueComplete:true,fitmentEvidence:'Verified fixture vehicle and component',part:{source:'GSF',registration:r.registration,choiceId:r.choices.part,fitmentConfirmed:true,vatBasis:'EX_VAT',description:'Radiator',brand:'Fixture',sku:'R1',costPence:5000,inStock:false,checkedAt:stamp()}};
 },haynes:async(_,r,{selectedPart})=>{
  haynesReads++;assert.equal(selectedPart.costPence,5000);assert.equal(selectedPart.inStock,false);
  if(mutate)selectedPart.costPence=1;
  if(!r.choices.labour)requireChoice(r,'HAYNES_LABOUR',[{id:labourId,label:'Renew radiator',hoursMilli:1900}],{selectedPart,now:()=>clock});
  return {variant:'Fixture vehicle',labour:{source:'HAYNES_PRO',registration:r.registration,variant:'Fixture vehicle',operation:r.operation,operationId:'1FX00000001',operationLabel:'Renew radiator',hoursMilli:1900,unit:'hours',scopeConfirmed:true,checkedAt:stamp(),choiceId:r.choices.labour}};
 }});
 return {session,counts:()=>({gsfReads,haynesReads}),advance:ms=>{clock+=ms;},now:()=>clock,changePrice:()=>{changed=true;},mutate:()=>{mutate=true;}};
}
const choose=(f,r=initial)=>assert.rejects(f.session({},r),e=>e.code==='CHOICE_REQUIRED');

test('labour groups/refinements retain verified part, while final selection rechecks GSF and calculates normally',async()=>{
 const f=setup();await choose(f);await choose(f,change({menus:['Cooling system']}));await choose(f,change({labourSearch:'engine radiator'}));
 assert.deepEqual(f.counts(),{gsfReads:1,haynesReads:3});
 const request=change({labour:labourId}),evidence=await f.session({},request),price=calculateRepairQuote(evidence,request,{now:f.now()});
 assert.deepEqual(f.counts(),{gsfReads:2,haynesReads:4});assert.equal(price.chargedHoursMilli,2000);assert.equal(price.part.inStock,false);
});

test('a changed price on final recheck returns GSF choices before labour and cannot produce a cached quote',async()=>{
 const f=setup();await choose(f);f.changePrice();
 await assert.rejects(f.session({},change({labour:labourId})),e=>e.code==='CHOICE_REQUIRED'&&e.supplier==='GSF'&&e.result.stage==='GSF_PART');
 assert.deepEqual(f.counts(),{gsfReads:2,haynesReads:1});
 await assert.rejects(f.session({},initial),e=>e.supplier==='GSF');assert.equal(f.counts().gsfReads,3);
});

test('part cache expires, never crosses request identity, and clears with its worker session',async()=>{
 const f=setup();await choose(f);f.advance(5*60*1000);await choose(f);assert.equal(f.counts().gsfReads,2);
 await choose(f,change({}, {registration:'XY34ABC'}));await choose(f,change({part:'d'.repeat(32)}));await choose(f,change({gsfCategory:'e'.repeat(32)}));
 assert.equal(f.counts().gsfReads,5);f.session.clear();await choose(f);assert.equal(f.counts().gsfReads,6);
});

test('clock reversal invalidates cached selections and returned objects cannot mutate the saved part',async()=>{
 const f=setup();f.mutate();await choose(f);await choose(f);assert.equal(f.counts().gsfReads,1);
 f.advance(-1000);await choose(f);assert.equal(f.counts().gsfReads,2);
});

test('cache capacity is bounded and eviction forces a fresh supplier read',async()=>{
 const f=setup();await choose(f);
 for(let i=0;i<8;i++)await choose(f,change({}, {registration:'CAR'+i}));
 await choose(f);assert.equal(f.counts().gsfReads,10);
});

test('general catalogue dispatch accepts one worker-owned session, preserving legacy routing defaults',async()=>{
 let calls=0;await lookupRepair({},initial,{}, {general:async(_,r)=>{calls++;assert.deepEqual(r,initial);return {test:true};}});assert.equal(calls,1);
});
