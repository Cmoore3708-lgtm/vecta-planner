import { openProfile, browserLookup } from './browser.mjs';
import { createLookupService } from './service.mjs';
import { vehicleResult } from '../../lib/haynes-vehicle.js';

const endpoint = 'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pc-relay';
const token = process.env.HAYNES_RELAY_TOKEN;
if (!/^[a-f0-9]{64}$/.test(token || '')) throw Error('Run windows-connect.cmd to pair this PC.');
const rpc = async body => {
  const res = await fetch(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if (res.status === 401) throw Error('PAIRING_REQUIRED');
  if (!res.ok) throw Error('CONNECTION_UNAVAILABLE');
  return res.json();
};
let firstRelayJob;
await rpc({action:'pull'}).then(data => {
  // A first pull may already claim a job: hold it for processing below.
  firstRelayJob = data;
});
const context = await openProfile();
const lookup = createLookupService(browserLookup(context));
let stopped = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => { stopped = true; context.close().catch(() => {}); });
console.log('Connected to Haynes Test. Keep this window open. Press Ctrl+C to stop.');
try {
  while (!stopped) {
    try {
      const job = firstRelayJob || await rpc({action:'pull'});
      firstRelayJob = null;
      if (job.status === 'JOB') {
        let result;
        try { result = {status:'MATCHED',vehicle:vehicleResult(await lookup(job.registration),job.registration)}; }
        catch (error) {
          result = {status:['LOGIN_REQUIRED','VERIFICATION_REQUIRED','AMBIGUOUS','BUSY','DAILY_LIMIT'].includes(error.code) ? error.code : 'UNAVAILABLE'};
          console.log('Haynes lookup status: '+result.status);
        }
        await rpc({action:'complete',id:job.id,lease:job.lease,...result});
      }
    } catch (error) {
      if (error.message === 'PAIRING_REQUIRED') { console.log('Pairing expired or revoked. Run setup again.'); break; }
      console.log('Test connection unavailable. Retrying shortly.');
    }
    if (!stopped) await new Promise(resolve => setTimeout(resolve,5000));
  }
} finally { await context.close(); }
