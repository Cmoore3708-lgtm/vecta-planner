import {gunzipSync} from 'node:zlib';
import {databaseEnvironment} from '../api/_database-environment.js';
const pending=new Map();
export const validAsset=asset=>/^\d{1,12}\.svgz?$/.test(asset);
const validSource=svg=>typeof svg==='string'&&svg.length<=2000000&&/<svg\b/.test(svg);
export async function storedImageSource(asset,{environment=databaseEnvironment,fetcher=fetch}={}){
 if(!validAsset(asset))return null;
 let env;try{env=environment({requireService:true});}catch{return null;}
 const response=await fetcher(env.url+'/rest/v1/workshop_settings?id=eq.vehicle_image_source:'+asset+'&select=value',{
  headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey},signal:AbortSignal.timeout(5000)});
 // A database outage is not evidence that the stored drawing is missing.
 // Keep the existing client image rather than downloading it from the supplier again.
 if(!response.ok)throw Error('Stored image unavailable');const rows=await response.json(),svg=rows[0]?.value?.svg;return validSource(svg)?svg:null;
}
export async function saveImageSource(asset,svg,{environment=databaseEnvironment,fetcher=fetch}={}){
 if(!validAsset(asset)||!validSource(svg))return false;
 try{const env=environment({requireService:true}),response=await fetcher(env.url+'/rest/v1/workshop_settings?on_conflict=id',{
  method:'POST',headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},signal:AbortSignal.timeout(5000),
  body:JSON.stringify({id:'vehicle_image_source:'+asset,value:{asset,svg},updated_at:new Date().toISOString()})});return response.ok;}catch{return false;}
}
export async function imageSource(asset,options={}){
 if(!validAsset(asset))throw Error('Invalid image');
 // Share only in-flight work. The database, rather than server memory or expiry,
 // owns the permanent drawing, and remains available after redeployments.
 const key=(options.scope||'default')+':'+asset;
 if(pending.has(key))return pending.get(key);
 const task=(async()=>{
  const saved=await storedImageSource(asset,options);if(saved)return saved;
  const response=await (options.fetcher||fetch)('https://www.haynespro-assets.com/workshop/images/'+asset,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok||Number(response.headers.get('content-length'))>2000000)throw Error('Image unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000)throw Error('Image too large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  let buffer=Buffer.concat(chunks);if(buffer[0]===0x1f&&buffer[1]===0x8b)buffer=gunzipSync(buffer,{maxOutputLength:2000000});
  const svg=buffer.toString('utf8').replace(/<i:aipgf\b[^>]*>[\s\S]*?<\/i:aipgf>/g,'');if(!validSource(svg))throw Error('Invalid image');
  await saveImageSource(asset,svg,options);return svg;
 })();pending.set(key,task);try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
}
