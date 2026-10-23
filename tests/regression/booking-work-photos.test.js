import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {bookingPhotos,MAX_PHOTO_BYTES} from '../../lib/booking-photos.js';
import handler from '../../api/website-booking.js';

const image='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,2,255,217]).toString('base64');
const id='12345678-1234-4123-8123-123456789abc';
const payload={request_id:id,customer_name:'Photo test',email:'test@example.invalid',phone:'00000000000',registration:'AB12CDE',vehicle:'Test vehicle',job_types:['Other'],work_required:'Inspect damage',appointment_date:'2026-12-01',work_photos:[{image}]};
const reply=(data,status=200)=>({status,ok:status>=200&&status<300,json:async()=>data,text:async()=>JSON.stringify(data)});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};}

test('photos are optional, bounded, JPEG only and exclude filenames/metadata',()=>{
 assert.deepEqual(bookingPhotos(undefined),[]);
 assert.deepEqual(bookingPhotos([{image,name:'private location.jpg',extra:'ignored'}]),[{image}]);
 for(const invalid of [null,{},[null],Array(4).fill({image}),[{image:'data:image/svg+xml;base64,PHN2Zz4='}],[{image:'data:image/jpeg;base64,YWJjZA=='}],[{image:'data:image/jpeg;base64,'+Buffer.alloc(MAX_PHOTO_BYTES+1).toString('base64')}]])assert.throws(()=>bookingPhotos(invalid),{code:'BOOKING_INPUT'});
});

test('optional photo UI retains previews across renders and escapes no arbitrary image URL',()=>{
 const context=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('public/js/vecta-work-photos.js','utf8'),context);
 const ui=context.window.VectaWorkPhotos,form={work_photos:[{image}]};
 assert.match(ui.html(form),/If you think it will help, upload a photo here/);
 assert.match(ui.html(form),/capture="environment"/);assert.match(ui.html(form),/data-work-remove="0"/);
 assert.match(ui.html(form,true),/Your photos/);assert.doesNotMatch(ui.html(form,true),/data-work-choose/);
 assert.match(ui.html(form),new RegExp(image.replace(/[+]/g,'\\+')));
 assert.equal(ui.html({},true),'');
});

test('booking photos use atomic insertion, survive retries and cannot be replaced with a reused request ID',async()=>{
 const oldFetch=globalThis.fetch,oldEnv={...process.env};let stored;
 Object.assign(process.env,{VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'photo-test',VERCEL_PROJECT_PRODUCTION_URL:'test.invalid',VITE_SUPABASE_URL:'https://photo-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-key'});
 globalThis.fetch=async(url,options={})=>{
  const path=new URL(url).pathname;
  if(path.endsWith('/rpc/insert_website_booking_with_photos')){
   const body=JSON.parse(options.body);assert.deepEqual(body.p_photos,[{image}]);
   if(stored)return reply([]);stored={...body.p_request,work_photo_count:body.p_photos.length};return reply([stored]);
  }
  if(path.endsWith('/website_booking_photos'))return reply([{photos:[{image}]}]);
  if(path.endsWith('/website_booking_requests'))return reply(options.method==='POST'?[]:(stored?[stored]:[]));
  if(path.endsWith('/workshop_push_subscriptions'))return reply([]);
  assert.fail('Unexpected database operation '+path);
 };
 try{
  const submit=async body=>{const res=response();await handler({method:'POST',body},res);return res;};
  assert.equal((await submit(payload)).code,201);assert.equal((await submit(payload)).code,200);
  const changed={...payload,work_photos:[{image:image.replace('4AAC','4AAD')}]};
  // A different valid JPEG payload under the same identity must conflict.
  changed.work_photos=[{image:'data:image/jpeg;base64,'+Buffer.from([255,216,255,224,0,3,255,217]).toString('base64')}];
  // Avoid the insert assertion above when testing a retry's changed content.
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>new URL(url).pathname.endsWith('/rpc/insert_website_booking_with_photos')?Promise.resolve(reply([])):originalFetch(url,options);
  assert.equal((await submit(changed)).code,409);assert.equal((await submit({...payload,work_photos:[]})).code,409);
  process.env.VECTA_MAIN_USER='manager';process.env.VECTA_MAIN_PASSWORD='test-password';
  const denied=response();await handler({method:'GET',query:{photos:id},headers:{host:'test.invalid'}},denied);assert.equal(denied.code,401);assert.match(denied.headers['Cache-Control'],/no-store/);
  const allowed=response();await handler({method:'GET',query:{photos:id},headers:{host:'test.invalid',authorization:'Basic '+Buffer.from('manager:test-password').toString('base64')}},allowed);assert.equal(allowed.code,200);assert.deepEqual(allowed.data.photos,[{image}]);
 }finally{globalThis.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
});
