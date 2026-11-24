import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../lib/job-engine-oil.js';

test('oil lookup keeps its vehicle result and selected row per visit independently of service mileage',async t=>{
 const env={VERCEL_ENV:'preview',VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY:'fixture',VECTA_MAIN_USER:'test',VECTA_MAIN_PASSWORD:'fixture',HAYNES_RELAY_SITE_TOKEN:'a'.repeat(64)};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const [k,v] of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 let row,lookups=0;
 const reg='AB12CDE',oil=[{specification:'SAE 5W-30 · ACEA C3',capacity:'4 L'},{specification:'SAE 0W-30 · ACEA C2',capacity:'4 L'}];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(url.includes('/functions/v1/')){
   lookups++;const {request}=JSON.parse(options.body);
   assert.equal(request.purpose,'lubricants');assert.deepEqual(request.menuChoices,[]);
   return Response.json({status:'MATCHED',result:{kind:'lubricants',mileage:request.mileage,period:'',vehicle:{registration:reg,typeId:'t_1',make:'Test',model:'Example',variant:'Petrol'},oil}});
  }
  assert.match(url,/workshop_settings/);
  if(options.method==='POST'){assert.equal(JSON.parse(options.body).id,'job_oil:visit:'+reg);row=JSON.parse(options.body);}
  if(options.method==='PATCH')row={...row,...JSON.parse(options.body)};
  return Response.json(row?[row]:[]);
 });
 async function call(method,body){
  const req={method,query:{reg,job:'visit'},headers:{authorization:'Basic '+Buffer.from('test:fixture').toString('base64')},body};
  const res={setHeader(){},status(){return this;},json(v){this.value=v;}};
  await handler(req,res);return res.value;
 }
 const first=await call('GET');assert.equal(first.status,'MATCHED');assert.equal(first.result.oil.length,2);assert.equal(first.result.selected,null);assert.equal('mileage' in first.result,false);
 const choice=await call('POST',{selected:1,version:first.result.version});assert.equal(choice.result.selected,1);
 assert.equal((await call('GET')).result.selected,1);assert.equal(lookups,1);
 assert.equal((await call('POST',{selected:0,version:'old'})).status,'RELOAD');
});
