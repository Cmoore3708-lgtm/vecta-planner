import { createInterface } from 'node:readline/promises';
import { createServiceTaskRunner } from './service-task.mjs';
import { browserServiceLookup } from './service-browser.mjs';
import { openProfile, browserLookup } from './browser.mjs';
import { createLookupService } from './service.mjs';
import { vehicleResult } from '../../lib/haynes-vehicle.js';

const endpoint = 'https://brqsejjykrubxuofavuu.supabase.co/functions/v1/haynes-pc-relay';
const token = process.env.HAYNES_RELAY_TOKEN;
if (!/^[a-f0-9]{64}$/.test(token || '')) throw Error('Run windows-connect.cmd to pair this PC.');
const rpc = async (body, service = false) => {
  const res = await fetch(service ? endpoint.replace('haynes-pc-relay','haynes-service-relay') : endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if (res.status === 401) throw Error('PAIRING_REQUIRED');
  if (!res.ok) throw Error('CONNECTION_UNAVAILABLE');
  return res.json();
};
let firstRelayJob;
await rpc({action:'pull'}).then(data => {
  // A first pull may already claim a job: hold it for processing below.
  firstRelayJob = data;
});
const context = await openProfile({headless:false});
const lookup = createLookupService(browserLookup(context));
// Confirm build-specific schedules on this PC; never infer build date from registration.
const confirmedSchedules=new Map();
async function chooseConditions(choices,vehicle) {
  const key=vehicle.registration+'|'+vehicle.typeId, previous=confirmedSchedules.get(key);
  if(previous && choices.some(choice=>choice.value===previous.value && choice.label===previous.label))return previous.value;
  if(!process.stdin.isTTY)return '';
  console.log('\nHaynes needs a service schedule for '+vehicle.registration+'. Check the build date or DAM/RPO number:');
  choices.forEach((choice,index)=>console.log(String(index+1)+'. '+choice.label));
  const terminal=createInterface({input:process.stdin,output:process.stdout});
  try {
    const answer=await terminal.question('Enter the correct option number within 20 seconds (Enter cancels): ',{signal:AbortSignal.timeout(20000)});
    const selected=/^[1-9][0-9]*$/.test(answer.trim())?choices[Number(answer.trim())-1]:null;
    if(!selected)return '';
    confirmedSchedules.set(key,selected);
    return selected.value;
  } catch { return ''; }
  finally { terminal.close(); }
}
const serviceTasks = createServiceTaskRunner(browserServiceLookup(context,{chooseConditions}),body=>rpc(body,true),error=>console.log(error.status?'Haynes service status: '+error.status+' · '+error.reason:'Service connection unavailable. The booking worker continues.'));
let stopped = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal,() => { stopped = true; context.close().catch(() => {}); });
console.log('Connected to Haynes Test. Keep this window open. Press Ctrl+C to stop.');
try {
  while (!stopped) {
    try {
      // Poll service work before slow vehicle lookups so the queue cannot starve it.
      if (!serviceTasks.busy) {
        const task = await rpc({action:'pull'},true);
        if(task.status === 'JOB')serviceTasks.start(task);
      }
      const job = firstRelayJob || await rpc({action:'pull'});
      firstRelayJob = null;
      if (job.status === 'JOB') {
        let result;
        try { result = {status:'MATCHED',vehicle:vehicleResult(await lookup(job.registration),job.registration)}; }
        catch (error) {
          result = {status:['LOGIN_REQUIRED','VERIFICATION_REQUIRED','AMBIGUOUS','BUSY','DAILY_LIMIT'].includes(error.code) ? error.code : 'UNAVAILABLE'};
          console.log('Haynes lookup status: '+result.status+' · '+(error.stage||'LOOKUP')+' · '+(error.reason||error.code||'UNAVAILABLE')+' · '+(error.browserDetail||''));
        }
        await rpc({action:'complete',id:job.id,lease:job.lease,...result});
      }
    } catch (error) {
      if (error.message === 'PAIRING_REQUIRED') { console.log('Pairing expired or revoked. Run setup again.'); break; }
      console.log('Test connection unavailable. Retrying shortly.');
    }
    if (!stopped) await new Promise(resolve => setTimeout(resolve,5000));
  }
} finally { await context.close(); await serviceTasks.done; }
