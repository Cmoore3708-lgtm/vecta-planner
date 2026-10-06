import test from 'node:test';
import assert from 'node:assert/strict';
import { relayLookup } from '../../lib/haynes-relay.js';

test('scoped website relay does not require or transmit a database administrator key', async () => {
  const saved = {...process.env}, oldFetch = global.fetch;
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.HAYNES_RELAY_SITE_TOKEN = 'b'.repeat(64);
    delete process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VECTA_TEST_SUPABASE_URL;
    global.fetch = async (url,options) => {
      assert.equal(url,'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pc-relay');
      assert.equal(options.headers.Authorization,'Bearer '+'b'.repeat(64));
      assert.equal(options.headers.apikey,undefined);
      assert.deepEqual(JSON.parse(options.body),{action:'enqueue',registration:'FX69XWU'});
      return {ok:true,json:async () => ({status:'OFFLINE'})};
    };
    assert.deepEqual(await relayLookup('FX69XWU'),{status:'OFFLINE'});
    process.env.HAYNES_RELAY_SITE_TOKEN = 'bad';
    await assert.rejects(relayLookup('FX69XWU'),/Invalid scoped relay configuration/);
  } finally {global.fetch=oldFetch;process.env=saved;}
});

test('relay polls a deduplicated job and strips private result fields', async () => {
  const saved = {...process.env}, oldFetch = global.fetch;
  try {
    process.env.VERCEL_ENV = 'preview';
    process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-fixture';
    delete process.env.VECTA_TEST_SUPABASE_URL;
    const actions = [];
    global.fetch = async (url,options) => {
      assert.equal(url,'https://brqsejjykrubxuofavuu.supabase.co/rest/v1/rpc/haynes_relay');
      assert.equal(options.headers.Authorization,'Bearer server-only-test-fixture');
      assert.equal(options.redirect,'error');
      const request = JSON.parse(options.body); actions.push(request);
      return {ok:true,json:async () => request.p_action === 'enqueue' ? {status:'PENDING',id:'example'} : {
        status:'MATCHED',vehicle:{registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'1.7 dCi',typeId:'t_1',vin:'private',token:'private'}
      }};
    };
    const result = await relayLookup('FX69XWU');
    assert.equal(result.status,'MATCHED'); assert.equal(result.vehicle.vin,undefined); assert.equal(result.vehicle.token,undefined);
    assert.deepEqual(actions,[{p_action:'enqueue',p_payload:{registration:'FX69XWU'}},{p_action:'poll',p_payload:{id:'example'}}]);
  } finally { global.fetch = oldFetch; process.env = saved; }
});

test('relay rejects unscoped production, wrong database, wrong registration and backend failures', async () => {
  const saved = {...process.env}, oldFetch = global.fetch;
  try {
    process.env.VERCEL_ENV = 'production'; process.env.SUPABASE_URL = 'https://jywufozycuwuoshlulwl.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
    await assert.rejects(relayLookup('FX69XWU'),/Scoped relay token required/);
    process.env.VERCEL_ENV = 'preview'; process.env.VECTA_TEST_SUPABASE_URL = 'https://other.supabase.co'; process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY = 'fixture';
    await assert.rejects(relayLookup('FX69XWU'),/Scoped relay token required/);
    delete process.env.VECTA_TEST_SUPABASE_URL;
    global.fetch = async () => ({ok:true,json:async () => ({status:'MATCHED',vehicle:{registration:'AB12CDE'}})});
    await assert.rejects(relayLookup('FX69XWU'),{code:'MISMATCH'});
    global.fetch = async () => ({ok:false});
    await assert.rejects(relayLookup('FX69XWU'),/Relay unavailable/);
    global.fetch = async () => ({ok:true,json:async () => ({status:'OFFLINE'})});
    assert.deepEqual(await relayLookup('FX69XWU'),{status:'OFFLINE'});
  } finally { global.fetch = oldFetch; process.env = saved; }
});

for (const environment of ['production','preview']) test(`scoped relay works in ${environment} without using its booking database`,async()=>{
 const saved={...process.env},oldFetch=global.fetch;
 try{
  process.env.VERCEL_ENV=environment;process.env.HAYNES_RELAY_SITE_TOKEN='a'.repeat(64);
  process.env.SUPABASE_SERVICE_ROLE_KEY='must-not-be-used';process.env.SUPABASE_URL='https://jywufozycuwuoshlulwl.supabase.co';
  global.fetch=async(url,options)=>{
   assert.equal(url,'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pc-relay');
   assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));assert.equal(options.headers.apikey,undefined);
   return {ok:true,json:async()=>({status:'MATCHED',vehicle:{registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'1.7 dCi',typeId:'t_1'}})};
  };assert.equal((await relayLookup('FX69XWU')).status,'MATCHED');
 }finally{global.fetch=oldFetch;process.env=saved;}
});
