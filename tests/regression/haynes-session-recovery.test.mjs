import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createHaynesSessionRecovery,loginAttemptStore} from '../../workers/haynes/session-recovery.mjs';
import {patchHaynesLookup,patchHaynesLauncher} from '../../workers/tyres/managed-update/patch-release.mjs';

// Reduced public supplier login observed 7 November. No credentials or tokens.
const login='<body><form action="/touch/site/layout/wsdLogin" method="POST"><input id="username" name="username"><input id="password" name="password" type="password"><input name="submit" type="submit"></form><form action="/touch/site/layout/wsdLogin" method="POST"><input name="submit" type="submit"></form></body>';
const ready='<body><input id="numberPlate" name="numberPlate"></body>';
function pageFixture({markup=login,success=true,host='https://www.workshopdata.com',gate}={}){
 let document=parseHTML('<html>'+markup+'</html>').document,submits=0,gotos=0,filled=[];
 const select=(selector,roots=[document])=>{
  let elements=roots.flatMap(root=>Array.from(root.querySelectorAll(selector)));
  return {selector,count:async()=>elements.length,isVisible:async()=>elements.length===1,
   filter({has}){elements=elements.filter(el=>el.querySelector(has.selector));return this;},
   locator:selector=>select(selector,elements),
   fill:async value=>{filled.push(value);},
   async click(){submits++;await gate;if(success)document=parseHTML('<html>'+ready+'</html>').document;},
   async waitFor(){if(!elements.length)throw Error('secret input must never reach logs');}
  };
 };
 const page={url:()=>host+'/touch/site/layout/makesOverview',locator:select,
  async goto(){gotos++;if(success)document=parseHTML('<html>'+ready+'</html>').document;},
  async evaluate(fn){document.images=document.querySelectorAll('img');return vm.runInNewContext('('+fn.toString()+')()',{document,URL,location:{href:page.url(),pathname:'/touch/site/layout/makesOverview'}});}
 };
 return {page,counts:()=>({submits,gotos,filled})};
}
function store(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'haynes-login-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'attempt.json');return {file,attempts:loginAttemptStore(file)};}
test('valid saved cookie session needs no password or new navigation',async()=>{
 const f=pageFixture({markup:ready});const s=createHaynesSessionRecovery();
 assert.equal((await s.ensure(f.page)).login,false);assert.deepEqual(f.counts(),{submits:0,gotos:0,filled:[]});
});
test('observed login form signs in once and retains the existing supplier session',async t=>{
 const {attempts,file}=store(t),f=pageFixture();
 const s=createHaynesSessionRecovery({username:'example-user',password:'example-password',attempts,now:()=>100});
 assert.equal((await s.ensure(f.page)).login,false);assert.equal(f.counts().submits,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),{at:100,blocked:false});
 assert.doesNotMatch(fs.readFileSync(file,'utf8'),/example/);
});
test('parallel vehicle and service requests perform only one login',async t=>{
 const {attempts}=store(t);let release;const gate=new Promise(r=>release=r);
 const first=pageFixture({gate}),second=pageFixture();
 const s=createHaynesSessionRecovery({username:'user',password:'pass',attempts});
 const a=s.ensure(first.page),b=s.ensure(second.page);release();await Promise.all([a,b]);
 assert.equal(first.counts().submits+second.counts().submits,1);assert.equal(second.counts().gotos,1);
});
test('failed password blocks further submissions across process restarts',async t=>{
 const {attempts,file}=store(t),f=pageFixture({success:false});
 const options={username:'user',password:'pass',attempts,now:()=>100};
 await assert.rejects(createHaynesSessionRecovery(options).ensure(f.page),{code:'LOGIN_REQUIRED'});
 await assert.rejects(createHaynesSessionRecovery({...options,now:()=>10000000,attempts:loginAttemptStore(file)}).ensure(f.page),{code:'LOGIN_REQUIRED'});
 assert.equal(f.counts().submits,1);
});
test('supplier verification, off-origin pages and changed forms never receive credentials',async t=>{
 const {attempts}=store(t);
 for(const [opts,code] of [[{host:'https://untrusted.example'},'LOGIN_REQUIRED'],[{markup:login.replace('/wsdLogin','/unknown')},'LOGIN_REQUIRED'],[{markup:login.replace('<body>','<body>Verify you are human ')},'VERIFICATION_REQUIRED'],[{markup:login.replace('<body>','<body><input autocomplete="one-time-code">')},'VERIFICATION_REQUIRED']]){
  const f=pageFixture(opts),s=createHaynesSessionRecovery({username:'user',password:'pass',attempts});
  await assert.rejects(s.ensure(f.page),{code});assert.equal(f.counts().submits,0);assert.deepEqual(f.counts().filled,[]);
 }
});
test('unreadable attempt record and concurrent lock fail closed without repeated passwords',async t=>{
 const {attempts,file}=store(t);fs.writeFileSync(file,'invalid');assert.equal(attempts.reserve(100,0),false);
 fs.rmSync(file);fs.writeFileSync(file+'.lock','');assert.equal(attempts.reserve(100,0),false);
 fs.rmSync(file+'.lock');assert.equal(attempts.reserve(100,0),true);assert.equal(attempts.reserve(100000,0),false);
});
test('successful login respects cooldown and permits later expired-session recovery',async t=>{
 const {attempts}=store(t);assert.equal(attempts.reserve(100,1000),true);attempts.confirmed(100);
 assert.equal(attempts.reserve(200,1000),false);assert.equal(attempts.reserve(1200,1000),true);
});
test('managed update preserves catalogue code and rejects unfamiliar Haynes readers',()=>{
 const original="import {readVehicle} from './dom.mjs';\nconst initial=await page.evaluate(readVehicle);\n// existing guided maintenance";
 const patched=patchHaynesLookup(original,'service');assert.match(patched,/existing guided maintenance/);
 assert.equal(patchHaynesLookup(patched,'service'),patched);assert.throws(()=>patchHaynesLookup('unknown','vehicle'),/Unknown Haynes/);
 const launch="Remove-Item Env:HAYNES_RELAY_TOKEN -ErrorAction SilentlyContinue\n$entry = switch ($Worker)";
 const updated=patchHaynesLauncher(launch);assert.equal(patchHaynesLauncher(updated),updated);assert.match(updated,/Worker -eq 'Haynes'/);
});
