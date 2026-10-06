import { databaseEnvironment, testProjectRef } from '../api/_database-environment.js';
import { vehicleResult } from './haynes-vehicle.js';

export async function relayLookup(registration) {
  const siteToken = process.env.HAYNES_RELAY_SITE_TOKEN;
  const env = siteToken ? {url:`https://${testProjectRef}.supabase.co`} : databaseEnvironment({requireService:true});
  if (!siteToken && (!env.preview || env.url !== `https://${testProjectRef}.supabase.co`)) throw Error('Scoped relay token required');
  const deadline = AbortSignal.timeout(27000);
  const rpc = async (action,payload) => {
    if (siteToken && !/^[a-f0-9]{64}$/.test(siteToken)) throw Error('Invalid scoped relay configuration');
    const res = await fetch(siteToken ? env.url + '/functions/v1/haynes-pc-relay' : env.url + '/rest/v1/rpc/haynes_relay', {
      method:'POST',redirect:'error',
      headers:{...(siteToken ? {} : {apikey:env.serviceKey}),Authorization:'Bearer '+(siteToken || env.serviceKey),'Content-Type':'application/json'},
      body:JSON.stringify(siteToken ? {action,...payload} : {p_action:action,p_payload:payload}),signal:deadline
    });
    if (!res.ok) throw Error('Relay unavailable');
    return res.json();
  };
  let data = await rpc('enqueue',{registration});
  while (data.status === 'PENDING') {
    const id = data.id;
    await new Promise(resolve => setTimeout(resolve,500));
    data = await rpc('poll',{id});
    data.id = id;
  }
  if (data.status === 'MATCHED') return {status:'MATCHED',vehicle:vehicleResult(data.vehicle,registration)};
  return {status:['NOT_PAIRED','OFFLINE','LOGIN_REQUIRED','VERIFICATION_REQUIRED','AMBIGUOUS','BUSY','DAILY_LIMIT'].includes(data.status) ? data.status : 'UNAVAILABLE'};
}
