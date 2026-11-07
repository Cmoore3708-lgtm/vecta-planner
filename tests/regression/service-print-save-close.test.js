import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('var serviceSheetPrintPending=false;');
const source=html.slice(start,html.indexOf('\nasync function saveServiceSheetAndClose(',start));
function setup(save=async()=>true){
 const events={},calls=[],sheet={},button={disabled:false};let current=sheet;
 const ctx={activeServiceJobId:'job-1',app:{jobs:[{id:'job-1'}]},console:{error(){}},document:{querySelector:s=>s.includes('printPreview')?button:current},window:{addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]},saveServiceSheet:async()=>{calls.push('save');return save();},printWhenImagesReady:async()=>{calls.push('print');},closeServicePreview:()=>{calls.push('close');current=null;},openJobModal:id=>calls.push('job:'+id),alert:()=>calls.push('alert')};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,events,calls,button,replace:()=>{current={};}};
}
test('Print saves first and closes only after the native print dialog ends',async()=>{
 const {ctx,events,calls,button}=setup();
 assert.equal(await ctx.printServiceSheetAndClose(),true);assert.deepEqual(calls,['save','print']);assert.equal(button.disabled,true);
 assert.equal(await ctx.printServiceSheetAndClose(),false,'repeated clicks cannot duplicate saves or printing');
 events.afterprint();assert.deepEqual(calls,['save','print','close','job:job-1']);assert.equal(button.disabled,false);assert.equal(events.afterprint,undefined);
});
test('validation or cloud save failures keep the sheet open without printing',async()=>{
 for(const result of [false,undefined]){const {ctx,calls,button,events}=setup(async()=>result);assert.equal(await ctx.printServiceSheetAndClose(),false);assert.deepEqual(calls,['save']);assert.equal(button.disabled,false);assert.equal(events.afterprint,undefined);}
});
test('print errors release the click lock and keep the saved sheet open for retry',async()=>{
 const {ctx,calls,button,events}=setup();ctx.printWhenImagesReady=async()=>{throw Error('Print unavailable');};
 assert.equal(await ctx.printServiceSheetAndClose(),false);assert.deepEqual(calls,['save','alert']);assert.equal(button.disabled,false);assert.equal(events.afterprint,undefined);assert.equal(ctx.serviceSheetPrintPending,false);
});
test('late printing completion cannot close a different sheet',async()=>{
 const {ctx,events,calls,replace}=setup();await ctx.printServiceSheetAndClose();replace();events.afterprint();assert.deepEqual(calls,['save','print']);
});
test('a sheet replaced while saving cannot print the replacement',async()=>{
 let resolve;const {ctx,calls,replace}=setup(()=>new Promise(r=>resolve=r));const printing=ctx.printServiceSheetAndClose();replace();resolve(true);assert.equal(await printing,false);assert.deepEqual(calls,['save']);
});
test('only the service preview Print button uses the save and close action',()=>{
 assert.match(html,/class="printPreview" title="Save, print and close paperwork" onclick="printServiceSheetAndClose\(\)"/);
 assert.match(html,/window\.printServiceSheetAndClose=printServiceSheetAndClose/);
 assert.match(html,/function printJob\(j\)[^\n]+printWhenImagesReady\(\)/);
});
