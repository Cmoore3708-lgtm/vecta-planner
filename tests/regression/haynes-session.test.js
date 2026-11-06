import test from 'node:test';
import assert from 'node:assert/strict';
import { HaynesError } from '../../lib/haynes-vehicle.js';
import { START, createHaynesSession } from '../../workers/haynes/session-recovery.mjs';

const login = new URL('wsdLogin', START).href;

function fixture({ rejected = false, blocked = false, missing = false } = {}) {
  let authorised = false, submissions = 0, confirmations = 0, reads = 0;
  const session = createHaynesSession({
    waitMs: 0,
    loadLogin: async () => {
      reads++;
      if (missing) return null;
      return { credentials: { username: 'fixture', password: 'fixture' }, confirmed: async () => { confirmations++; } };
    }
  });
  function tab() {
    let url = login;
    return {
      url: () => url,
      goto: async () => { url = authorised ? START : login; },
      evaluate: async (_fn, args) => {
        if (!args) return { blocked, login: url === login, searchReady: url === START };
        submissions++;
        authorised = !rejected;
        if (authorised) url = START;
        return true;
      },
      read: async () => {
        url = authorised ? START : login;
        if (url === login) throw new HaynesError('LOGIN_REQUIRED');
        return 'W23ADM';
      }
    };
  }
  return { tab, session, counts: () => [reads,submissions,confirmations] };
}

test('vehicle and service reads racing on expired tabs share one sign-in and resume independently', async () => {
  const f = fixture();
  const tabs = [f.tab(), f.tab()];
  assert.deepEqual(await Promise.all(tabs.map(tab => f.session(tab,tab.read))), ['W23ADM','W23ADM']);
  assert.deepEqual(f.counts(),[1,1,1]);
  assert.equal(await f.session(tabs[0],tabs[0].read),'W23ADM');
  assert.deepEqual(f.counts(),[1,1,1]);
});

test('verification, missing credentials and a rejected login do not replay or return a vehicle', async () => {
  for (const [options, code, counts] of [
    [{blocked:true},'VERIFICATION_REQUIRED',[0,0,0]],
    [{missing:true},'LOGIN_REQUIRED',[1,0,0]],
    [{rejected:true},'LOGIN_REQUIRED',[1,1,0]]
  ]) {
    const f=fixture(options), tab=f.tab();
    await assert.rejects(f.session(tab,tab.read),{code});
    assert.deepEqual(f.counts(),counts);
  }
});

test('unrecognised origins and vehicle mismatches never trigger sign-in', async () => {
  const f=fixture();
  for(const [url,code] of [[START,'MISMATCH'],['https://other.example/touch/site/layout/wsdLogin','LOGIN_REQUIRED']]){
    await assert.rejects(f.session({url:()=>url},async()=>{throw new HaynesError(code);}),{code});
  }
  assert.deepEqual(f.counts(),[0,0,0]);
});

test('only the recognised visible POST form receives credentials and Keep me logged in', async () => {
  const {runInNewContext} = await import('node:vm');
  for (const mode of ['signed-in','different-action','overridden-submit','hidden-password','preview-only','iframe']) {
    const field = (visible=true) => ({value:'',getClientRects:()=>visible?[{}]:[]});
    const user=field(), pass=field(mode!=='hidden-password'), submit=field(), remember={checked:false};
    submit.hasAttribute=attr=>mode==='overridden-submit' && attr==='formaction';
    let posted=false, url=login;
    const form={
      action:mode==='different-action'?'https://other.invalid/':login, method:'post', target:'',
      querySelector:selector=>selector.includes('password')?pass:selector.includes('submit')?submit:remember,
      requestSubmit(button){assert.equal(button,submit);posted=true;url=START;}
    };
    user.form=form;
    const window={};window.top=mode==='iframe'?{}:window;
    const page={
      url:()=>url, goto:async()=>{},
      evaluate:async(fn,args)=> args
        ? runInNewContext('('+fn.toString()+')(args)',{args, location:new URL(url),window,
          document:{querySelector:()=>mode==='preview-only'?null:user}})
        : {login:url===login,searchReady:url===START}
    };
    const session=createHaynesSession({loadLogin:async()=>({credentials:{username:'u',password:'p'},confirmed:async()=>{}})});
    const operation=()=>{if(!posted)throw new HaynesError('LOGIN_REQUIRED');return 'matched';};
    if(mode==='signed-in') {
      assert.equal(await session(page,operation),'matched');
      assert.equal(user.value,'u');assert.equal(pass.value,'p');assert.equal(remember.checked,true);
    } else {
      await assert.rejects(session(page,operation),{code:'LOGIN_REQUIRED'});
      assert.equal(posted,false);assert.equal(user.value,'');assert.equal(pass.value,'');
    }
  }
});
