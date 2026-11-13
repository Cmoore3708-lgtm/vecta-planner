import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync(new URL('../../public/js/vecta-optional-tools.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(markup=''){
 const {window,document}=parseHTML('<html><head></head><body>'+markup+'</body></html>'),timers=new Map(),messages=[];let id=0;
 window.VECTA_MECHANIC_DEPLOYMENT=false;window.setTimeout=fn=>{timers.set(++id,fn);return id;};window.clearTimeout=id=>timers.delete(id);window.alert=message=>messages.push(message);
 const context=vm.createContext({window,console,Promise,Map,WeakMap});vm.runInContext(source,context);
 return {window,document,timers,messages,scripts:()=>[...document.querySelectorAll('script')],context};
}
function quoteMarkup(){return '<div id="jobModal" class="open"><section class="jobWorkSection"><textarea id="job_work_required">Supply and fit alternator</textarea></section><input id="job_status" value="quote"><div id="privatePricingRows"></div></div>';}
test('startup is lazy, booked jobs load the pricing panel, and mechanics/completed cards do not',async()=>{
 const c=setup(quoteMarkup());assert.equal(c.scripts().length,0);
 const api={privatePricingRowHtml:()=>{}};let received;
 c.document.getElementById('job_status').value='booked';c.window.VectaRepairQuote.mount({id:'normal'},api);assert.equal(c.scripts().length,1);
 c.window.VectaRepairQuote={mount:(job,helpers)=>received=helpers};c.scripts()[0].onload();await settle();assert.equal(received,api);
 for(const status of ['completed','work_complete','ready_to_invoice']){const done=setup(quoteMarkup());done.document.getElementById('job_status').value=status;done.window.VectaRepairQuote.mount({id:'done'});assert.equal(done.scripts().length,0);}
 const mechanic=setup(quoteMarkup());mechanic.window.VECTA_MECHANIC_DEPLOYMENT=true;mechanic.window.VectaRepairQuote.mount({id:'mechanic'});assert.equal(mechanic.scripts().length,0);
});
test('rapid quote opens share one download and only mount the current connected card',async()=>{
 const c=setup(quoteMarkup()),mounted=[];c.window.VectaRepairQuote.mount({id:'old'});c.window.VectaRepairQuote.mount({id:'current'});assert.equal(c.scripts().length,1);
 c.window.VectaRepairQuote={mount:job=>mounted.push(job.id)};c.scripts()[0].onload();await settle();assert.deepEqual(mounted,['current']);assert.equal(c.timers.size,0);
 const closed=setup(quoteMarkup());closed.window.VectaRepairQuote.mount({id:'closed'});closed.document.getElementById('jobModal').classList.remove('open');closed.window.VectaRepairQuote={mount:()=>{throw Error('Mounted closed card');}};closed.scripts()[0].onload();await settle();
});
test('service opening and printing share the same release and never initialise a replaced sheet',async()=>{
 const c=setup('<div class="servicePrint"></div>'),sheet=c.document.querySelector('.servicePrint'),calls=[];
 const opening=c.window.initHaynesServiceSheet(sheet,'TEST','service'),printing=c.window.prepareHaynesServicePrint(sheet);
 assert.equal(c.scripts().length,1);assert.match(c.scripts()[0].src,/haynes-service-sheet\.js$/);
 c.window.initHaynesServiceSheet=(el,reg,kind)=>calls.push([reg,kind]);c.window.prepareHaynesServicePrint=()=>calls.push('print');c.scripts()[0].onload();await Promise.all([opening,printing]);assert.deepEqual(calls,[['TEST','service'],'print']);assert.equal(sheet.querySelector('[data-optional-tool]'),null);
 const replaced=setup('<div class="servicePrint"></div>'),old=replaced.document.querySelector('.servicePrint');const pending=replaced.window.initHaynesServiceSheet(old,'OLD','service');old.remove();replaced.window.initHaynesServiceSheet=()=>{throw Error('Initialised replaced sheet');};replaced.scripts()[0].onload();await pending;
});
test('failed and timed-out optional downloads remain retryable without hiding the saved sheet',async()=>{
 const c=setup('<div class="servicePrint"><span class="ssCheck checked">Saved checks</span></div>'),sheet=c.document.querySelector('.servicePrint');
 const first=c.window.initHaynesServiceSheet(sheet,'TEST','service');c.scripts()[0].onerror();await first;assert.equal(c.scripts().length,0);assert.match(sheet.textContent,/Saved checks/);assert.ok(sheet.querySelector('button'));
 const retry=c.window.initHaynesServiceSheet(sheet,'TEST','service');assert.equal(c.scripts().length,1);[...c.timers.values()][0]();await retry;assert.equal(c.scripts().length,0);
 const third=c.window.initHaynesServiceSheet(sheet,'TEST','service');let called=0;c.window.initHaynesServiceSheet=()=>called++;c.scripts()[0].onload();await third;assert.equal(called,1);assert.equal(c.timers.size,0);
});
test('monthly export waits for its helper and a failed export can be tried again',async()=>{
 const c=setup(),exports=[];const first=c.window.VectaMonthlyTracker.download('2026-11',[['TEST',100]],[],{total:100});assert.equal(c.scripts().length,1);c.scripts()[0].onerror();await first;assert.equal(c.messages.length,1);
 const next=c.window.VectaMonthlyTracker.download('2026-11',[['TEST',100]],[],{total:100});c.window.VectaMonthlyTracker={download:(...args)=>exports.push(args)};c.scripts()[0].onload();await next;assert.equal(exports.length,1);assert.equal(exports[0][0],'2026-11');assert.equal(exports[0][3].total,100);
});
