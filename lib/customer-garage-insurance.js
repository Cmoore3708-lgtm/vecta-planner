import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {databaseEnvironment} from '../api/_database-environment.js';
import {garageFail as fail,garageWrite as write} from './customer-garage-auth.js';

export const INSURANCE_BUCKET='customer-garage-insurance';
export const MAX_INSURANCE_BYTES=1800000;
const storageClient=()=>{const {url,key}=databaseEnvironment({requireService:true});return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(INSURANCE_BUCKET);};
const pathFor=(account,vehicle,id)=>account.id+'/'+vehicle.id+'/'+id+'.jpg';
export const insuranceMatch=(account,vehicle)=>({id:'eq.'+vehicle.id,account_id:'eq.'+account.id,insurance_document_id:vehicle.insurance_document_id?'eq.'+vehicle.insurance_document_id:'is.null'});
const unavailable=()=>fail('Your insurance photo could not be saved or opened. Please try again.',503);
const changed=()=>fail('This car changed on another device. Reopen Manage car and try again.',409);

export async function insurancePhotoBytes(image){
 if(typeof image!=='string'||image.length>2400023||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))throw fail('Choose a photo of your insurance document.');
 const encoded=image.slice(23),bytes=Buffer.from(encoded,'base64');
 if(bytes.length>MAX_INSURANCE_BYTES||bytes.toString('base64')!==encoded)throw fail('This photo is too large. Please choose a smaller photo.');
 try{
  const {default:sharp}=await import('sharp');
  // Re-encode pixels only: strip EXIF/location and reject malformed or huge images.
  const result=await sharp(bytes,{limitInputPixels:25000000}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  if(result.length>MAX_INSURANCE_BYTES)throw Error('large');
  return result;
 }catch{throw fail('We could not read this photo. Try a JPEG, PNG or a new camera photo.');}
}
export async function removeGarageInsurance(account,vehicle,{storage}={}){
 const ids=[...new Set([vehicle.insurance_document_id,...(vehicle.insurance_cleanup||[])].filter(Boolean))];
 if(!ids.length)return;
 const result=await (storage||storageClient()).remove(ids.map(id=>pathFor(account,vehicle,id)));
 if(result.error)throw fail('The insurance photo could not be removed. Please try again.',503);
}
export async function garageInsuranceAction(db,account,vehicle,body,{now=Date.now(),storage}={}){
 if(body.action==='garage-insurance-upload'){
  const bytes=await insurancePhotoBytes(body.image),id=randomUUID(),path=pathFor(account,vehicle,id),store=storage||storageClient();
  const uploaded=await store.upload(path,bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
  if(uploaded.error)throw unavailable();
  const cleanup=[...new Set([...(vehicle.insurance_cleanup||[]),vehicle.insurance_document_id].filter(Boolean))];
  let saved;
  try{saved=await write(db,'customer_garage_vehicles',{insurance_document_id:id,insurance_uploaded_at:new Date(now).toISOString(),insurance_cleanup:cleanup},{method:'PATCH',params:insuranceMatch(account,vehicle)});}
  catch(error){await store.remove([path]).catch(()=>{});throw error;}
  if(!saved?.length){await store.remove([path]);throw changed();}
  if(cleanup.length){
   // Keep failed cleanup IDs for the next replacement/removal; never lose the reference.
   const removed=await store.remove(cleanup.map(old=>pathFor(account,vehicle,old))).catch(()=>({error:true}));
   if(!removed.error)await write(db,'customer_garage_vehicles',{insurance_cleanup:[]},{method:'PATCH',params:insuranceMatch(account,{...vehicle,insurance_document_id:id})}).catch(()=>{});
  }
  return {ok:true,uploaded_at:new Date(now).toISOString()};
 }
 if(!vehicle.insurance_document_id)throw fail('There is no insurance photo for this car yet.',404);
 if(body.action==='garage-insurance-view'){
  const {data,error}=await (storage||storageClient()).download(pathFor(account,vehicle,vehicle.insurance_document_id));
  if(error||!data||data.size>MAX_INSURANCE_BYTES)throw unavailable();
  // Authenticated, no-store API response. No public or shareable document URL.
  return {content_type:'image/jpeg',base64:Buffer.from(await data.arrayBuffer()).toString('base64')};
 }
 if(body.action==='garage-insurance-remove'){
  await removeGarageInsurance(account,vehicle,{storage});
  const saved=await write(db,'customer_garage_vehicles',{insurance_document_id:null,insurance_uploaded_at:null,insurance_cleanup:[]},{method:'PATCH',params:insuranceMatch(account,vehicle)});
  if(!saved?.length)throw changed();
  return {ok:true};
 }
 throw fail('Choose an insurance photo action.');
}
