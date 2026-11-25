import {uuid} from './job-progress.js';

const table='mechanic_message_receipts';
const failure=message=>Object.assign(Error(message),{status:409});

export async function receiptStates(db,ids){
  const unique=[...new Set(ids.filter(id=>typeof id==='string'&&uuid.test(id)))];
  const batches=[];
  for(let i=0;i<unique.length;i+=80){
    batches.push(db(table+'?'+new URLSearchParams({select:'message_id,action,recorded_at',message_id:'in.('+unique.slice(i,i+80).join(',')+')'})));
  }
  return (await Promise.all(batches)).flat();
}

export function dealtHistory(db,job){
  return db(table+'?'+new URLSearchParams({job_id:'eq.'+job.id,action:'eq.done',select:'message_id,message,recorded_at',order:'recorded_at.desc'}));
}

export async function recordReceipt(db,job,body){
  const id=body.message_id,action=body.choice;
  if(typeof id!=='string'||!uuid.test(id)||!['done','snooze'].includes(action))throw failure('Choose a current mechanic message.');
  let message;
  const note=String(job.customer_note||'');
  if(note.includes('[[VECTA_INTERNAL_NOTE_UPDATE:'+id+']]')){
    const encoded=note.match(/\[\[VECTA_INTERNAL_NOTES:([^\]]*)\]\]/)?.[1];
    message=encoded?decodeURIComponent(encoded):'Workshop notes cleared.';
  }else{
    const rows=await db('additional_work_approvals?'+new URLSearchParams({id:'eq.'+id,job_id:'eq.'+job.id,progress_from_mechanic:'eq.true',select:'progress_message'}));
    if(!rows.length)throw failure('This message has changed. Refresh the job card.');
    message=rows[0].progress_message||'Workshop finding';
  }
  const recorded_at=new Date().toISOString();
  await db(table+'?on_conflict=message_id,action',{method:'POST',headers:{Prefer:'resolution='+(action==='done'?'ignore':'merge')+'-duplicates,return=representation'},body:JSON.stringify({job_id:job.id,message_id:id,action,message,recorded_at})});
  return {receipts:await receiptStates(db,[id])};
}
