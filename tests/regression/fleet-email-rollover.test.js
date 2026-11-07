import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parseHTML} from 'linkedom';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=new Set(['fleetEmailBookingPlans','fleetOpenEmailBooking','fleetOpenTrackedEmail','fleetMarkEmailSentForVehicle','installProvisionalBookingActions','shouldCarryOverJob','carryOverMeta','setCarryOverMeta','clearCarryOverMeta','isOutstandingCarryOver','carryOverWorkshopDate','carryOverAvailableSlot','carriedOverPreferredMechanics','rollOverOutstandingJobs','syncPendingCarryOvers','nextWorkshopDate','plannerIsoDate','roundPlannerMinutesUp','mechanicBookingIntervals','plannerBookingTimeNote','configuredMechanicNames','configuredMechanicChoice','jobTypeInlineStyle']);
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(![...names].some(n=>m[1].includes('function '+n+'(')))continue;
 traverse(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(p){if(names.has(p.node.id.name))source+=m[1].slice(p.node.start,p.node.end)+'\n'}});
}
function setup(jobs=[],today='2026-11-09'){
 const {document}=parseHTML('<html><body><div id="jobModal"><div class="jobModalHead"><h2>New Job</h2></div><div class="modalFoot"></div></div></body></html>');
 const c={document,console,app:{jobs,settings:{mechanics:['Alfie','Chris','Anyone']}},todayIso:()=>today,remoteClient:{},carryOverPendingSync:{},CARRY_OVER_MARKER:/\[\[CARRY_OVER:([^\]]+)\]\]/i,
  jobCompletionEvidence:j=>j.archived||!!j.completed_at||!!j.invoice||j.status==='completed',vectaJobIsDeletedForLists:j=>!!j.deleted||!!j.tombstone,isJobInvoiced:j=>!!j.invoice,
  plannerTechnicianLane:x=>/^(other|jordan)$/i.test(x)?'Chris':x,clockMinutes:x=>+x.slice(0,2)*60+(+x.slice(3)),timeFromMinutes:x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0'),normaliseClock:x=>x,
  saveLocal(){},jobTypeMeta:()=>({colour:'#123',soft:'#eee',contrast:'#fff'}),closeModals(){},render(){},openJobModal:(id,preset)=>c.opened={id,preset},fleetEmailSent:{},localStorage:{setItem(){}},persistFleetCloudSnapshot:async()=>true,
  fleetEmailCycleKey:()=> 'cycle',fleetEmailDueGroupForVehicle:()=>null,fleetOutstandingPlans:()=>[],fleetDate:p=>p.currentDueDate,fleetBookedPlannerJob:()=>null,
  fleetMaintenanceCategory:t=>/safety|six|6.month/i.test(t)?'safety':/mot/i.test(t)?'mot':/service/i.test(t)?'service':'other',
  fleetIncomeCustomerFromVehicle:()=> 'NMUK',fleetEffectiveContactEmail:v=>v.contactEmail,fleetNmukTypeFromVehicle:()=> 'Pool',jobTypeStorageValue:types=>types.join(' || '),normReg:s=>String(s||'').replace(/\s/g,''),activeFleetVehicleId:'',fleetVehicles:[],location:{},
 };
 c.window=c;vm.createContext(c);vm.runInContext(source,c);return c;
}
const row=(id,extra={})=>({id,status:'booked',booking_date:'2026-11-06',drop_time:'08:00',technician:'Alfie',estimated_hours:1,card_type:'job',customer_note:'Customer note',updated_at:'2026-11-06T10:00:00Z',...extra});
test('unfinished confirmed jobs move to first gap with the same mechanic and retain their original date',()=>{
 const job=row('carry'),booked=row('booked',{booking_date:'2026-11-09',estimated_hours:2}),c=setup([job,booked]);
 assert.equal(c.rollOverOutstandingJobs().length,1);assert.equal(job.booking_date,'2026-11-09');assert.equal(job.drop_time,'10:00');assert.equal(job.technician,'Alfie');assert.equal(c.carryOverMeta(job).original_date,'2026-11-06');assert.match(job.customer_note,/Customer note/);
 assert.match(c.jobTypeInlineStyle(job),/outline:3px solid #dc2626/);assert.equal(c.rollOverOutstandingJobs().length,0);
 c.todayIso=()=> '2026-11-10';c.rollOverOutstandingJobs();assert.equal(c.carryOverMeta(job).original_date,'2026-11-06');
});
test('a full original mechanic passes work to the other mechanic, never Anyone',()=>{
 const job=row('carry'),c=setup([job,row('full',{booking_date:'2026-11-09',estimated_hours:9}),row('other',{booking_date:'2026-11-09',technician:'Chris',estimated_hours:1})]);
 c.rollOverOutstandingJobs();assert.equal(job.technician,'Chris');assert.equal(job.drop_time,'09:00');
});
test('legacy mechanic aliases retain their current lane before trying Alfie',()=>{
 const job=row('carry',{technician:'Other'}),c=setup([job]);c.rollOverOutstandingJobs();assert.equal(job.technician,'Chris');
});
test('weekends, Friday early finish and recorded leave are respected',()=>{
 const weekend=row('weekend'),c=setup([weekend],'2026-11-07');c.rollOverOutstandingJobs();assert.equal(weekend.booking_date,'2026-11-09');
 const friday=row('friday',{booking_date:'2026-11-12',estimated_hours:2}),f=setup([friday,row('busy',{booking_date:'2026-11-13',estimated_hours:6})],'2026-11-13');
 f.vectaTimeOffIntervals=(date,lane)=>lane==='Alfie'?[{start:870,end:1020}]:[{start:480,end:600}];f.rollOverOutstandingJobs();assert.equal(friday.technician,'Chris');assert.equal(friday.drop_time,'10:00');
});
test('fully booked lanes leave the job visible and red in Unallocated without an overlap',()=>{
 const job=row('carry'),c=setup([job,row('a',{booking_date:'2026-11-09',estimated_hours:9}),row('b',{booking_date:'2026-11-09',technician:'Chris',estimated_hours:9})]);
 c.rollOverOutstandingJobs();assert.equal(job.technician,'Unallocated');assert.equal(job.booking_date,null);assert.equal(c.isOutstandingCarryOver(job),true);assert.equal(c.rollOverOutstandingJobs().length,0);
});
test('multiple overdue jobs reserve separate gaps oldest first regardless of data order',()=>{
 const first=row('first',{booking_date:'2026-11-05',estimated_hours:2}),second=row('second'),c=setup([second,first]);c.rollOverOutstandingJobs();assert.equal(first.drop_time,'08:00');assert.equal(second.drop_time,'10:00');
});
test('completed, invoiced, deleted, provisional, waiting, tasks and future jobs never roll or gain a red outline',()=>{
 const excluded=[...['completed','complete','work_complete','ready_to_invoice','invoiced','invoice_created','quote','provisional','cancelled','deleted'].map(status=>({status})),{invoice:true},{completed_at:'2026-11-06T12:00:00Z'},{archived:true},{deleted:true},{tombstone:true},{card_type:'mini_task'},{card_type:'multi_day'},{card_type:'waiting'},{source:'task:1'},{technician:'Waiting'},{technician:'Unallocated'},{booking_date:'2026-11-10'}];
 const c=setup(excluded.map((e,i)=>row(String(i),e))),before=JSON.stringify(c.app.jobs);assert.equal(c.rollOverOutstandingJobs().length,0);assert.equal(JSON.stringify(c.app.jobs),before);
 const marked=row('marked');marked.customer_note=c.setCarryOverMeta('',{original_date:'2026-11-05'});marked.status='work_complete';assert.doesNotMatch(c.jobTypeInlineStyle(marked),/outline:/);marked.status='completed';assert.doesNotMatch(c.jobTypeInlineStyle(marked),/outline:/);
});
test('expired fixed booking times can move while cloud updates retain the stale-device guard',async()=>{
 const job=row('fixed',{customer_note:'Keep me\n[[VECTA_BOOKING_TIME:fixed]]'}),c=setup([job]);c.rollOverOutstandingJobs();assert.equal(job.booking_date,'2026-11-09');assert.doesNotMatch(job.customer_note,/:fixed/);assert.match(job.customer_note,/Keep me/);
 let options;c.upsertRemote=async(table,record,opts)=>{options=opts;assert.equal(record.id,'fixed')};await c.syncPendingCarryOvers();assert.equal(options.expectedRemoteUpdatedAt,'2026-11-06T10:00:00Z');assert.equal(Object.keys(c.carryOverPendingSync).length,0);
});
test('missing mechanic settings do not unallocate jobs during startup',()=>{const job=row('carry'),c=setup([job]);c.app.settings.mechanics=[];assert.equal(c.rollOverOutstandingJobs().length,0);assert.equal(job.technician,'Alfie');});
const vehicle={id:'fleet',registration:'AB12 CDE',model:'Nissan Qashqai',fleetGroup:'Nissan Pool Cars',contactEmail:'driver@example.invalid',contactPhone:'01234567890'};
test('one Fleet email click opens Outlook and an unsaved provisional job with the correct safety check',async()=>{
 const c=setup();c.fleetVehicleForRegistration=()=>vehicle;c.fleetEmailDueGroupForVehicle=()=>({vehicle,items:[{plan:{type:'Six-month Safety Check'}}]});let openedEmail='';Object.defineProperty(c.location,'href',{set:value=>{assert.ok(c.opened);openedEmail=value}});
 await c.fleetOpenTrackedEmail({dataset:{fleetEmailRegistration:vehicle.registration},getAttribute:()=> 'mailto:driver@example.invalid?subject=AB12CDE',closest:()=>null},{preventDefault(){},stopPropagation(){}});
 assert.match(openedEmail,/^mailto:/);assert.equal(c.opened.id,null);assert.equal(c.opened.preset.status,'provisional');assert.equal(c.opened.preset.booking_source,'Email');assert.equal(c.opened.preset.registration,vehicle.registration);assert.equal(c.opened.preset.job_type,'6 Month Safety Check');assert.equal(c.opened.preset.nmuk_vehicle_type,'Pool');assert.equal(c.opened.preset.customer_email,vehicle.contactEmail);assert.equal(c.app.jobs.length,0);
 const modal=c.document.getElementById('jobModal');c.installProvisionalBookingActions(modal,{...c.opened.preset,id:'unsaved'},null,false);assert.deepEqual(Array.from(modal.querySelectorAll('button'),b=>b.textContent),['Close','Save provisional booking']);
});
test('email prefill distinguishes annual service, internal on-site service and combined work',()=>{
 const c=setup();c.fleetOpenEmailBooking(vehicle,[{type:'Annual Service'},{type:'MOT'}]);assert.equal(c.opened.preset.job_type,'Full Service || MOT');assert.equal(c.opened.preset.work_required,'Full Service\nMOT');
 c.fleetOpenEmailBooking({...vehicle,fleetGroup:'Nissan Internal'},[{type:'Internal Service'}]);assert.equal(c.opened.preset.job_type,'On-Site Service');
});
test('existing reservation is opened and combined work only prefills unbooked items',()=>{
 const c=setup();c.fleetBookedPlannerJob=(reg,key)=>key==='service'?{id:'existing',booking_date:'2026-11-10'}:null;
 c.fleetOpenEmailBooking(vehicle,[{type:'Annual Service'}]);assert.equal(c.opened.id,'existing');
 c.fleetOpenEmailBooking(vehicle,[{type:'Annual Service'},{type:'Six-month Safety Check'}]);assert.equal(c.opened.id,null);assert.equal(c.opened.preset.job_type,'6 Month Safety Check');
});

test('slow cloud audit never delays opening the email or provisional draft',async()=>{const c=setup();c.fleetVehicleForRegistration=()=>vehicle;c.fleetEmailDueGroupForVehicle=()=>({vehicle,items:[{plan:{type:'Annual Service'}}]});c.persistFleetCloudSnapshot=()=>new Promise(()=>{});await c.fleetOpenTrackedEmail({dataset:{fleetEmailRegistration:vehicle.registration},getAttribute:()=>'mailto:driver@example.invalid',closest:()=>null});assert.ok(c.opened);assert.equal(c.location.href,'mailto:driver@example.invalid');});
