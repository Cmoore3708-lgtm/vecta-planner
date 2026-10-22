// Confirmation data is separate from job saves: dragging or editing a card must
// never overwrite a garage confirmation or alter invoicing/completion state.
export function motBookingStatus(job,events,jobs){
 const reg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,''),time=value=>/^\d{2}:\d{2}/.exec(String(value||''))?.[0]||'';
 const mot=j=>String(Array.isArray(j.job_types)&&j.job_types.length?j.job_types.join('|'):j.job_type||'').split(/[,;|]/).some(type=>/^mot(?: test)?$/i.test(type.trim()));
 const appointment=j=>time(j.mot_time)||time(String(j.customer_note||'').match(/\[MOT_TIME:([^\]]+)\]/i)?.[1]);
 const history=(events||[]).filter(e=>e&&e.reference&&Number.isFinite(Date.parse(e.received_at))).sort((a,b)=>Date.parse(a.received_at)-Date.parse(b.received_at)||String(a.email_id).localeCompare(String(b.email_id)));
 const latest=new Map();
 for(const e of history){const old=latest.get(e.reference);latest.set(e.reference,{...e,registration:e.registration||old?.registration,date:e.date||old?.date});}
 const related=[...latest.values()].filter(e=>reg(e.registration)===reg(job.registration)&&e.date===job.booking_date).sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at));
 const event=related[0];if(!event)return {confirmed:false,review:false};
 const candidates=(jobs||[]).filter(j=>!j.archived&&j.card_type!=='quote'&&j.status!=='quote'&&mot(j)&&reg(j.registration)===reg(job.registration)&&j.booking_date===job.booking_date&&appointment(j)===appointment(job));
 const confirmed=event.state==='confirmed'&&mot(job)&&!!appointment(job)&&event.time===appointment(job)&&candidates.length===1&&candidates[0].id===job.id;
 return {confirmed,review:!confirmed,reference:event.reference,time:event.time};
}

if(typeof window!=='undefined'){
 const key='vecta:mot-confirmations:v1';let events=[],firstRefresh=true;
 try{events=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(events))events=[]}catch{}
 window.VectaMotBookings={status:job=>motBookingStatus(job,events,window.vectaMotBookingState?.().jobs||[])};
 async function refresh(){
  if(document.hidden||!navigator.onLine)return;
  try{const response=await fetch('/api/mot-confirmations',{credentials:'same-origin',cache:'no-store'});if(!response.ok)return;const data=await response.json();if(!Array.isArray(data.events))return;const changed=JSON.stringify(events)!==JSON.stringify(data.events);events=data.events;try{localStorage.setItem(key,JSON.stringify(events))}catch{}if(changed||firstRefresh){firstRefresh=false;window.vectaMotBookingState?.().render();}}catch{}
 }
 // This module runs in both generated dashboard entries and never writes jobs.
 refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
}
