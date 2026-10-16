import { databaseEnvironment } from '../api/_database-environment.js';
import { imageUrl, normaliseReg, validReg, vehicleResult } from './haynes-vehicle.js';

// Successful website and workshop lookups fill the same durable image store.
// Do not overwrite an existing choice or copy technical/private vehicle fields.
export async function saveVehicleArtwork(vehicle, {environment=databaseEnvironment, fetcher=fetch}={}) {
  const registration=normaliseReg(vehicle?.registration), url=imageUrl(vehicle?.imageUrl);
  if(!validReg(registration)||!url||!vehicle?.make||!vehicle?.model)return false;
  try {
    const env=environment({requireService:true});
    const response=await fetcher(env.url+'/rest/v1/workshop_settings?on_conflict=id',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),
      headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify({id:'vehicle_artwork:'+registration,value:{registration,make:String(vehicle.make).slice(0,100),model:String(vehicle.model).slice(0,180),imageUrl:url},updated_at:new Date().toISOString()})
    });
    if(!response.ok)throw Error('Artwork save failed');
    return true;
  } catch {
    console.warn('Successful Haynes lookup could not populate shared vehicle artwork.');
    return false;
  }
}

// Vehicle identity does not expire with service schedules. No VIN/contact data.
export async function readVehicleIdentity(registration,{environment=databaseEnvironment,fetcher=fetch}={}){
 const reg=normaliseReg(registration);if(!validReg(reg))return null;
 try{const env=environment({requireService:true}),response=await fetcher(env.url+'/rest/v1/workshop_settings?id=eq.vehicle_identity:'+reg+'&select=value',{
  headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey},signal:AbortSignal.timeout(3000)});
 if(!response.ok)return null;const rows=await response.json();return vehicleResult(rows[0]?.value,reg);}catch{return null;}
}
export async function saveVehicleIdentity(vehicle,{environment=databaseEnvironment,fetcher=fetch}={}){
 try{const registration=normaliseReg(vehicle?.registration),clean=vehicleResult(vehicle,registration);if(!validReg(registration))return false;
 const env=environment({requireService:true}),response=await fetcher(env.url+'/rest/v1/workshop_settings?on_conflict=id',{
  method:'POST',headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},signal:AbortSignal.timeout(3000),
  body:JSON.stringify({id:'vehicle_identity:'+registration,value:clean,updated_at:new Date().toISOString()})});return response.ok;}catch{return false;}
}

export async function saveVehicleColour(data,{environment=databaseEnvironment,fetcher=fetch}={}){
 const registration=normaliseReg(data?.registration),colour=String(data?.primaryColour||'').trim();
 if(!validReg(registration)||!data?.make||! /^(BLACK|WHITE|SILVER|GREY|GRAY|BLUE|RED|GREEN|YELLOW|ORANGE|BROWN|BEIGE|GOLD|BRONZE|PURPLE|PINK|MAROON|CREAM|TURQUOISE)$/i.test(colour))return false;
 try{const env=environment({requireService:true}),response=await fetcher(env.url+'/rest/v1/workshop_settings?on_conflict=id',{
  method:'POST',headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},signal:AbortSignal.timeout(3000),
  body:JSON.stringify({id:'vehicle_colour:'+registration,value:{registration,make:String(data.make).slice(0,100),colour},updated_at:new Date().toISOString()})});return response.ok;}catch{return false;}
}
