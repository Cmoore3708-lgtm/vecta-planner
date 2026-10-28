import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/js/vecta-tyre-booking.js','utf8');
function setup(){
 let now=Date.now(),id=0,calls=0,fail=false;const timers=new Map();
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const root={Date:ClockDate,AbortController,setTimeout(fn,delay){const key=++id;timers.set(key,{fn,delay});return key;},clearTimeout(key){timers.delete(key);}};root.window=root;
 vm.runInNewContext(source,root);
 const controller=root.VectaTyreBooking.createController({delay:0,fetchGuide:async(size,quantity)=>{calls++;if(fail)throw Error('Supplier unavailable');return{status:'MATCHED',guideOnly:true,size,quantity,checkedAt:new Date(now).toISOString(),options:['budget','midrange','premium'].map(category=>({category,available:true,brand:'TEST',model:'MODEL',unitPence:6500+calls*100,totalPence:(6500+calls*100)*quantity}))};}});
 async function run(match){const entry=[...timers].find(([,timer])=>match(timer.delay));assert.ok(entry,'expected timer');timers.delete(entry[0]);entry[1].fn();await new Promise(setImmediate);}
 return{controller,run,advance:ms=>now+=ms,fail:()=>fail=true,calls:()=>calls};
}
test('expiring prices automatically refresh while retaining the previous catalogue on screen',async()=>{
 const t=setup();t.controller.update('205/55R16',1);await t.run(delay=>delay===0);
 const first=t.controller.getState().result;assert.equal(t.calls(),1);
 t.advance(300050);await t.run(delay=>delay>=300000);
 assert.equal(t.controller.getState().status,'waiting');assert.equal(t.controller.getState().result,first);
 await t.run(delay=>delay===0);assert.equal(t.calls(),2);assert.equal(t.controller.getState().status,'matched');assert.notEqual(t.controller.getState().result.checkedAt,first.checkedAt);
 t.controller.dispose();
});
test('a failed automatic refresh retains labelled last-checked prices instead of clearing the catalogue',async()=>{
 const t=setup();t.controller.update('205/55R16',1);await t.run(delay=>delay===0);const first=t.controller.getState().result;t.fail();
 t.advance(300050);await t.run(delay=>delay>=300000);await t.run(delay=>delay===0);
 assert.equal(t.controller.getState().status,'stale');assert.equal(t.controller.getState().result,first);assert.equal(t.calls(),2);
 t.controller.dispose();
});
test('quantity rechecks preserve brand rows while a fresh stock quote is pending',async()=>{
 const t=setup();t.controller.update('205/55R16',1);await t.run(delay=>delay===0);const first=t.controller.getState().result;
 t.controller.update('205/55R16',2);assert.equal(t.controller.getState().status,'waiting');assert.equal(t.controller.getState().result,first);
 await t.run(delay=>delay===0);assert.equal(t.controller.getState().result.quantity,2);t.controller.dispose();
});
