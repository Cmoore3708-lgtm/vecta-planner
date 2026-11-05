import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import sharp from 'sharp';
import handler,{customerStatus,registrationStatus} from '../../lib/job-progress-handler.js';
import {workshopPhotoAction,customerPhotos,photoBinding,photoBytes,photoCaption} from '../../lib/job-workshop-photos.js';
import {issueProgressToken,progressSecret,requestTrackingPath} from '../../lib/job-progress.js';
const id='a1234567-1234-4234-8234-123456789012',photoId='b1234567-1234-4234-8234-123456789012';
const job={id,registration:'AB12 CDE',booking_date:'2026-11-05',status:'in_progress',customer_email:'customer@example.com'};
const now=Date.parse('2026-11-05T12:00:00Z');
function environment(){
 const env={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'planner',VERCEL_PROJECT_PRODUCTION_URL:'planner.example',VITE_SUPABASE_URL:'https://jywufozycuwuoshlulwl.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only',VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'password'};
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 return ()=>{for(const [k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;};
}
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
test('photo writes and staff lists require workshop login, including the shared route',async()=>{
 const restore=environment(),original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('Unexpected database access');};
 try{for(const action of ['photos-list','photos-upload','photos-caption','photos-delete']){
  const res=response();await handler({method:'POST',headers:{host:'planner.example','content-type':'application/json'},body:{action,job_id:id,photo_id:photoId}},res);assert.equal(res.code,401);
  const denied=response();await handler({method:'POST',headers:{host:'planner.example',origin:'https://other.example','content-type':'application/json'},body:{action,job_id:id}},denied);assert.equal(denied.code,403);
 }assert.equal(calls,0);}finally{global.fetch=original;restore();}
});
test('server validates image bytes, strips metadata and keeps captions as bounded text',async()=>{
 for(const invalid of ['<svg/>','data:image/jpeg;base64,YWJj','data:image/png;base64,YWJj','data:image/jpeg;base64,'+'a'.repeat(1066701)])await assert.rejects(photoBytes(invalid));
 const input=await sharp({create:{width:2200,height:1200,channels:3,background:'#aaa'}}).jpeg().withMetadata().toBuffer();
 const result=await photoBytes('data:image/jpeg;base64,'+input.toString('base64')),meta=await sharp(result).metadata();
 assert.equal(meta.width,1600);assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);
 assert.equal(photoCaption('  Worn tyre  '),'Worn tyre');assert.throws(()=>photoCaption('x'.repeat(501)));assert.throws(()=>photoCaption({}));
});
test('uploads retry without duplicate photos, reject replacement bytes, and recover after storage failure',async()=>{
 const restore=environment(),original=global.fetch;let row=null,uploads=0,failUpload=true;
 global.fetch=async(url,opts={})=>{
  const u=new URL(url),method=opts.method||'GET';
  if(u.pathname.includes('/storage/v1/object/')){uploads++;return failUpload?Response.json({error:'Unavailable',message:'Unavailable'},{status:503}):Response.json({Key:photoId+'.jpg'});}
  if(method==='GET')return Response.json(row?[row]:[]);
  if(method==='POST'){assert.equal(row,null);row=JSON.parse(opts.body);return Response.json([row]);}
  if(method==='PATCH'){if(u.searchParams.has('created_at'))return Response.json([]);Object.assign(row,JSON.parse(opts.body));return Response.json([row]);}
  throw Error('Unexpected request');
 };
 try{
  const jpg=await sharp({create:{width:30,height:30,channels:3,background:'#aaa'}}).jpeg().toBuffer(),body={photo_id:photoId,image:'data:image/jpeg;base64,'+jpg.toString('base64'),caption:'Worn tyre'};
  await assert.rejects(workshopPhotoAction('photos-upload',job,body),/not uploaded/);assert.equal(row.ready,false);assert.equal(row.slot,1);
  const other=await sharp({create:{width:30,height:30,channels:3,background:'#111'}}).jpeg().toBuffer();
  await assert.rejects(workshopPhotoAction('photos-upload',job,{...body,image:'data:image/jpeg;base64,'+other.toString('base64')}),/new copy/);
  failUpload=false;await workshopPhotoAction('photos-upload',job,body);assert.equal(row.ready,true);assert.equal(row.caption,'Worn tyre');
  const count=uploads;await workshopPhotoAction('photos-upload',job,body);assert.equal(uploads,count);
  row.deleted_at=new Date().toISOString();await assert.rejects(workshopPhotoAction('photos-upload',job,body),/removed/);
 }finally{global.fetch=original;restore();}
});
test('photo removal/caption updates cannot target a different job; full jobs cannot upload',async()=>{
 const restore=environment(),original=global.fetch;let writes=0;
 global.fetch=async(url,opts={})=>{const u=new URL(url);if((opts.method||'GET')!=='GET'){if(opts.method==='PATCH'&&u.searchParams.has('created_at'))return Response.json([]);writes++;}assert.equal(u.searchParams.get('job_id'),'eq.'+id);return Response.json(u.searchParams.has('id')?[]:Array.from({length:12},(_,i)=>({slot:i+1})));};
 try{
  await assert.rejects(workshopPhotoAction('photos-delete',job,{photo_id:photoId}),/no longer available/);
  await assert.rejects(workshopPhotoAction('photos-caption',job,{photo_id:photoId,caption:'Other job'}),/no longer available/);
  const jpg=await sharp({create:{width:10,height:10,channels:3,background:'#aaa'}}).jpeg().toBuffer();
  await assert.rejects(workshopPhotoAction('photos-upload',job,{photo_id:photoId,image:'data:image/jpeg;base64,'+jpg.toString('base64')}),/12 photos/);assert.equal(writes,0);
 }finally{global.fetch=original;restore();}
});
test('all customer tracking routes show only matching job photos; unavailable photos do not hide progress',async()=>{
 const restore=environment(),original=global.fetch;let unavailable=false;
 const request={id:'c1234567-1234-4234-8234-123456789012',job_id:id,registration:job.registration,email:job.customer_email,confirmed_date:job.booking_date,status:'booked'};
 global.fetch=async(url,opts={})=>{
  const u=new URL(url);
  if(u.pathname.includes('/storage/')){const body=JSON.parse(opts.body);assert.deepEqual(body.paths,[photoId+'.jpg']);assert.equal(body.expiresIn,300);return Response.json([{path:photoId+'.jpg',signedURL:'/object/sign/job-workshop-photos/'+photoId+'.jpg?token=test'}]);}
  if(u.pathname.endsWith('/jobs'))return Response.json([job]);
  if(u.pathname.endsWith('/website_booking_requests'))return Response.json([request]);
  if(u.pathname.endsWith('/job_workshop_photos')){if(unavailable)return Response.json({},{status:503});return Response.json([{id:photoId,job_id:id,binding:photoBinding(job),caption:'Inner edge worn',created_at:'2026-11-05T11:00:00Z'},{id:'wrong',job_id:id,binding:photoBinding({...job,customer_email:'different@example.com'})},{id:'other',job_id:request.id,binding:photoBinding(job)}]);}
  return Response.json([]);
 };
 try{
  const token=issueProgressToken(job,progressSecret(),now),receipt=requestTrackingPath(request,now).split('#')[1];
  for(const data of [await customerStatus(token,now),await customerStatus(receipt,now),await registrationStatus(job.registration,now)]){
   assert.equal(data.workshop_photos.length,1);assert.equal(data.workshop_photos[0].caption,'Inner edge worn');assert.doesNotMatch(JSON.stringify(data),/customer@example|binding|content_hash|service-role|job_id/);
  }
  unavailable=true;const data=await customerStatus(token,now);assert.equal(data.stage,'underway');assert.deepEqual(data.workshop_photos,[]);assert.match(data.workshop_photos_error,/could not be loaded/);
 }finally{global.fetch=original;restore();}
});
test('customer gallery refreshes captions/removals safely and clears photos on lookup failure',async()=>{
 const {document}=parseHTML(fs.readFileSync(new URL('../../public/track.html',import.meta.url),'utf8'));document.hidden=false;
 const url='https://jywufozycuwuoshlulwl.supabase.co/storage/v1/object/sign/job-workshop-photos/'+photoId+'.jpg?token=test';
 let ok=true,data={registration:job.registration,stage:'underway',title:'In the workshop',workshop_photos:[{id:photoId,url,caption:'Worn tyre <script>alert(1)</script>'}]};
 const context={document,window:{addEventListener(){}},location:{hash:'#token'},Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok,status:ok?200:404,json:async()=>data})};
 vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-progress.js',import.meta.url),'utf8'),context);await new Promise(r=>setImmediate(r));
 const gallery=document.getElementById('workshopPhotoGrid'),img=gallery.querySelector('img');assert.ok(img);assert.equal(gallery.querySelector('script'),null);assert.match(gallery.textContent,/<script>/);
 data.workshop_photos[0]={id:photoId,url:url+'new',caption:'Replacement tyre fitted'};await document.getElementById('refresh').onclick();assert.equal(gallery.querySelector('img'),img);assert.equal(img.getAttribute('src'),url);assert.equal(gallery.querySelector('a').getAttribute('href'),url+'new');assert.match(gallery.textContent,/Replacement/);
 data.workshop_photos=[];await document.getElementById('refresh').onclick();assert.equal(gallery.children.length,0);assert.equal(document.getElementById('workshopPhotos').hidden,true);
 data.workshop_photos=[{id:photoId,url,caption:'New'}];await document.getElementById('refresh').onclick();ok=false;await document.getElementById('refresh').onclick();assert.equal(gallery.children.length,0);
});
