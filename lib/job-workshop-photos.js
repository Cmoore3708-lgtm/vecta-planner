import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {databaseEnvironment} from '../api/_database-environment.js';
import {uuid} from './job-progress.js';

export const PHOTO_BUCKET='job-workshop-photos';
export const MAX_JOB_PHOTOS=12;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export const photoBinding=job=>createHash('sha256').update(JSON.stringify([job.id,String(job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,''),String(job.customer_email||'').trim().toLowerCase()])).digest('hex');
const client=()=>{const {url,key}=databaseEnvironment({requireService:true});return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});};
async function db(path,method='GET',body){
 const {url,key}=databaseEnvironment({requireService:true});
 const r=await fetch(url+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw fail(r.status===409?'Photos changed on another device. Please try again.':'Photos are temporarily unavailable. Please try again.',r.status===409?409:503);
 return r.status===204?[]:r.json();
}
const query=values=>'job_workshop_photos?'+new URLSearchParams(values);
export function photoCaption(value){if(value===undefined)return '';if(typeof value!=='string'||value.length>500)throw fail('Keep the caption to 500 characters.');return value.trim();}
export async function photoBytes(image){
 if(typeof image!=='string'||image.length>1066700||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw fail('Choose a valid photo and try again.');
 const encoded=image.slice(23),bytes=Buffer.from(encoded,'base64');
 if(bytes.length>800000||bytes.toString('base64')!==encoded)throw fail('This photo is too large. Please choose a smaller photo.');
 try{const {default:sharp}=await import('sharp');return await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:82}).toBuffer();}
 catch{throw fail('We could not open this photo. Try a JPEG, PNG or a new camera photo.');}
}
async function signedPhotos(rows){
 if(!rows.length)return [];
 const {data,error}=await client().storage.from(PHOTO_BUCKET).createSignedUrls(rows.map(row=>row.id+'.jpg'),300);
 if(error||!data||data.some(item=>item.error||!item.signedUrl))throw fail('Photos are temporarily unavailable. Please refresh to try again.',503);
 return rows.map((row,i)=>({id:row.id,url:data[i].signedUrl,caption:row.caption,created_at:row.created_at}));
}
export async function customerPhotos(jobs){
 const valid=jobs.filter(job=>uuid.test(job.id||''));if(!valid.length)return {workshop_photos:[]};
 try{
  const rows=await db(query({job_id:'in.('+valid.map(job=>job.id).join(',')+')',ready:'eq.true',deleted_at:'is.null',select:'id,job_id,binding,caption,created_at',order:'created_at.asc',limit:'1200'}));
  const bindings=new Map(valid.map(job=>[job.id,photoBinding(job)]));
  return {workshop_photos:await signedPhotos(rows.filter(row=>bindings.has(row.job_id)&&bindings.get(row.job_id)===row.binding))};
 }catch{return {workshop_photos:[],workshop_photos_error:'Workshop photos could not be loaded. Please refresh to try again.'};}
}
export async function workshopPhotoAction(action,job,body,{canPublish=true}={}){
 if(action==='photos-list'){
  const rows=await db(query({job_id:'eq.'+job.id,or:'(ready.eq.true,review_uploaded.eq.true)',deleted_at:'is.null',select:'id,caption,created_at,review_id,ready',order:'created_at.asc'}));
  const signed=await signedPhotos(rows);
  return {photos:signed.map((photo,i)=>({...photo,private_finding:rows[i].ready===false,review_id:rows[i].review_id||null}))};
 }
 if(!uuid.test(body.photo_id||''))throw fail('Choose a valid photo.');
 const match={id:'eq.'+body.photo_id,job_id:'eq.'+job.id};
 const existing=(await db(query({...match,select:'*',limit:'1'})))?.[0];
 if(action==='photos-upload'){
  const caption=photoCaption(body.caption),binding=photoBinding(job),review=body.review_id||null;
  if(!review&&!canPublish)throw fail('Send the photo to Workshop Pro for pricing.',403);
  if(review && (typeof review!=='string'||!uuid.test(review)))throw fail('Choose a valid finding.');

  if(existing){
   if(existing.deleted_at)throw fail('This photo has been removed. Choose it again to add a new copy.',409);
   if(existing.binding!==binding)throw fail('This job has changed. Reopen it before adding photos.',409);
   if((existing.review_id||null)!==review)throw fail('This photo belongs to another finding.',409);
   if(existing.ready||existing.review_uploaded)return {ok:true}; // Safe retry after an uncertain upload response.
  }
  const bytes=await photoBytes(body.image);
  const contentHash=createHash('sha256').update(bytes).digest('hex');
  if(existing&&existing.content_hash!==contentHash)throw fail('Choose this photo again to upload a new copy.',409);
  const storage=client().storage.from(PHOTO_BUCKET);
  if(!existing){
   // Release only abandoned reservations, older than the maximum request time.
   const stale=await db(query({job_id:'eq.'+job.id,ready:'eq.false',review_uploaded:'eq.false',deleted_at:'is.null',created_at:'lt.'+new Date(Date.now()-15*60000).toISOString()}),'PATCH',{deleted_at:new Date().toISOString()});
   if(stale.length)await storage.remove(stale.map(row=>row.id+'.jpg')).catch(()=>{});
   const used=await db(query({job_id:'eq.'+job.id,deleted_at:'is.null',select:'slot'}));
   const slot=Array.from({length:MAX_JOB_PHOTOS},(_,i)=>i+1).find(i=>!used.some(row=>row.slot===i));
   if(!slot)throw fail('This job already has 12 photos. Remove a photo before adding another.',409);
   // A unique active slot prevents concurrent uploads exceeding the job limit.
   await db('job_workshop_photos','POST',{id:body.photo_id,job_id:job.id,slot,binding,content_hash:contentHash,caption,ready:false,review_id:review});
  }
  // A retry can resume a reserved upload, but can never replace it with different bytes.
  const result=await storage.upload(body.photo_id+'.jpg',bytes,{contentType:'image/jpeg',cacheControl:'60',upsert:true});
  if(result.error)throw fail('The photo was not uploaded. Please try again.',503);
  const updated=await db(query({...match,deleted_at:'is.null'}),'PATCH',{ready:!review,review_uploaded:!!review,caption});
  if(updated.length!==1)throw fail('This photo changed on another device. Refresh the photos.',409);
  return {ok:true};
 }
 if(!existing||existing.deleted_at||(!existing.ready&&!existing.review_uploaded))throw fail('This photo is no longer available. Refresh the photos.',404);
 if(!canPublish&&existing.ready)throw fail('Edit customer photos in Workshop Pro.',403);
 if(existing.review_id && existing.review_uploaded){
  const [submitted]=await db('additional_work_approvals?'+new URLSearchParams({id:'eq.'+existing.review_id,job_id:'eq.'+job.id,progress_review_state:'eq.draft',select:'id',limit:'1'}));
  if(submitted)throw fail('This photo is attached to a finding awaiting a price.',409);
 }
 if(action==='photos-caption'){
  await db(query({...match,deleted_at:'is.null'}),'PATCH',{caption:photoCaption(body.caption)});return {ok:true};
 }
 if(action==='photos-delete'){
  // Hide immediately; already-issued image links expire after five minutes.
  await db(query(match),'PATCH',{deleted_at:new Date().toISOString(),ready:false,review_uploaded:false});
  await client().storage.from(PHOTO_BUCKET).remove([body.photo_id+'.jpg']).catch(()=>{});
  return {ok:true};
 }
 throw fail('Invalid photo action.');
}
