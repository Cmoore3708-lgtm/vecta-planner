import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleLookup} from '../../api/vehicle-lookup.js';

const env={DVSA_CLIENT_ID:'test',DVSA_CLIENT_SECRET:'secret',DVSA_SCOPE:'mot',DVSA_TOKEN_URL:'https://token.test',DVSA_API_KEY:'key',DVLA_API_KEY:'tax-key',DVLA_API_URL:'https://tax.test',DVSA_API_BASE_URL:'https://mot.test'};
const mot={registration:'AB12CDE',make:'NISSAN',model:'Test',primaryColour:'BLUE',motTests:[{testResult:'PASSED',completedDate:'2026-09-01',expiryDate:'2027-09-01',odometerValue:'120000',defects:[{type:'ADVISORY',text:'Test advisory'}]}]};
const response=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};}
async function call(handler,registration='AB12 CDE'){const r=res();await handler({method:'GET',query:{reg:registration}},r);return r;}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};}

test('MOT and tax run independently; a tax failure preserves MOT history and colour',async()=>{
 const tax=deferred(),motStarted=deferred();let taxStarted=false;
 const handler=createVehicleLookup({env,fetch:async(url,options)=>{
  assert.ok(options.signal instanceof AbortSignal);
  if(url===env.DVLA_API_URL){taxStarted=true;return tax.promise;}
  if(url===env.DVSA_TOKEN_URL)return response({access_token:'token',expires_in:1200});
  assert.ok(taxStarted);motStarted.resolve();return response(mot);
 }});
 const pending=call(handler);await motStarted.promise;tax.resolve(new Response('{}',{status:503}));
 const r=await pending;assert.equal(r.code,200);assert.equal(r.body.primaryColour,'BLUE');assert.deepEqual(r.body.advisories,['Test advisory']);assert.equal(r.body.taxLookupStatus,'unavailable');assert.equal(r.body.taxDueDate,'');
});

test('overlapping identical registrations share work; later lookups remain fresh',async()=>{
 const token=deferred();let tokens=0,mots=0,taxes=0;
 const handler=createVehicleLookup({env,fetch:async url=>{
  if(url===env.DVSA_TOKEN_URL){tokens++;return token.promise;}
  if(url===env.DVLA_API_URL){taxes++;return response({colour:'RED',engineCapacity:1600});}
  mots++;return response(mot);
 }});
 const first=call(handler),second=call(handler,'AB12CDE'),third=call(handler,'XY12ZZZ');
 token.resolve(response({access_token:'token',expires_in:1200}));
 const [a,b]=await Promise.all([first,second,third]);assert.equal(tokens,1);assert.equal(mots,2);assert.equal(taxes,2);assert.equal(a.body.engineSize,1600);
 a.body.motTests[0].odometerValue='changed';assert.equal(b.body.motTests[0].odometerValue,'120000');
 await call(handler);assert.equal(tokens,1);assert.equal(mots,3);assert.equal(taxes,3);
});

test('tax timeout cannot hang a successful MOT lookup',async()=>{
 const handler=createVehicleLookup({env,taxTimeout:10,fetch:async(url,{signal})=>{
  if(url===env.DVSA_TOKEN_URL)return response({access_token:'token',expires_in:1200});
  if(url===env.DVLA_API_URL)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return response(mot);
 }});
 const keepAlive=setTimeout(()=>{},1000);
 try{const r=await call(handler);assert.equal(r.code,200);assert.equal(r.body.taxLookupStatus,'unavailable');}finally{clearTimeout(keepAlive);}
});

test('token timeout returns a bounded error and permits a subsequent retry',async()=>{
 let calls=0;
 const handler=createVehicleLookup({env:{...env,DVLA_API_KEY:''},tokenTimeout:10,fetch:async(url,{signal})=>{
  if(url!==env.DVSA_TOKEN_URL)return response(mot);
  if(++calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return response({access_token:'token',expires_in:1200});
 }});
 const keepAlive=setTimeout(()=>{},1000);
 try{assert.equal((await call(handler)).code,504);assert.equal((await call(handler)).code,200);}finally{clearTimeout(keepAlive);}
});

test('invalid requests make no provider calls and concurrency is bounded',async()=>{
 const token=deferred();let calls=0;
 const handler=createVehicleLookup({env:{...env,DVLA_API_KEY:''},maxInFlight:1,fetch:async url=>{calls++;return url===env.DVSA_TOKEN_URL?token.promise:response(mot);}});
 assert.equal((await call(handler,['A','B'])).code,400);assert.equal(calls,0);
 const first=call(handler);const busy=await call(handler,'XY12ZZZ');assert.equal(busy.code,503);assert.equal(busy.headers['Retry-After'],'5');
 token.resolve(response({access_token:'token',expires_in:1200}));await first;
 assert.equal((await call(handler,'XY12ZZZ')).code,200);
});

test('MOT timeout and invalid successful provider JSON do not masquerade as empty vehicle data',async()=>{
 for(const mode of ['timeout','invalid']){
  const handler=createVehicleLookup({env:{...env,DVLA_API_KEY:''},motTimeout:10,fetch:async(url,{signal})=>{
   if(url===env.DVSA_TOKEN_URL)return response({access_token:'token',expires_in:1200});
   if(mode==='invalid')return new Response('not json');
   return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  }});
  const keepAlive=setTimeout(()=>{},1000);
  try{const r=await call(handler);assert.equal(r.code,mode==='timeout'?504:502);assert.equal(r.body.vehicle,undefined);}finally{clearTimeout(keepAlive);}
 }
});

test('short-lived tokens expire without an artificial minimum lifetime',async()=>{
 let timestamp=0,tokens=0;
 const handler=createVehicleLookup({env:{...env,DVLA_API_KEY:''},now:()=>timestamp,fetch:async url=>{
  if(url===env.DVSA_TOKEN_URL){tokens++;return response({access_token:'token-'+tokens,expires_in:10});}
  return response(mot);
 }});
 await call(handler);timestamp=11000;await call(handler);assert.equal(tokens,2);
});
