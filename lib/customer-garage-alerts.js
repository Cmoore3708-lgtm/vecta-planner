import {randomUUID} from 'node:crypto';
import {isTestProject} from '../api/_database-environment.js';
import {sendPushSubscription} from '../api/_push.js';
import {garageRead as read,garageWrite as write,garageHash} from './customer-garage-auth.js';
import {accountJobs,garageSnapshot,garageVehicleLookup,garageReg} from './customer-garage.js';
import {londonDay} from './job-progress.js';

export function garageReminderItems(vehicles,{now=Date.now()}={}){
 const today=londonDay(now),items=[];
 for(const vehicle of vehicles){
  if(!vehicle.reminders)continue;
  for(const [kind,label] of [['mot','MOT'],['tax','Vehicle tax'],['service','Annual service'],['insurance','Insurance']]){
   const due=vehicle[kind+'_due'];if(!due)continue;
   if(kind==='tax'&&/sorn/i.test(vehicle.vehicle_data?.tax_status||'')&&!vehicle.tax_manual)continue;
   const days=Math.round((Date.parse(due+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
   if(!Number.isFinite(days)||days>30||days< -30)continue;
   const bucket=days<=0?0:days<=1?1:days<=7?7:30;
   if(['mot','service'].includes(kind)&&vehicle.upcoming?.some(booking=>booking.date<=due&&new RegExp(kind,'i').test(booking.work)))continue;
   items.push({key:garageHash(vehicle.id+':'+kind+':'+due+':'+bucket),vehicle_id:vehicle.id,registration:vehicle.registration,label,due,days,bucket});
  }
 }
 return items;
}
export async function refreshGarageDueDates(db,{now=Date.now(),lookup=garageVehicleLookup}={}){
 if(isTestProject())return;
 const rows=await read(db,'customer_garage_vehicles',{refresh_after:'lte.'+new Date(now).toISOString(),select:'*',order:'refresh_after.asc',limit:3});
 await Promise.all(rows.map(async row=>{
  try{const data=await lookup(row.registration);await write(db,'customer_garage_vehicles',{vehicle_data:data,checked_at:new Date(now).toISOString(),refresh_after:new Date(now+86400000).toISOString(),...(!row.mot_manual?{mot_due:data.mot_due||row.mot_due}:{}),...(!row.tax_manual?{tax_due:data.tax_due||row.tax_due}:{})},{method:'PATCH',params:{id:'eq.'+row.id}});}
  catch{await write(db,'customer_garage_vehicles',{refresh_after:new Date(now+21600000).toISOString()},{method:'PATCH',params:{id:'eq.'+row.id}});}
 }));
}
export async function runGarageAlerts(db,{now=Date.now(),send=sendPushSubscription}={}){
 if(isTestProject())return {disabled:true};
 const stamp=new Date(now).toISOString(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'numeric',hourCycle:'h23'}).format(new Date(now)));
 const rows=await read(db,'customer_garage_push',{next_check_at:'lte.'+stamp,or:'(lease_until.is.null,lease_until.lt.'+stamp+')',select:'*',order:'next_check_at.asc',limit:20});
 const accounts=new Map();let sent=0;
 const contextFor=id=>{if(!accounts.has(id))accounts.set(id,(async()=>{const [account]=await read(db,'customer_garage_accounts',{id:'eq.'+id,select:'id,email',limit:1});if(!account)return null;const [garage,jobs]=await Promise.all([garageSnapshot(db,account),accountJobs(db,account)]);return {account,garage,jobs};})());return accounts.get(id);};
 await Promise.all(rows.map(async row=>{
  const lease=randomUUID(),condition={id:'eq.'+row.id,account_id:'eq.'+row.account_id,lease_id:'eq.'+lease};
  const claimed=await write(db,'customer_garage_push',{lease_id:lease,lease_until:new Date(now+120000).toISOString()},{method:'PATCH',params:{id:'eq.'+row.id,account_id:'eq.'+row.account_id,next_check_at:'eq.'+row.next_check_at,or:'(lease_until.is.null,lease_until.lt.'+stamp+')'}});if(!claimed?.length)return;
  try{
   const context=await contextFor(row.account_id);if(!context){await write(db,'customer_garage_push',null,{method:'DELETE',params:condition});return;}
   const {account,garage,jobs}=context,regs=new Set(garage.vehicles.map(vehicle=>vehicle.registration)),current=jobs.filter(job=>regs.has(garageReg(job.registration))&&!['cancelled','canceled'].includes(job.status));
   const ready=current.filter(job=>['ready_to_invoice','completed','invoiced','invoice_created'].includes(job.status)&&job.booking_date<=londonDay(now)&&job.booking_date>=londonDay(now-7*86400000)).map(job=>job.id);
   const newReady=ready.filter(id=>!(row.ready_jobs||[]).includes(id));
   const eventParams={actor:'eq.workshop',kind:'in.(message,approval_request,booking_update)',seq:'gt.'+row.last_seq,select:'seq,kind,job_id,registration,customer_email',order:'seq.desc',limit:100};
   const events=current.length?await read(db,'customer_portal_events',{...eventParams,job_id:'in.('+current.map(job=>job.id).join(',')+')'}):[];
   const event=events.find(event=>String(event.customer_email||'').trim().toLowerCase()===account.email&&regs.has(garageReg(event.registration)));
   const reminders=hour>=12?garageReminderItems(garage.vehicles,{now}).filter(item=>!row.reminder_receipts?.[item.key]):[];
   if(event||newReady.length||reminders.length){
    const body=event?'You have a workshop message or work request. Open Vecta to review it.':newReady.length?'Your car is ready to collect. Open Vecta for the details.':reminders.length===1?reminders[0].label+(reminders[0].days<0?' is overdue.':reminders[0].days===0?' is due today.':' is due soon.')+' Open Vecta for your vehicle’s dates.':'You have '+reminders.length+' vehicle reminders. Open Vecta to check your dates.';
    await send(row.subscription,{title:'Vecta Motors',body,tag:'vecta-garage-'+row.id.slice(0,16),url:'/app/home'});sent++;
   }
   // If a message takes priority, leave due reminders unread for the next run.
   const receipts={...(row.reminder_receipts||{})};if(!event&&!newReady.length)for(const item of reminders)receipts[item.key]=londonDay(now);
   const bounded=Object.fromEntries(Object.entries(receipts).sort((a,b)=>b[1].localeCompare(a[1])).slice(0,600));
   await write(db,'customer_garage_push',{last_seq:String(event?.seq||row.last_seq),ready_jobs:event?row.ready_jobs:ready,reminder_receipts:bounded,lease_id:null,lease_until:null,next_check_at:new Date(now+240000).toISOString()},{method:'PATCH',params:condition});
  }catch(error){
   if([404,410].includes(error.statusCode))await write(db,'customer_garage_push',null,{method:'DELETE',params:condition});
   else await write(db,'customer_garage_push',{lease_id:null,lease_until:null,next_check_at:new Date(now+300000).toISOString()},{method:'PATCH',params:condition});
  }
 }));
 return {checked:rows.length,sent};
}
