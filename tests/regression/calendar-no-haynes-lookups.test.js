import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8').split('/* Dashboard registration lookup:')[0];
test('opening different calendar days and reopening never starts a vehicle or colour lookup',async()=>{
 const storage=new Map();let calls=0;
 for(let reopen=0;reopen<3;reopen++){
  const document={addEventListener(){}};
  const window={document,navigator:{onLine:true},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},fetch:async()=>{calls++;throw Error('Unexpected calendar request');}};
  vm.runInNewContext(source,{window,document,AbortController,AbortSignal,setTimeout,clearTimeout,encodeURIComponent});
  for(let day=0;day<5;day++){
   const jobs=Array.from({length:10},(_,id)=>({id,registration:'AB'+day+id+'XYZ',make:'Unknown',model:'Unknown'}));
   const cards=jobs.map(j=>({dataset:{jobId:String(j.id)},isConnected:true,matches:()=>false,querySelector:()=>({}),getBoundingClientRect:()=>({top:0,bottom:100})}));
   window.enrichHaynesDashboard({querySelectorAll:()=>cards,isConnected:true},jobs);
   await new Promise(resolve=>setImmediate(resolve));
  }
 }
 assert.equal(calls,0);
});
