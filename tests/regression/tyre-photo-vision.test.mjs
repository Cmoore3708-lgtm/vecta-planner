import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{normaliseReading} from '../../website/lib/tyre-photo-reader.js';

test('retain commercial suffixes, dual ratings, ZR and XL without inventing missing ratings',()=>{
 assert.deepEqual(normaliseReading({size:'205 / 65 R16C',loadIndex:'107/105',speedRating:'T'}),{
  size:'205/65R16C',baseSize:'205/65R16',loadIndex:'107/105',speedRating:'T',extraLoad:false,commercial:true,label:'205/65R16C 107/105T'
 });
 assert.equal(normaliseReading({size:'235/45ZR20',extraLoad:true}).label,'235/45ZR20 XL');
 assert.equal(normaliseReading({size:'215/60R17CP'}).commercial,true);
 for(const size of ['205/6SR16','999/99R99','205/65R160','205/65R16<script>'])assert.equal(normaliseReading({size}),null);
});

function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.body=data;return this;}};}
const image='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(1100,1)]).toString('base64');
test('production stays disabled; malformed images and cross-site calls never reach the model',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldFlag=process.env.VECTA_TYRE_PHOTO_AI,oldFetch=global.fetch,oldToken=process.env.AI_GATEWAY_API_KEY;
 let calls=0;global.fetch=async()=>{calls++;throw Error('not expected');};process.env.AI_GATEWAY_API_KEY='test-only';
 try{
  process.env.VERCEL_ENV='production';delete process.env.VECTA_TYRE_PHOTO_AI;
  let res=response();await handler({method:'POST',headers:{},body:{image}},res);assert.equal(res.code,503);
  process.env.VERCEL_ENV='preview';
  res=response();await handler({method:'POST',headers:{'sec-fetch-site':'cross-site'},body:{image}},res);assert.equal(res.code,403);
  res=response();await handler({method:'POST',headers:{},body:{image:'https://untrusted.example/image'}},res);assert.equal(res.code,400);
  assert.equal(calls,0);
 }finally{global.fetch=oldFetch;for(const [key,value]of Object.entries({VERCEL_ENV:oldEnv,VECTA_TYRE_PHOTO_AI:oldFlag,AI_GATEWAY_API_KEY:oldToken})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('vision request is bounded and returns validated readings only',async()=>{
 const oldEnv=process.env.VERCEL_ENV,oldToken=process.env.AI_GATEWAY_API_KEY,oldFetch=global.fetch;
 process.env.VERCEL_ENV='preview';process.env.AI_GATEWAY_API_KEY='test-only';
 try{
  global.fetch=async(url,options)=>{
   assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
   const body=JSON.parse(options.body);assert.equal(body.max_tokens,500);assert.equal(body.messages[1].content[1].image_url.url,image);
   assert.ok(options.signal);
   return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({readings:[{size:'205/65R16C',loadIndex:'107/105',speedRating:'T'},{size:'bogus'}]})}}]})};
  };
  const res=response();await handler({method:'POST',headers:{},body:{image}},res);
  assert.equal(res.code,200);assert.equal(res.body.readings.length,1);assert.equal(res.body.readings[0].label,'205/65R16C 107/105T');
 }finally{global.fetch=oldFetch;if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;if(oldToken===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=oldToken;}
});
