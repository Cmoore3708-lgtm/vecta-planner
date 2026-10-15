import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLiveRelease} from '../../scripts/verify-live-release.mjs';
import main from '../../api/supabase-config.js';
import website from '../../website/api/availability.js';

const commit='a'.repeat(40);
function fetcher(changes={}){return async(url,options)=>{
 assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
 if(url.includes('access-health'))return Response.json(changes.access||{ok:true,authenticated_access:true});
 return Response.json({application:url.includes('vectamotors')?'website':'workshop',environment:'production',commit,...(url.includes('vectamotors')?changes.website:changes.workshop)});
};}
test('release verification covers each frontend, mechanic alias and authenticated data health',async()=>{
 const result=await verifyLiveRelease({commit,fetch:fetcher()});assert.equal(result.ok,true);assert.equal(result.checks.length,4);
});
test('a partial release or failed access probe cannot be reported as complete',async()=>{
 for(const changes of [{website:{commit:'b'.repeat(40)}},{workshop:{environment:'preview'}},{access:{ok:false,authenticated_access:false}}]){
  const result=await verifyLiveRelease({commit,fetch:fetcher(changes)});assert.equal(result.ok,false);assert.ok(result.checks.some(c=>!c.ok));
 }
 const unavailable=await verifyLiveRelease({commit,fetch:async()=>{throw Error('offline');}});assert.equal(unavailable.ok,false);assert.equal(unavailable.checks[0].error,'offline');
});
test('missing exact commit and credential-bearing targets are rejected before requests',async()=>{
 await assert.rejects(verifyLiveRelease({commit:'main'}),/exact expected/);
 await assert.rejects(verifyLiveRelease({commit,website:'https://secret@website.test'}),/without credentials/);
});
test('release stamps reveal only commit/environment/application and need no database credentials',async()=>{
 const oldSha=process.env.VERCEL_GIT_COMMIT_SHA,oldEnv=process.env.VERCEL_ENV;
 process.env.VERCEL_GIT_COMMIT_SHA=commit;process.env.VERCEL_ENV='production';
 try{
  for(const [handler,application] of [[main,'workshop'],[website,'website']]){
   const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};
   await handler({method:'GET',query:{action:'release'}},res);
   assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'no-store');assert.deepEqual(res.body,{application,commit,environment:'production'});
  }
 }finally{for(const [key,value] of [['VERCEL_GIT_COMMIT_SHA',oldSha],['VERCEL_ENV',oldEnv]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
