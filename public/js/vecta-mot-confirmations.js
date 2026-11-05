// Confirmation data is separate from job saves: dragging or editing a card must
// never overwrite a garage confirmation or alter invoicing/completion state.
export function motBookingStatus(job,events,jobs){
 const reg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,''),time=value=>/^\d{2}:\d{2}/.exec(String(value||''))?.[0]||'';
 const mot=j=>String(Array.isArray(j.job_types)&&j.job_types.length?j.job_types.join('|'):j.job_type||'').split(/[,;|]/).some(type=>/^mot(?: test)?$/i.test(type.trim()));
 const appointment=j=>time(String(j.customer_note||'').match(/\[MOT_TIME:([^\]]+)\]/i)?.[1])||time(j.mot_time);
 const history=(events||[]).filter(e=>e&&e.reference&&Number.isFinite(Date.parse(e.received_at))).sort((a,b)=>Date.parse(a.received_at)-Date.parse(b.received_at)||String(a.email_id).localeCompare(String(b.email_id)));
 const latest=new Map();
 for(const e of history){const old=latest.get(e.reference);latest.set(e.reference,{...e,registration:e.registration||old?.registration,date:e.date||old?.date});}
 const related=[...latest.values()].filter(e=>e.job_id===job.id||(reg(e.registration)===reg(job.registration)&&(e.date===job.booking_date||(e.state==='review'&&/^unallocated$/i.test(job.technician||''))))).sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at));
 const event=related[0];if(!event)return {confirmed:false,review:false};
 const candidates=(jobs||[]).filter(j=>!j.archived&&j.card_type!=='quote'&&j.status!=='quote'&&mot(j)&&reg(j.registration)===reg(job.registration)&&j.booking_date===job.booking_date&&appointment(j)===appointment(job));
 const scheduled=event.confirmation_mode==='existing_appointment'?!/^unallocated$|^$/i.test(String(job.technician||'').trim()):(String(job.technician||'').toLowerCase()==='chris'&&time(job.drop_time)===event.time);
 const confirmed=event.state==='confirmed'&&event.allocation_status==='allocated'&&event.job_id===job.id&&reg(event.registration)===reg(job.registration)&&event.date===job.booking_date&&scheduled&&mot(job)&&!!appointment(job)&&event.time===appointment(job)&&candidates.length===1&&candidates[0].id===job.id;
 return {confirmed,review:!confirmed,email_id:event.email_id,reference:event.reference,time:event.time,date:event.date,reason:event.allocation_status};
}

export function earlierMotCandidates(jobs,events){
 const latest=new Map();
 for(const event of events||[]){
  if(!event?.reference||!Number.isFinite(Date.parse(event.received_at)))continue;
  const previous=latest.get(event.reference);
  if(!previous||Date.parse(event.received_at)>=Date.parse(previous.received_at))latest.set(event.reference,event);
 }
 return (jobs||[]).filter(job=>job.status==='booked'&&!job.archived&&(job.card_type||'job')==='job'&&
  String(job.job_type||'').split(/[,;|]/).some(type=>/^mot(?: test)?$/i.test(type.trim()))&&
  [...latest.values()].some(event=>['no_unallocated_mot','multiple_unallocated_mots'].includes(event.allocation_status)&&
   String(job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===event.registration&&job.booking_date===event.date&&
   (String(job.customer_note||'').match(/\[\[MOT_TIME:([^\]]+)\]\]/i)?.[1]||
    (String(job.technician||'').trim().toLowerCase()==='chris'?String(job.drop_time||'').slice(0,5):''))===event.time));
}

if(typeof window!=='undefined'){
 const key='vecta:mot-confirmations:v1',attempts=new Map(),inFlight=new Map();let events=[],firstRefresh=true,refreshing=null;
 try{events=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(events))events=[]}catch{}
 function remember(){try{localStorage.setItem(key,JSON.stringify(events))}catch{}}
 async function recheck(jobId){
  if(!navigator.onLine)return;
  if(inFlight.has(jobId))return inFlight.get(jobId);
  const pending=(async()=>{
   try{
    const response=await fetch('/api/mot-confirmations',{method:'PUT',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:jobId})});
    if(!response.ok)return;
    const data=await response.json();
    if(data.matched&&data.event){
     events=events.filter(event=>event.email_id!==data.event.email_id).concat(data.event);remember();
     const state=window.vectaMotBookingState?.();state?.refresh?.();state?.render();
    }
   }catch{}finally{inFlight.delete(jobId)}
  })();
  inFlight.set(jobId,pending);return pending;
 }
 window.VectaMotBookings={status:job=>motBookingStatus(job,events,window.vectaMotBookingState?.().jobs||[]),recheck};
 async function refresh(){
  if(document.hidden||!navigator.onLine)return;
  if(refreshing)return refreshing;
  refreshing=(async()=>{
   try{
    const response=await fetch('/api/mot-confirmations',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;
    const data=await response.json();if(!Array.isArray(data.events))return;
    const changed=JSON.stringify(events)!==JSON.stringify(data.events);events=data.events;remember();
    if(changed||firstRefresh){firstRefresh=false;window.vectaMotBookingState?.().render();}
    // Also catch jobs created on another device or uploaded after offline use.
    // Only retained unmatched emails trigger a recheck; throttle unresolved ones.
    for(const job of earlierMotCandidates(window.vectaMotBookingState?.().jobs,events)){
     const fingerprint=JSON.stringify([job.id,job.updated_at,job.booking_date,job.customer_note,job.technician,events.map(e=>[e.email_id,e.allocation_status])]);
     if(Date.now()-(attempts.get(fingerprint)||0)<300000)continue;
     attempts.set(fingerprint,Date.now());if(attempts.size>500)attempts.delete(attempts.keys().next().value);
     await recheck(job.id);
    }
   }catch{}finally{refreshing=null}
  })();return refreshing;
 }
 document.addEventListener('click',function(e){
  const button=e.target.closest?.('[data-mot-confirmation]');if(!button)return;
  const record=events.find(item=>item.email_id===button.dataset.motConfirmation);if(!record)return;
  const dialog=document.createElement('dialog');dialog.style.cssText='max-width:680px;width:calc(100% - 40px);max-height:80vh;border:1px solid #ccc;border-radius:12px;padding:20px';
  const title=document.createElement('h3');title.textContent='Fault Finder MOT Centre';
  const summary=document.createElement('p');summary.textContent=[record.registration,record.date,record.time,'Ref '+record.reference].filter(Boolean).join(' · ');
  const body=document.createElement('pre');body.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit';body.textContent=record.email_text||'Booking confirmation received. Original email text is unavailable for this earlier confirmation.';
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>dialog.remove());dialog.append(title,summary,body,close);document.body.append(dialog);dialog.showModal();
 });
 // Both dashboard entries use the same authenticated, atomic server recheck.
 refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
}
