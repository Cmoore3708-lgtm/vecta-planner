import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionRecovery,timeout} from './session-recovery.mjs';
const supplier='https://esp.thevirtualwarehouse.co.uk/';
function fake({login=true,success=true,foreign=false,ambiguous=false}={}){
 let url=supplier,posts=0,fills=[];
 const field=name=>({count:async()=>ambiguous?2:1,isVisible:async()=>true,fill:async value=>fills.push(name)});
 const page={url:()=>url,goto:async()=>{url=foreign?'https://example.org/':login?supplier+'Account/LogOn':supplier+'Enquiry';},locator:selector=>field(selector.includes('password')?'password':'username'),getByRole:()=>({count:async()=>1,click:async()=>{posts++;if(success)url=supplier+'Enquiry';}}),waitForURL:async predicate=>{if(!predicate(new URL(url)))throw Error('timeout');}};
 return {page,get posts(){return posts},fills};
}
test('valid saved session resumes without credentials or login submissions',async()=>{const f=fake({login:false});await createSessionRecovery({supplier}).ensure(f.page);assert.equal(f.posts,0);});
test('missing credentials reports login required; redirects never receive credentials',async()=>{for(const options of [{},{foreign:true},{ambiguous:true}]){const f=fake(options);await assert.rejects(createSessionRecovery({supplier,username:options.foreign||options.ambiguous?'user':'',password:'secret'}).ensure(f.page),/LOGIN_REQUIRED/);assert.equal(f.posts,0);assert.deepEqual(f.fills,[]);}});
test('saved login restores a session once, and failed credentials obey shared cooldown',async()=>{let clock=100;const r=createSessionRecovery({supplier,username:'user',password:'secret',now:()=>clock,cooldownMs:1000}),good=fake();await r.ensure(good.page);assert.equal(good.posts,1);const bad=fake({success:false});await assert.rejects(r.ensure(bad.page),/LOGIN_REQUIRED/);assert.equal(bad.posts,0);clock+=1001;await assert.rejects(r.ensure(bad.page),/LOGIN_REQUIRED/);assert.equal(bad.posts,1);await assert.rejects(r.ensure(bad.page),/LOGIN_REQUIRED/);assert.equal(bad.posts,1);});
test('stalled lookup is bounded and successful work clears the deadline',async()=>{assert.equal(await timeout(Promise.resolve('ok'),100),'ok');await assert.rejects(timeout(new Promise(()=>{}),5),/LOOKUP_TIMEOUT/);});
