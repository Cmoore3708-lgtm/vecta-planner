import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionRecovery,isLoginPage} from './session-recovery.mjs';
function fakePage({success=true,safeForm=true,formCount=1}={}) {
  let url='https://esp.thevirtualwarehouse.co.uk/Account/LogOn';
  const fills=[];let clicks=0;
  return {fills,get clicks(){return clicks},url:()=>url,
    locator:selector=>({count:async()=>formCount,isVisible:async()=>true,evaluate:async()=>safeForm,
      fill:async value=>fills.push([selector,value]),check:async()=>{},click:async()=>{clicks++;if(success)url='https://esp.thevirtualwarehouse.co.uk/';}}),
    waitForURL:async predicate=>{if(!predicate(new URL(url)))throw Error('timeout');},
    navigate:next=>{url=next;}
  };
}
const credentials=async()=>({username:'test-user',password:'test-secret'});
test('existing authenticated page never reads credentials',async()=>{
  const page=fakePage();page.navigate('https://esp.thevirtualwarehouse.co.uk/');
  assert.equal(await createSessionRecovery({readCredentials:()=>{throw Error('unexpected')}})(page),true);
  assert.equal(page.clicks,0);
});
test('expired session signs into verified supplier form',async()=>{
  const page=fakePage();assert.equal(await createSessionRecovery({readCredentials:credentials})(page),true);
  assert.equal(page.clicks,1);assert.equal(page.fills.length,2);
});
test('failed sign-in is throttled and can retry after cooldown',async()=>{
  let clock=100;const page=fakePage({success:false});
  const recover=createSessionRecovery({readCredentials:credentials,now:()=>clock});
  assert.equal(await recover(page),false);assert.equal(await recover(page),false);assert.equal(page.clicks,1);
  clock+=300001;assert.equal(await recover(page),false);assert.equal(page.clicks,2);
});
test('missing credentials preserves manual sign-in',async()=>{
  const page=fakePage();assert.equal(await createSessionRecovery({readCredentials:async()=>null})(page),false);
  assert.equal(page.fills.length,0);
});
test('rejects changed destination or form before filling',async()=>{
  assert.throws(()=>isLoginPage('https://example.com/Account/LogOn'),/ORIGIN_CHANGED/);
  for(const options of [{safeForm:false},{formCount:2}]){
    const page=fakePage(options);await assert.rejects(createSessionRecovery({readCredentials:credentials})(page),/FORM_CHANGED/);
    assert.equal(page.fills.length,0);
  }
});
test('parallel recovery calls submit only once',async()=>{
  const page=fakePage();const recover=createSessionRecovery({readCredentials:credentials});
  assert.deepEqual(await Promise.all([recover(page),recover(page)]),[true,true]);assert.equal(page.clicks,1);
});
