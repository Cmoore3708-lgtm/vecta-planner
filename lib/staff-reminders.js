const DAY=86400000;
export const normalizeRegistration=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
const dateOnly=v=>String(v||'').slice(0,10);
const daysUntil=(due,today)=>Math.round((Date.parse(dateOnly(due)+'T12:00:00Z')-Date.parse(dateOnly(today)+'T12:00:00Z'))/DAY);
const field=(o,names)=>names.map(n=>o?.[n]).find(Boolean)||'';
export function staffDueItems(vehicle,today){
  if(!vehicle||vehicle.archived_at||String(vehicle.status||'Active').toLowerCase()==='archived')return [];
  if(!/staff/i.test(String(vehicle.fleetGroup||vehicle.group||'')))return [];
  const reg=normalizeRegistration(vehicle.registration);
  if(!reg)return [];
  const items=[];
  const mot=field(vehicle,['motExpiryDate','motDueDate','mot_due','motDue']);
  const service=field(vehicle,['nextServiceDue','serviceDueDate','service_due','next_service_due']);
  for(const [kind,due] of [['MOT',mot],['Service',service]]){
    if(!due)continue;
    const days=daysUntil(due,today);
    if(days>=0&&days<=30)items.push({kind,due:dateOnly(due),days});
  }
  return items;
}
export function isBooked(registration,kind,jobs,today){
  const reg=normalizeRegistration(registration);
  return (jobs||[]).some(j=>normalizeRegistration(j.registration)===reg
    && !j.archived
    && !/completed|cancelled|canceled|deleted|ready.?to.?invoice/i.test(String(j.status||''))
    && dateOnly(j.booking_date)>=dateOnly(today)
    && (kind==='MOT'?/\bmot\b/i.test(String(j.job_type||j.work_required||'')):/service/i.test(String(j.job_type||j.work_required||''))));
}
export function buildStaffReminderQueue(vehicles,jobs,sends,today){
  const sent=new Set((sends||[]).filter(s=>s.status==='sent').map(s=>[normalizeRegistration(s.registration),s.kind,dateOnly(s.due_date),s.stage].join('|')));
  const queue=[];
  for(const vehicle of vehicles||[]){
    for(const item of staffDueItems(vehicle,today)){
      if(isBooked(vehicle.registration,item.kind,jobs,today))continue;
      const stage=item.days<=14?'14-day':'30-day';
      const key=[normalizeRegistration(vehicle.registration),item.kind,item.due,stage].join('|');
      if(sent.has(key))continue;
      queue.push({registration:normalizeRegistration(vehicle.registration),name:String(vehicle.contactName||vehicle.customerName||'').trim(),email:String(vehicle.contactEmail||vehicle.email||'').trim(),...item,stage,canSend:validEmail(vehicle.contactEmail||vehicle.email)});
    }
  }
  return queue.sort((a,b)=>a.days-b.days||a.registration.localeCompare(b.registration));
}
export function reminderContent(item,bookingUrl='https://www.vectamotors.co.uk/booking'){
  const hello=item.name?`Hi ${item.name},`:'Hi,';
  const due=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}).format(new Date(item.due+'T12:00:00Z'));
  const subject=`${item.registration} – ${item.kind} reminder`;
  const text=`${hello}\n\nJust a reminder that your ${item.kind} for ${item.registration} is due on ${due}.\n\nYou can book your vehicle into VECTA here: ${bookingUrl}\n\nKind regards,\n\nChris.\n07721722622\n\nVECTA\nVectaMotors.co.uk`;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=esc(text).replace(/\n/g,'<br>').replace(esc(bookingUrl),`<a href="${bookingUrl}"><strong>Book online</strong></a>`).replace('VECTA<br>','<strong style="color:#c8102e;font-size:24px;">VECTA</strong><br>');
  return {subject,text,html};
}
