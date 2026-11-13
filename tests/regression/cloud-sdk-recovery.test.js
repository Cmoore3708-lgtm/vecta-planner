import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/js/vecta-workshop-access.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const timers=[],scripts=[],nodes=new Map(),window={};
 const document={getElementById:id=>nodes.get(id),createElement:()=>({remove(){nodes.delete(this.id);this.removed=true}}),head:{appendChild(script){scripts.push(script);nodes.set(script.id,script)}}};
 window.document=document;
 const c={window,document,Promise,setTimeout(fn){timers.push(fn);return timers.length},clearTimeout(){}};
 vm.runInNewContext(source,c);return {c,window,timers,scripts,load:()=>new Promise(resolve=>window.VectaWorkshopAccess.loadSdk(resolve))};
}
test('a failed SDK fetch is removed and retried successfully without reloading the page',async()=>{
 const h=harness(),first=h.load();await tick();h.scripts[0].onerror();assert.equal(await first,false);assert.equal(h.scripts[0].removed,true);
 const second=h.load();await tick();assert.equal(h.scripts.length,2);h.window.supabase={};h.scripts[1].onload();assert.equal(await second,true);
});
test('simultaneous SDK requests share one download and a timeout permits a replacement',async()=>{
 const h=harness(),a=h.load(),b=h.load();await tick();assert.equal(h.scripts.length,1);h.timers[0]();assert.deepEqual(await Promise.all([a,b]),[false,false]);
 const c=h.load();await tick();h.scripts[0].onload();assert.equal(h.scripts[1].removed,undefined);
 h.window.supabase={};h.scripts[1].onload();assert.equal(await c,true);
});
test('an SDK loaded by the existing page does not request another script',async()=>{
 const h=harness();h.window.supabase={};assert.equal(await h.load(),true);assert.equal(h.scripts.length,0);
});
