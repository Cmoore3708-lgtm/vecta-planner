import { databaseEnvironment } from '../api/_database-environment.js';
import { imageUrl, normaliseReg, validReg } from './haynes-vehicle.js';

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
