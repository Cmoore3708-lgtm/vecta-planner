import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import proxy from '../../website/api/vehicle-lookup.js';
import {createVehicleLookup} from '../../api/vehicle-lookup.js';

const html=readFileSync('public/booking.html','utf8');
const lookupCode=html.slice(html.indexOf('async function lookup(reg)'),html.indexOf('\nfunction bind(){',html.indexOf('async function lookup(reg)')));
const json=(body,status=200,headers={})=>Response.json(body,{status,headers});
function customer(fetch,timer=fn=>queueMicrotask(fn)){
 const state={form:{registration:'AA12ABC'}},message={textContent:''};
 const ctx=vm.createContext({state,fetch,setTimeout:timer,AbortSignal,document:{getElementById:()=>message},todayTracking:{check(){}},startBookingTransfer(){},engineSizeFromLookup:()=>1600,VectaVehicleImage:{resolveColour:()=>''},render(){},refreshHaynes(){},haynesLookup:{lookup(){}}});
 vm.runInContext('let activeRegistrationLookup=null;'+lookupCode,ctx);
 return {ctx,state,message};
}
test('a busy lookup waits for the server, combines repeated Enter presses and shows the recovered vehicle',async()=>{
 let calls=0,wake,delay;const {ctx,state,message}=customer(async()=>++calls===1?json({error:'busy'},503,{'Retry-After':'5'}):json({vehicle:'Test Nissan'}),(fn,n)=>{wake=fn;delay=n});
 const first=ctx.lookup('AA12ABC'),second=ctx.lookup('AA12ABC');await new Promise(r=>setImmediate(r));
 assert.equal(calls,1);assert.ok(delay>=5000&&delay<6000);assert.match(message.textContent,/automatically/);
 wake();await Promise.all([first,second]);assert.equal(calls,2);assert.equal(state.lookup,'success');assert.equal(state.form.vehicle,'Test Nissan');
});
test('retry exhaustion and long Retry-After fall back, and ordinary errors do not repeat',async()=>{
 for(const [status,header,expected] of [[503,'0',3],[429,null,3],[429,'60',1],[503,null,1],[404,null,1],[400,null,1]]){
  let calls=0;const {ctx,state}=customer(async()=>{calls++;return json({error:'lookup unavailable'},status,header===null?{}:{'Retry-After':header})});
  await ctx.lookup('AA12ABC');assert.equal(calls,expected);assert.equal(state.lookup,'error');if(expected===3||header==='60')assert.match(state.lookupMessage,/make and model/);
 }
});
test('changing the plate while waiting never retries or displays the old registration',async()=>{
 let wake;const requested=[];const {ctx,state}=customer(async url=>{requested.push(url);return url.endsWith('AA12ABC')?json({},503,{'Retry-After':'1'}):json({vehicle:'Second vehicle'})},fn=>{wake=fn});
 const old=ctx.lookup('AA12ABC');await new Promise(r=>setImmediate(r));
 state.form.registration='BB12ABC';await ctx.lookup('BB12ABC');wake();await old;
 assert.equal(requested.length,2);assert.equal(state.form.vehicle,'Second vehicle');assert.equal(state.lookup,'success');
});
test('a provider busy hint survives the workshop lookup and the standalone website proxy',async t=>{
 const env={DVSA_CLIENT_ID:'fixture',DVSA_CLIENT_SECRET:'fixture',DVSA_SCOPE:'mot',DVSA_TOKEN_URL:'https://token.test',DVSA_API_KEY:'fixture'};
 const workshop=createVehicleLookup({env,fetch:async url=>url===env.DVSA_TOKEN_URL?json({access_token:'fixture',expires_in:600}):json({message:'busy'},429,{'Retry-After':'8'})});
 const req={method:'GET',query:{reg:'AA12ABC'}};
 const response=()=>({headers:new Headers(),setHeader(k,v){this.headers.set(k,v)},status(code){this.code=code;return this},json(data){this.data=data;return this},send(data){this.data=data;return this}});
 const upstream=response();await workshop(req,upstream);assert.equal(upstream.code,429);
 t.mock.method(globalThis,'fetch',async()=>json(upstream.data,upstream.code,upstream.headers));
 const outgoing=response();await proxy(req,outgoing);assert.equal(outgoing.code,429);assert.equal(outgoing.headers.get('Retry-After'),'8');
});
