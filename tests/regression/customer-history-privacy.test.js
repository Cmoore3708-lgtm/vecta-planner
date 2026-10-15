import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/customer-history.js';
function res(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test('returning-customer lookup returns autofill without notes, other vehicles or job history',async()=>{
 const oldFetch=global.fetch,oldEnv={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',VERCEL_ENV:'production'});delete process.env.VITE_SUPABASE_URL;
 const calls=[];global.fetch=async url=>{calls.push(url);return new Response(JSON.stringify(url.includes('/vehicles?')?[{registration:'AB12CDE',customer_id:'customer',vehicle:'Car'}]:[{id:'customer',name:'Customer',phone:'07700900123',email:'test@example.com'}]))};
 try{const r=res();await handler({method:'POST',body:{registration:'AB12 CDE',contact:'test@example.com'}},r);assert.equal(r.statusCode,200);assert.equal(calls.length,2);assert.equal(r.body.customer.name,'Customer');assert.equal('recentJobs' in r.body,false);assert.equal('notes' in r.body.vehicles[0],false);assert.equal(r.headers['Cache-Control'],'no-store');
 const bad=res();await handler({method:'POST',body:{registration:'AB12 CDE',contact:'abc'}},bad);assert.equal(bad.statusCode,400);assert.equal(calls.length,2);
 }finally{global.fetch=oldFetch;process.env=oldEnv}
});
