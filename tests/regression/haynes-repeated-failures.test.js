import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../../docs/sql/haynes-repeated-failures.sql',import.meta.url),'utf8');
test('failed registrations have durable private memory without a timer or strike threshold',()=>{
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.haynes_relay_failed_registrations/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);assert.match(migration,/REVOKE ALL.*FROM PUBLIC, anon, authenticated/);
 assert.match(migration,/NEW.completed_at IS NOT NULL AND NEW.status IN \('UNAVAILABLE','AMBIGUOUS'\)/);
 assert.match(migration,/NEW.status='MATCHED'/);assert.match(migration,/p_payload->>''retry'' = ''true''/);
 assert.doesNotMatch(migration,/retryAfterSeconds|>= 3|24 hours/);
});

import handler from '../../lib/haynes-proxy.js';
import {managerSessionCookie} from '../../middleware.js';
test('reset requires an explicit same-origin request and signed-in manager',async()=>{
 const saved={...process.env},oldFetch=global.fetch;let fetches=0;
 try{
 Object.assign(process.env,{VERCEL_ENV:'production',VECTA_MAIN_USER:'Manager',VECTA_MAIN_PASSWORD:'test-only',HAYNES_RELAY_SITE_TOKEN:'b'.repeat(64)});delete process.env.HAYNES_WORKER_TOKEN;delete process.env.HAYNES_WORKER_URL;
 global.fetch=async(_url,options)=>{fetches++;assert.equal(JSON.parse(options.body).retry,true);return {ok:true,json:async()=>({status:'UNAVAILABLE'})};};
 async function request(method,origin,cookie=''){let code,data;const res={setHeader(){},status(c){code=c;return this},json(d){data=d;return this}};await handler({method,query:{reg:'KX15FWF',retry:'1'},headers:{host:'workshop.test',origin,cookie}},res);return {code,data};}
 assert.equal((await request('GET','https://workshop.test')).code,405);
 assert.equal((await request('POST','https://other.test')).code,403);
 assert.equal((await request('POST','https://workshop.test')).code,401);assert.equal(fetches,0);
 const cookie=await managerSessionCookie({user:'Manager',password:'test-only'});
 assert.equal((await request('POST','https://workshop.test',cookie)).code,200);assert.equal(fetches,1);
 }finally{global.fetch=oldFetch;process.env=saved;}
});
