import {databaseEnvironment} from '../api/_database-environment.js';

// Only public vehicle characteristics are returned. Never expose customers,
// workshop notes, stored MOT history or any service-role credentials.
export async function cachedVehicleLookup(registration,{request=fetch,timeoutMs=1800}={}){
 try{
  const {url,key}=databaseEnvironment({requireService:true});
  const query=new URLSearchParams({select:'registration,make,model,vehicle,fuel_type,engine_size,colour,updated_at',registration:'eq.'+registration,order:'updated_at.desc',limit:'1'});
  const response=await request(url+'/rest/v1/vehicles?'+query.toString(),{
   headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
   signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)return null;
  const rows=await response.json();
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row)return null;
  const make=String(row.make||'').trim(),model=String(row.model||'').trim();
  const vehicle=String(row.vehicle||[make,model].filter(Boolean).join(' ')).trim();
  if(!vehicle)return null;
  return {registration,make,model,vehicle,fuelType:row.fuel_type||'',engineSize:row.engine_size||'',primaryColour:row.colour||'',lookupSource:'saved_vehicle',savedAt:row.updated_at||null,lookupPartial:true};
 }catch{return null;}
}
