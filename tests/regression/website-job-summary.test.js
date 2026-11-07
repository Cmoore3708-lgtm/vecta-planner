import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
import '../../public/js/vecta-booking-rules.js';

export const main=fs.readFileSync('index.html','utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const webJob={id:'web',registration:'TEST123',vehicle:'Nissan Qashqai',source:'website booking',job_type:'Full Service',work_required:'Full Service\n\nMini Valet\n\nService price agreed: £210 including VAT.\nOil specification: 5W30\nOil filter [PART123]\n\nCheck noisy brakes',amount_quoted:210,booking_date:'2026-11-09',drop_time:'08:00',technician:'Alfie'};
export function summaryContext(entry=main,mechanic=false){
 const c={window:{VECTA_MECHANIC_DEPLOYMENT:mechanic,VectaBookingRules:globalThis.VectaBookingRules},JOB_TYPE_SEPARATOR:' || ',app:{jobs:[{...webJob,status:'provisional'}]},esc:escape,
  partsStatusDot:()=>'',carryOverMeta:()=>null,carryOverBadgeHtml:()=>'',mobileMotAppointmentHtml:()=>'',plannerMotHeaderHtml:()=>'',mobileJobCategoryLabel:()=> 'Staff',
  plannerPlate:j=>'<span class="ukPlate">'+escape(j.registration)+'</span>',listPlate:r=>'<span class="ukPlate">'+escape(r)+'</span>',compactUnallocatedPlate:r=>'<span class="ukPlate">'+escape(r)+'</span>',
  jobTypeInlineStyle:j=>j.status==='provisional'?'background:#cbd0d7!important':'',hasMotJobType:()=>false,topFor:()=>0,heightFor:()=>120,
  jobTypeMetaForLabel:()=>({colour:'#444'}),motTimeFromJob:()=>'',isJobInvoiced:()=>false,vectaJobIsDeletedForLists:()=>false,byTime:()=>0,templateDataForType:()=>({}),
  quoteJobs:()=>[webJob],money:n=>'£'+n,
 };
 c.jobTypeChip=(j,label)=>'<span class="jobTypeChip">'+escape(label||c.jobTypeLabels(j).join(' · '))+'</span>';
 vm.createContext(c);
 for(const name of ['normaliseJobTypeKey','jobTypeValues','formatJobTypeLabel','jobTypeLabels','isWebsiteBookingJob','plannerVehicleLabel','plannerJobTypesHtml','plannerJobDescription','mechanicWorkLines','mechanicWorkView','mechanicJobCardHtml','jobCardHtml','mobileJobCardHtml','unallocatedJobCardHtml','provisionalBookingsPanelHtml','quotePanelHtml']){
  const start=entry.indexOf('function '+name+'(');assert.ok(start>=0,name);
  vm.runInContext(entry.slice(start,entry.indexOf('\nfunction ',start+1)),c);
 }
 return c;
}
for(const [name,entry] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(name+': all website dashboard cards show job types without descriptions or part details',()=>{
  const c=summaryContext(entry,name==='mechanics'),before=JSON.stringify(webJob);
  for(const html of [c.jobCardHtml(webJob),c.mobileJobCardHtml(webJob),c.unallocatedJobCardHtml(webJob),c.provisionalBookingsPanelHtml(),c.mechanicJobCardHtml(webJob)]){
   const {document}=parseHTML(html),text=document.documentElement.textContent;
   assert.match(text,/Full Service/);assert.match(text,/Mini Valet/);
   assert.doesNotMatch(text,/210|5W30|PART123|noisy brakes|price agreed|including VAT/);
  }
  assert.doesNotMatch(c.quotePanelHtml(),/5W30|PART123|noisy brakes/);
  assert.equal(JSON.stringify(webJob),before);
  assert.match(c.mechanicWorkView(webJob).editor,/Check noisy brakes/,'opening the job still exposes the instructions');
 });
 test(name+': manual dashboard descriptions remain visible and legacy website valet appears once',()=>{
  const c=summaryContext(entry,name==='mechanics'),manual={...webJob,source:'manual',work_required:'Inspect noisy brakes'};
  for(const html of [c.jobCardHtml(manual),c.mobileJobCardHtml(manual),c.unallocatedJobCardHtml(manual),c.mechanicJobCardHtml(manual)])assert.match(html,/Inspect noisy brakes/);
  for(const job_type of ['Full Service','Full Service || Mini Valet']){
   const job={...webJob,job_type,work_required:'Full Service\n\nMini valet · £30 including VAT: snow-foam pressure wash, hoover inside, Dashboard & Media screens cleaned.'};
   assert.deepEqual(Array.from(c.jobTypeLabels(job)),['Full Service','Mini Valet']);
  }
 });
}
