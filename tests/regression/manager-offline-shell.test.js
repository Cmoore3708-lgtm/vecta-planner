import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker(){
  const stores=new Map(),listeners={};
  const key=r=>new URL(typeof r==='string'?r:r.url,'https://workshop.test').href;
  const caches={
    async open(name){
      if(!stores.has(name)) stores.set(name,new Map());
      const data=stores.get(name);
      return {async put(r,s){data.set(key(r),s.clone())},async match(r){return data.get(key(r))?.clone()},async delete(r){return data.delete(key(r))}};
    },
    async keys(){return [...stores.keys()]},
    async delete(name){return stores.delete(name)},
    async match(r){for(const data of stores.values())if(data.has(key(r)))return data.get(key(r)).clone()}
  };
  const context={caches,URL,Request,Response,Set,Date,Promise,console,
    fetch:async()=>new Response('asset'),
    self:{location:{origin:'https://workshop.test'},navigator:{onLine:true},addEventListener:(type,fn)=>listeners[type]=fn,
      skipWaiting:async()=>{},clients:{claim:async()=>{},matchAll:async()=>[]}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../../public/service-worker.js',import.meta.url),'utf8'),context);
  return {context,listeners,caches,stores,run:source=>vm.runInContext(source,context)};
}
const shell=()=>new Response('<script src="/assets/planner.js"></script><h1>Planner</h1>',{headers:{'X-Vecta-Manager-Authenticated':'1'}});

test('authenticated planner survives worker activation and cold offline reopen',async()=>{
  const w=worker();w.context.shell=shell();
  await w.run('cacheShell(shell)');
  let activation;w.listeners.activate({waitUntil:p=>activation=p});await activation;
  w.context.self.navigator.onLine=false;
  w.context.fetch=async()=>{throw Error('airplane mode')};
  const response=await w.run("handleMainNavigation(new Request('https://workshop.test/?date=2026-10-01'))");
  assert.match(await response.text(),/Planner/);
  assert.ok(await w.caches.match('https://workshop.test/assets/planner.js'));
  assert.ok(await w.caches.match('https://workshop.test/supabase.min.js?v=20260901-refresh2'));
});

test('public page or legacy shell cannot authorise offline Main',async()=>{
  const w=worker();w.context.shell=new Response('<h1>Booking</h1>');
  await w.run('cacheShell(shell)');
  const old=await w.caches.open('vecta-workshop-pro-shell-old');await old.put('/index.html',new Response('old planner'));
  w.context.fetch=async()=>{throw Error('offline')};
  assert.equal((await w.run("handleMainNavigation(new Request('https://workshop.test/'))")).type,'error');
});

test('denied manager authentication revokes cached access; server outage preserves it',async()=>{
  const w=worker();w.context.shell=shell();await w.run('cacheShell(shell)');
  w.context.fetch=async()=>new Response('outage',{status:503});
  assert.match(await (await w.run("handleMainNavigation(new Request('https://workshop.test/'))")).text(),/Planner/);
  w.context.fetch=async()=>new Response('sign in',{status:401});
  assert.equal((await w.run("handleMainNavigation(new Request('https://workshop.test/'))")).status,401);
  w.context.fetch=async()=>{throw Error('offline')};
  assert.equal((await w.run("handleMainNavigation(new Request('https://workshop.test/'))")).type,'error');
});

test('a failed dependency download never replaces a usable offline planner',async()=>{
  const w=worker();w.context.shell=shell();await w.run('cacheShell(shell)');
  w.context.fetch=async()=>new Response('missing',{status:404});
  w.context.shell=new Response('new planner',{headers:{'X-Vecta-Manager-Authenticated':'1'}});
  await assert.rejects(w.run('cacheShell(shell)'));
  assert.match(await (await w.run('cachedMain()')).text(),/Planner/);
});
