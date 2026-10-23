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
 const confirmed=event.state==='confirmed'&&event.allocation_status==='allocated'&&event.job_id===job.id&&reg(event.registration)===reg(job.registration)&&event.date===job.booking_date&&String(job.technician||'').toLowerCase()==='chris'&&time(job.drop_time)===event.time&&mot(job)&&!!appointment(job)&&event.time===appointment(job)&&candidates.length===1&&candidates[0].id===job.id;
 return {confirmed,review:!confirmed,email_id:event.email_id,reference:event.reference,time:event.time,date:event.date,reason:event.allocation_status};
}

if(typeof window!=='undefined'){
 const key='vecta:mot-confirmations:v1';let events=[],firstRefresh=true;
 try{events=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(events))events=[]}catch{}
 window.VectaMotBookings={status:job=>motBookingStatus(job,events,window.vectaMotBookingState?.().jobs||[])};
 async function refresh(){
  if(document.hidden||!navigator.onLine)return;
  try{const response=await fetch('/api/mot-confirmations',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const data=await response.json();if(!Array.isArray(data.events))return;const changed=JSON.stringify(events)!==JSON.stringify(data.events);events=data.events;try{localStorage.setItem(key,JSON.stringify(events))}catch{}if(changed||firstRefresh){firstRefresh=false;window.vectaMotBookingState?.().render();}}catch{}
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
 // This module runs in both generated dashboard entries and never writes jobs.
 refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
}
