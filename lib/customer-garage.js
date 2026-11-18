import {createVehicleLookup} from '../api/vehicle-lookup.js';
import {imageUrl} from './haynes-vehicle.js';
import {trackingUrl,uuid,londonDay,progressSnapshot} from './job-progress.js';
import {customerWork} from './customer-portal.js';
import {garageFail as fail,garageRead as read,garageWrite as write,garageAccount,garageHash,requestGarageCode,verifyGarageCode} from './customer-garage-auth.js';
import {appSubscription} from './customer-app.js';
import {pushConfig} from '../api/_push.js';
import {isTestProject} from '../api/_database-environment.js';

export const garageReg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function garageDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?value:null;}
export function annualServiceDate(value){if(!garageDay(value))return null;const d=new Date(value+'T12:00:00Z'),month=d.getUTCMonth();d.setUTCFullYear(d.getUTCFullYear()+1);if(d.getUTCMonth()!==month)d.setUTCDate(0);return d.toISOString().slice(0,10);}
const completed=job=>['completed','invoiced','invoice_created','ready_to_invoice','work_complete'].includes(job.status);
const visible=job=>!job.deleted&&!job.deleted_at&&job.card_type!=='quote'&&!['quote','deleted'].includes(job.status)&&!/\[\[VECTA_(?:SOFT_DELETE|DELETED)[:\]]/i.test(job.customer_note||'')&&!job.no_vehicle;
const emailMatches=(job,account,customerIds=[])=>String(job.customer_email||'').trim()?String(job.customer_email).trim().toLowerCase()===account.email:customerIds.includes(job.customer_id);
const likeEmail=email=>email.replace(/[\\%_]/g,'\\$&');
export async function accountJobs(db,account,{registration,offset=0,limit=101}={}){
 const customers=await read(db,'customers',{email:'ilike.'+likeEmail(account.email),select:'id,email',limit:30});
 const ids=customers.filter(row=>String(row.email||'').trim().toLowerCase()===account.email).map(row=>row.id).filter(id=>uuid.test(id));
 const params={select:'*',order:'booking_date.desc,id.desc',offset,limit};
 if(ids.length)params.or='(customer_email.ilike.'+likeEmail(account.email)+',customer_id.in.('+ids.join(',')+'))';else params.customer_email='ilike.'+likeEmail(account.email);
 if(registration)params.registration='ilike.'+garageReg(registration).split('').join('*');
 const jobs=await read(db,'jobs',params);
 const result=jobs.filter(job=>emailMatches(job,account,ids)&&visible(job)&&(!registration||garageReg(job.registration)===garageReg(registration)));
 const finished=result.filter(job=>job.booking_date>='2026-11-18'&&(completed(job)||job.visit_billing)&&!job.customer_account);
 if(finished.length){
  const keys=finished.map(job=>'jobcustomer:'+job.id);
  const saved=await read(db,'workshop_settings',{id:'in.('+keys.join(',')+')',select:'id,value',limit:keys.length});
  const accounts=new Map(saved.map(row=>[row.id,row.value?.customer_account]));
  for(const job of finished)job.customer_account=accounts.get('jobcustomer:'+job.id)||'';
 }
 Object.defineProperty(result,'rawCount',{value:jobs.length});return result;
}
export async function ownedGarageVehicle(db,account,id){
 if(!uuid.test(id||''))throw fail('Choose one of your vehicles.');
 const [row]=await read(db,'customer_garage_vehicles',{id:'eq.'+id,account_id:'eq.'+account.id,select:'*',limit:1});
 if(!row)throw fail('This vehicle is not in your garage.',404);return row;
}
const lookupHandler=createVehicleLookup();
export async function garageVehicleLookup(registration){
 const response={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 await lookupHandler({method:'GET',query:{reg:registration}},response);
 if(response.code!==200)throw fail(response.data?.error||'Vehicle details are temporarily unavailable.',response.code===404?404:503);
 return publicVehicleData(response.data);
}
export function firstGarageMotDate(value){
 if(!garageDay(value))return null;
 // Match the workshop's first-MOT reminder: the day before the third anniversary.
 const d=new Date(value+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+3);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
export function publicVehicleData(data){
 const firstUsed=garageDay(data.firstUsedDate||data.registrationDate),officialMot=garageDay(data.motExpiryDate)||garageDay(data.dvlaMotExpiryDate);
 const firstMot=!data.lookupPartial&&!(data.motTests||[]).length&&!/exempt/i.test(data.dvlaMotStatus||data.motStatus||'')?firstGarageMotDate(firstUsed):null;
 return {vehicle:String(data.vehicle||'').slice(0,200),make:String(data.make||'').slice(0,100),model:String(data.model||'').slice(0,100),colour:String(data.primaryColour||'').slice(0,40),mot_due:officialMot||firstMot,mot_date_source:officialMot?'official MOT record':firstMot?'first MOT reminder (calculated)':null,first_used_date:firstUsed,tax_due:garageDay(data.taxDueDate),tax_status:String(data.taxStatus||''),fetched_at:data.fetchedAt||null,
  mot_tests:(data.motTests||[]).slice(0,80).map(test=>({date:garageDay(String(test.completedDate||'').slice(0,10).replaceAll('.','-'))||'',result:String(test.testResult||''),expiry_date:garageDay(test.expiryDate),mileage:String(test.odometerValue||''),unit:String(test.odometerUnit||''),defects:(test.defects||test.rfrAndComments||[]).slice(0,100).map(item=>({type:String(item.type||'').slice(0,30),text:String(item.text||'').slice(0,1000),dangerous:item.dangerous===true}))}))};
}
async function vehicleArtwork(db,registration){
 const rows=await read(db,'workshop_settings',{id:'in.(vehicle_artwork:'+registration+',vehicle_colour:'+registration+')',select:'id,value',limit:2});
 return {image_url:imageUrl(rows.find(row=>row.id.startsWith('vehicle_artwork:'))?.value?.imageUrl)||'',colour:rows.find(row=>row.id.startsWith('vehicle_colour:'))?.value?.colour||''};
}
export function garageServiceSchedule(vehicle,jobs,{today=londonDay()}={}){
 const services=jobs.filter(job=>visible(job)&&/\bservice\b/i.test(job.job_type||'')&&!/6.month|safety|dpf/i.test(job.job_type||'')&&!['cancelled','canceled','provisional'].includes(job.status)&&garageDay(job.booking_date));
 const booked=services.filter(job=>!completed(job)&&job.booking_date>=today).sort((a,b)=>a.booking_date.localeCompare(b.booking_date))[0];
 const last=services.filter(job=>completed(job)&&job.booking_date<=today).sort((a,b)=>b.booking_date.localeCompare(a.booking_date))[0];
 const automatic=!vehicle.service_due;
 return {service_due:automatic?(booked?.booking_date||annualServiceDate(last?.booking_date)):vehicle.service_due,service_automatic:automatic,service_booked:automatic&&!!booked,service_date_source:!automatic?'your date':booked?'booked Vecta service':last?'last Vecta service':null};
}
// Older website bookings recorded the explicit answer in their work description.
// Only the verified account's own jobs are supplied here; registration alone is not authority.
export function garageNevosStatus(vehicle,jobs=[]){
 if(['yes','no'].includes(vehicle.nevos_vehicle))return vehicle.nevos_vehicle;
 for(const job of [...jobs].sort((a,b)=>String(b.booking_date||'').localeCompare(String(a.booking_date||'')))){
  if(garageReg(job.registration)!==vehicle.registration||!visible(job))continue;
  const answer=String(job.work_required||'').match(/^NEVOS vehicle: (YES|NO)\s*$/m);
  if(answer)return answer[1].toLowerCase();
 }
 return null;
}
export async function garageSnapshot(db,account,{now=Date.now()}={}){
 const [vehicles,jobs]=await Promise.all([read(db,'customer_garage_vehicles',{account_id:'eq.'+account.id,select:'*',order:'created_at.asc',limit:30}),accountJobs(db,account)]);
 const result=await Promise.all(vehicles.map(async vehicle=>{
  const matching=jobs.filter(job=>garageReg(job.registration)===vehicle.registration);
  const serviceJobs=jobs.rawCount<101?matching:await accountJobs(db,account,{registration:vehicle.registration,limit:100});
  const artwork=await vehicleArtwork(db,vehicle.registration).catch(()=>({image_url:'',colour:''}));
  const today=londonDay(now);
  const upcoming=serviceJobs.filter(job=>!['cancelled','canceled','provisional'].includes(job.status)&&(job.booking_date===today||job.booking_date>today&&!completed(job)||job.booking_date>=londonDay(now-7*86400000)&&job.visit_billing&&job.visit_presence!=='collected')).sort((a,b)=>a.booking_date.localeCompare(b.booking_date)).map(job=>publicBooking(job,now));
  return {...vehicle,nevos_vehicle:garageNevosStatus(vehicle,serviceJobs),account_id:undefined,insurance_document_id:undefined,insurance_cleanup:undefined,...artwork,...garageServiceSchedule(vehicle,serviceJobs,{today:londonDay(now)}),upcoming};
 }));
 return {email:account.email,vehicles:result,suggestions:[...new Map(jobs.filter(job=>garageReg(job.registration)).map(job=>[garageReg(job.registration),{registration:garageReg(job.registration),vehicle:job.vehicle||''}])).values()].filter(job=>!vehicles.some(vehicle=>vehicle.registration===job.registration)).slice(0,10)};
}
function trackLabel(job,now){
 if(['cancelled','canceled','provisional'].includes(job.status)||job.booking_date<'2026-11-18')return '';
 const account=job.customer_account||((job.visit_billing||String(job.source).toLowerCase()==='staff')?'Staff':'');
 return progressSnapshot(job,{account,now}).title;
}
export function garageReadyForCollection(job){
 if(job.visit_presence==='collected'&&job.visit_presence_date===job.booking_date)return false;
 if(job.visit_billing)return true;
 if(job.booking_date>='2026-11-18'&&String(job.customer_account||job.source||'').toLowerCase()==='staff')return false;
 return ['ready_to_invoice','completed','invoiced','invoice_created'].includes(job.status);
}
export function publicBooking(job,now=Date.now()){
 let url='';try{url='/app/booking#'+trackingUrl(job).split('#')[1];}catch{}
 return {id:job.id,registration:garageReg(job.registration),date:job.booking_date,status:job.status,visit_label:trackLabel(job,now),work:customerWork(job.work_required||job.job_type||''),vehicle:job.vehicle||'',portal_url:url};
}
const kinds=['service','safety','internal','onsite'];
async function savedSheets(db,registration,jobs){
 const keys=jobs.flatMap(job=>kinds.map(kind=>kind+':'+registration+':'+job.id));
 if(!keys.length)return [];
 keys.push(...kinds.map(kind=>kind+':'+registration));
 const rows=await read(db,'workshop_settings',{id:'in.('+keys.join(',')+')',select:'id,value',limit:keys.length});
 const seen=new Set();return rows.filter(row=>{
  const value=row.value;if(!value?.html||garageReg(value.registration)!==registration||!jobs.some(job=>job.id===value.job_id&&completed(job)))return false;
  const signature=value.job_id+':'+(value.sheet_type||row.id.split(':')[0]);if(seen.has(signature))return false;seen.add(signature);return true;
 });
}
export async function garageHistory(db,account,vehicle,{offset=0}={}){
 if(!Number.isInteger(offset)||offset<0||offset>100000)throw fail('Invalid history page.');
 const jobs=await accountJobs(db,account,{registration:vehicle.registration,offset,limit:30}),page=jobs;
 const [sheets,invoices]=await Promise.all([savedSheets(db,vehicle.registration,page),page.length?read(db,'invoices',{job_id:'in.('+page.map(job=>job.id).join(',')+')',select:'id,job_id,registration,invoice_number,invoice_date,total,status',limit:100}):[]]);
 return {bookings:page.map(job=>({...publicBooking(job),documents:[...sheets.filter(row=>row.value.job_id===job.id).map(row=>({id:row.id,type:'service',label:row.value.title||'Service sheet',date:row.value.service_date||row.value.saved_at?.slice(0,10)||job.booking_date})),...invoices.filter(invoice=>invoice.job_id===job.id&&garageReg(invoice.registration)===vehicle.registration&&!['draft','void','cancelled','deleted'].includes(invoice.status)).map(invoice=>({id:invoice.id,type:'invoice',label:'Invoice '+(invoice.invoice_number||''),date:invoice.invoice_date,total:invoice.total}))]})),next_offset:jobs.rawCount===30?offset+30:null};
}
export async function garageDocument(db,account,vehicle,body){
 let document,jobId;
 if(body.type==='invoice'){
  if(!uuid.test(body.document_id||''))throw fail('Choose an invoice.');
  [document]=await read(db,'invoices',{id:'eq.'+body.document_id,select:'*',limit:1});jobId=document?.job_id;
  if(!document||garageReg(document.registration)!==vehicle.registration||['draft','void','cancelled','deleted'].includes(document.status))throw fail('Document unavailable.',404);
 }else if(body.type==='service'){
  if(typeof body.document_id!=='string'||!kinds.some(kind=>body.document_id===kind+':'+vehicle.registration||body.document_id.startsWith(kind+':'+vehicle.registration+':')))throw fail('Choose a service sheet.');
  const [row]=await read(db,'workshop_settings',{id:'eq.'+body.document_id,select:'value',limit:1});document=row?.value;jobId=document?.job_id;
  if(!document?.html||garageReg(document.registration)!==vehicle.registration)throw fail('Document unavailable.',404);
 }else throw fail('Choose a document.');
 if(!uuid.test(jobId||''))throw fail('This document needs the workshop to confirm its booking link.',404);
 const [job]=await read(db,'jobs',{id:'eq.'+jobId,select:'*',limit:1});
 let ids=[];if(job&&!job.customer_email&&job.customer_id){const [customer]=await read(db,'customers',{id:'eq.'+job.customer_id,select:'id,email',limit:1});if(customer?.email?.trim().toLowerCase()===account.email)ids=[customer.id];}
 if(!job||!visible(job)||!emailMatches(job,account,ids)||garageReg(job.registration)!==vehicle.registration||!completed(job))throw fail('Document unavailable.',404);
 let bytes;
 if(body.type==='invoice'){
  const [settings]=await read(db,'workshop_settings',{id:'eq.main',select:'value',limit:1});
  bytes=await (await import('../api/_invoice-pdf.js')).renderCustomerInvoicePdf(document,settings?.value||{},job);
 }else bytes=await (await import('./customer-service-pdf.js')).customerServicePdf(document);
 return {filename:('Vecta-'+vehicle.registration+'-'+(body.type==='invoice'?'Invoice-'+document.invoice_number:document.title||'Service-sheet')).replace(/[^a-zA-Z0-9_-]/g,'-')+'.pdf',content_type:'application/pdf',base64:Buffer.from(bytes).toString('base64')};
}
export async function customerGarageAction(db,body,{lookup=garageVehicleLookup,now=Date.now(),sendCode,insuranceStorage}={}){
 if(body.action==='garage-sign-in')return requestGarageCode(db,body.email,{now,...(sendCode?{send:sendCode}:{})});
 if(body.action==='garage-verify')return verifyGarageCode(db,body,{now});
 const account=await garageAccount(db,body.session,{now});
 if(body.action==='garage-status')return {...await garageSnapshot(db,account,{now}),profile:await garageProfile(db,account)};
 if(body.action==='garage-profile-save'){const name=String(body.name||'').trim().slice(0,100),phone=String(body.phone||'').trim().slice(0,40);if(!name||!phone||!/^[+\d ()-]{7,40}$/.test(phone))throw fail('Enter your name and a valid phone number.');await write(db,'customer_garage_accounts',{name,phone},{method:'PATCH',params:{id:'eq.'+account.id}});return {ok:true};}
 if(body.action==='garage-rewards')return garageRewards(db,account,{now});
 if(body.action==='garage-booking-prefill'){
  const vehicle=await ownedGarageVehicle(db,account,body.vehicle_id);
  const jobs=vehicle.nevos_vehicle?[]:await accountJobs(db,account,{registration:vehicle.registration,limit:100});
  return {vehicle_id:vehicle.id,nevos_vehicle:garageNevosStatus(vehicle,jobs),profile:await garageProfile(db,account),registration:vehicle.registration,vehicle:vehicle.vehicle_data?.vehicle||'',vehicle_make:vehicle.vehicle_data?.make||'',vehicle_colour:vehicle.vehicle_data?.colour||''};
 }
 if(body.action==='garage-sign-out'){await write(db,'customer_garage_sessions',null,{method:'DELETE',params:{token_hash:'eq.'+garageHash(body.session)}});return {ok:true};}
 if(body.action==='garage-push-config'){
  if(isTestProject())return {enabled:false};return {enabled:true,...pushConfig()};
 }
 if(['garage-push-subscribe','garage-push-unsubscribe'].includes(body.action)){
  if(isTestProject())throw fail('Alerts are disabled on this preview.',409);
  const subscription=appSubscription(body.subscription),id=garageHash(subscription.endpoint);
  if(body.action==='garage-push-unsubscribe'){await write(db,'customer_garage_push',null,{method:'DELETE',params:{id:'eq.'+id,account_id:'eq.'+account.id}});return {ok:true};}
  const [previous]=await read(db,'customer_garage_push',{id:'eq.'+id,select:'account_id',limit:1});
  if(previous?.account_id===account.id)return {ok:true};
  const [event]=await read(db,'customer_portal_events',{select:'seq',order:'seq.desc',limit:1});
  const jobs=await accountJobs(db,account);
  await db('customer_garage_push?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id,account_id:account.id,subscription,last_seq:String(event?.seq||0),ready_jobs:jobs.filter(garageReadyForCollection).map(job=>job.id),reminder_receipts:{}})});
  await write(db,'customer_app_subscriptions',null,{method:'DELETE',params:{id:'eq.'+id}});
  return {ok:true};
 }
 if(body.action==='garage-add'){
  const registration=garageReg(body.registration);if(!/^[A-Z0-9]{2,8}$/.test(registration))throw fail('Enter a valid registration.');
  const vehicles=await read(db,'customer_garage_vehicles',{account_id:'eq.'+account.id,select:'id,registration',limit:31});
  if(vehicles.some(row=>row.registration===registration))throw fail('This vehicle is already in your garage.',409);
  if(vehicles.length>=30)throw fail('Your garage already has 30 vehicles.');
  let data;try{data=await lookup(registration);}catch(error){if(error.status===404)throw error;data={vehicle:String(body.vehicle||'Vehicle details pending').slice(0,100),mot_tests:[]};}
  const [vehicle]=await write(db,'customer_garage_vehicles',{account_id:account.id,registration,nickname:String(body.nickname||'').trim().slice(0,60),family:body.family===true,vehicle_data:data,mot_due:data.mot_due||null,tax_due:data.tax_due||null,checked_at:data.fetched_at||null,refresh_after:new Date(now+(data.fetched_at?86400000:21600000)).toISOString()});
  return {ok:true,id:vehicle.id};
 }
 const vehicle=await ownedGarageVehicle(db,account,body.vehicle_id);
 if(['garage-insurance-upload','garage-insurance-view','garage-insurance-remove'].includes(body.action))return (await import('./customer-garage-insurance.js')).garageInsuranceAction(db,account,vehicle,body,{now,storage:insuranceStorage});
 if(body.action==='garage-history-report')return garageHistoryReport(db,account,vehicle,{now});
 if(body.action==='garage-history')return garageHistory(db,account,vehicle,{offset:body.offset||0});
 if(body.action==='garage-document')return garageDocument(db,account,vehicle,body);
 if(body.action==='garage-remove'){
  const {removeGarageInsurance,insuranceMatch}=await import('./customer-garage-insurance.js');
  await removeGarageInsurance(account,vehicle,{storage:insuranceStorage});
  const removed=await write(db,'customer_garage_vehicles',null,{method:'DELETE',params:insuranceMatch(account,vehicle)});
  if(!removed?.length)throw fail('Your car changed on another device. Refresh your garage and try again.',409);
  return {ok:true};
 }
 if(body.action==='garage-nevos-save'){
  if(!['yes','no'].includes(body.nevos_vehicle))throw fail('Choose Yes or No for NEVOS.');
  const updated=await write(db,'customer_garage_vehicles',{nevos_vehicle:body.nevos_vehicle},{method:'PATCH',params:{id:'eq.'+vehicle.id,account_id:'eq.'+account.id}});
  if(!updated?.length)throw fail('This vehicle is no longer in your garage.',404);
  return {ok:true};
 }
 if(body.action==='garage-refresh'){
  const data=await lookup(vehicle.registration);
  await write(db,'customer_garage_vehicles',{vehicle_data:data,checked_at:new Date(now).toISOString(),refresh_after:new Date(now+86400000).toISOString(),...(!vehicle.mot_manual?{mot_due:data.mot_due||vehicle.mot_due}:{}),...(!vehicle.tax_manual?{tax_due:data.tax_due||vehicle.tax_due}:{})},{method:'PATCH',params:{id:'eq.'+vehicle.id,account_id:'eq.'+account.id}});return {ok:true};
 }
 if(body.action==='garage-save'){
  const changes={nickname:String(body.nickname||'').trim().slice(0,60),reminders:body.reminders===true};
  for(const key of ['mot_due','tax_due','service_due','insurance_due']){if(body[key]&&(!garageDay(body[key])||body[key]<'1900-01-01'||body[key]>'2200-12-31'))throw fail('Enter a valid due date.');changes[key]=body[key]||null;}
  if(body.nevos_vehicle!==undefined){if(!['','yes','no'].includes(body.nevos_vehicle))throw fail('Choose Yes or No for NEVOS.');changes.nevos_vehicle=body.nevos_vehicle||null;}
  if(body.service_automatic===true)changes.service_due=null;
  changes.mot_manual=!!changes.mot_due&&changes.mot_due!==vehicle.vehicle_data?.mot_due;changes.tax_manual=!!changes.tax_due&&changes.tax_due!==vehicle.vehicle_data?.tax_due;
  await write(db,'customer_garage_vehicles',changes,{method:'PATCH',params:{id:'eq.'+vehicle.id,account_id:'eq.'+account.id}});return {ok:true};
 }
 throw fail('Choose a garage action.');
}

export async function garageProfile(db,account){
 const [saved]=await read(db,'customer_garage_accounts',{id:'eq.'+account.id,select:'name,phone',limit:1});
 const customers=await read(db,'customers',{email:'ilike.'+likeEmail(account.email),select:'name,phone,email',limit:30});
 const matching=customers.filter(c=>String(c.email||'').trim().toLowerCase()===account.email);
 const latest=(await accountJobs(db,account,{limit:20}))[0];
 // Only auto-fill a customer record if it is unambiguous for this verified email.
 const customer=matching.length===1?matching[0]:null;
 return {name:saved?.name||latest?.customer_name||customer?.name||'',phone:saved?.phone||latest?.customer_phone||customer?.phone||'',email:account.email};
}
// Loyalty is an earned total, not a redeemable wallet balance. No invoice writes.
export function loyaltyFromInvoices(jobs,invoices,{startsOn,today=londonDay()}={}){
 if(!garageDay(startsOn)||!garageDay(today)||startsOn>today)return {paid_spend_pence:0,earned_bonus_pence:0,payments:[]};
 const ownJobs=new Map(jobs.filter(job=>completed(job)&&visible(job)&&String(job.source||'Staff').toLowerCase()==='staff').map(job=>[job.id,job]));
 const seen=new Set(),payments=[];
 for(const invoice of invoices){
  const job=ownJobs.get(invoice.job_id),status=String(invoice.status||'').toLowerCase();
  if(!job||!uuid.test(invoice.id||'')||seen.has(invoice.id)||garageReg(invoice.registration)!==garageReg(job.registration)||invoice.fleet_customer||invoice.eom_month||invoice.source==='fleet_eom')continue;
  seen.add(invoice.id);
  if(['draft','void','cancelled','canceled','deleted','refunded','part_refunded','part_paid'].includes(status)||!(status==='paid'||['card','cash','bacs'].includes(String(invoice.payment_method||'').toLowerCase())))continue;
  const dates=[...new Set((Array.isArray(invoice.lines)?invoice.lines:[]).filter(line=>line&&Object.hasOwn(line,'invoice_paid_date')).map(line=>line.invoice_paid_date))];
  const paidOn=dates.length===1?garageDay(dates[0]):null;
  // The existing payment date is authoritative. Do not substitute invoice or job dates.
  if(!paidOn||paidOn<startsOn||paidOn>today)continue;
  const amount=invoice.total??invoice.amount;
  if(amount==null||amount===''||!Number.isFinite(Number(amount))||Number(amount)<0)throw fail('Your loyalty total needs a workshop check. Please contact Vecta.',503);
  const spend=Math.round((Number(amount)+Number.EPSILON)*100);
  if(!Number.isSafeInteger(spend)||spend>100000000)throw fail('Your loyalty total needs a workshop check. Please contact Vecta.',503);
  if(!spend)continue;
  payments.push({invoice_id:invoice.id,invoice_number:String(invoice.invoice_number||''),registration:garageReg(job.registration),paid_on:paidOn,spend_pence:spend,bonus_pence:Math.floor((spend*5+50)/100)});
 }
 payments.sort((a,b)=>b.paid_on.localeCompare(a.paid_on)||a.invoice_id.localeCompare(b.invoice_id));
 return {paid_spend_pence:payments.reduce((sum,p)=>sum+p.spend_pence,0),earned_bonus_pence:payments.reduce((sum,p)=>sum+p.bonus_pence,0),payments};
}
export async function garageRewards(db,account,{now=Date.now()}={}){
 const [setting]=await read(db,'workshop_settings',{id:'eq.customer_loyalty_v1',select:'value',limit:1});
 const startsOn=garageDay(setting?.value?.starts_on),today=londonDay(now),active=!!startsOn&&startsOn<=today;
 const result={active,rate_percent:5,currency:'GBP',starts_on:startsOn,redemption_enabled:false,paid_spend_pence:0,earned_bonus_pence:0,payments:[],terms:'Earn 5% of the total paid, including VAT, on completed personal Vecta bookings from the scheme start date. Each fully paid invoice earns once, rounded to the nearest penny. MOT bookings count too. Unpaid, cancelled, refunded and fleet invoices do not earn a bonus. Payments without a confirmed payment date need a workshop check. This shows your total bonus earned; redemption is not enabled yet.'};
 if(!active)return result;
 const jobs=[];let complete=false;
 for(let offset=0;offset<2000;offset+=100){const batch=await accountJobs(db,account,{offset,limit:100});jobs.push(...batch);if(batch.rawCount<100){complete=true;break;}}
 if(!complete)throw fail('Your loyalty history needs a workshop check before we can show a complete total.',413);
 const invoices=[];for(let start=0;start<jobs.length;start+=50){const ids=jobs.slice(start,start+50).map(j=>j.id);invoices.push(...await read(db,'invoices',{job_id:'in.('+ids.join(',')+')',select:'id,job_id,registration,status,total,amount,payment_method,fleet_customer,eom_month,source,invoice_number,lines',limit:500}));}
 return {...result,...loyaltyFromInvoices(jobs,invoices,{startsOn,today})};
}

export async function garageHistoryReport(db,account,vehicle,{now=Date.now(),renderPdf}={}){
 const jobs=[];let complete=false;
 for(let offset=0;offset<2000;offset+=100){const batch=await accountJobs(db,account,{registration:vehicle.registration,offset,limit:100});jobs.push(...batch);if(batch.rawCount<100){complete=true;break;}}
 if(!complete)throw fail('This history is too large for one report. Contact Vecta for a complete export.',413);
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=value=>garageDay(String(value||'').slice(0,10))?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):String(value||'Not recorded');
 const tests=vehicle.vehicle_data?.mot_tests||[];
 const html='<div class="servicePrint"><section class="ssInfo"><p>All available Vecta bookings linked to '+escape(account.email)+' for '+escape(vehicle.registration)+'. Individual service sheets and invoices can also be downloaded from My Garage. Public MOT history was last checked '+escape(date(vehicle.checked_at))+'; historical advisories do not establish the car’s current condition. Official MOT certificates are available through GOV.UK.</p></section><section class="ssSection"><h2 class="ssTitle">Vecta booking history ('+jobs.length+' visits)</h2><table><tr><th>Work recorded</th><th>Date</th><th>Status</th></tr>'+jobs.map(job=>'<tr><td>'+escape(customerWork(job.work_required||job.job_type||''))+'</td><td>'+escape(date(job.booking_date))+'</td><td>'+escape(String(job.status||'').replaceAll('_',' '))+'</td></tr>').join('')+'</table></section>'+tests.map(test=>'<section class="ssSection"><h2 class="ssTitle">MOT '+escape(date(test.date))+' — '+escape(test.result)+'</h2><div class="ssPreBody">Mileage: '+escape(test.mileage||'Not recorded')+' '+escape(test.unit||'')+'</div><div class="ssPreBody">'+(test.defects?.length?test.defects.map(defect=>escape(defect.type)+': '+escape(defect.text)+(defect.dangerous?' — DANGEROUS':'')).join('; '):'No advisories or defects listed for this test.')+'</div></section>').join('')+'</div>';
 if(html.length>450000)throw fail('This history is too large for one report. Contact Vecta for a complete export.',413);
 const render=renderPdf||(await import('./customer-service-pdf.js')).customerServicePdf;
 const bytes=await render({html,title:'Vehicle history report',registration:vehicle.registration,service_date:londonDay(now),date_label:'REPORT DATE',footer_label:'Vecta vehicle history report'});
 if(bytes.length>3000000)throw fail('This report is too large for one download. Contact Vecta for a complete export.',413);
 return {filename:'Vecta-'+vehicle.registration+'-history.pdf',content_type:'application/pdf',base64:Buffer.from(bytes).toString('base64')};
}
