import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const start=html.indexOf('function installNewJobAvailabilityCalendar('),end=html.indexOf('\n\nfunction previousVehicleWork(',start),source=html.slice(start,end);
function setup(fieldId='job_booking_date'){
 const {document,window}=parseHTML('<html><body><section class="jobBookingSection"><div class="jobSectionGrid"><div class="field"><input id="'+fieldId+'" value="2026-10-16"></div><div class="field">Drop-off time</div></div></section></body></html>');
 const lane=v=>v==='Other'?'Chris':v,app={settings:{mechanics:['Alfie','Chris','Anyone']},jobs:[{registration:'TODAY',booking_date:'2026-10-16',status:'booked',technician:'Alfie',estimated_hours:1},{registration:'NEXTDAY',booking_date:'2026-10-19',status:'booked',technician:'Other',estimated_hours:2},{registration:'DONE',booking_date:'2026-10-19',status:'completed',technician:'Chris'}]};
 const ctx={document,Event:window.Event,app,selectedIso:()=> '2026-10-16',todayIso:()=> '2026-10-16',esc:v=>String(v||''),niceDate:v=>v,isVehicleTaxJob:()=>false,vectaJobIsDeletedForLists:()=>false,isUnallocatedJob:()=>false,plannerTechnicianLane:lane,mechanicHours:(jobs,mech)=>jobs.filter(j=>lane(j.technician)===lane(mech)).reduce((sum,j)=>sum+Number(j.estimated_hours||1),0),byTime:()=>0,jobTitle:()=> 'Work'};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.installNewJobAvailabilityCalendar(true,fieldId);return {document,window};
}
test('selecting a day updates the existing booking field and adjacent allocated work without a popup',()=>{
 const {document,window}=setup(),field=document.getElementById('job_booking_date'),preview=document.querySelector('.bookingAvailabilityWorkspace');
 assert.equal(preview.parentElement.className,'jobSectionGrid');assert.ok(preview.querySelector('.bookingInlinePlanner'));
 preview.querySelector('[data-v243-calendar-day="2026-10-19"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 assert.equal(field.value,'2026-10-19');assert.match(preview.querySelector('.bookingInlinePlanner').textContent,/NEXTDAY/);assert.doesNotMatch(preview.textContent,/DONE/);assert.match(preview.querySelector('.v243PlannerTitle').textContent,/2026-10-19/);assert.equal(document.querySelector('.modal.open'),null);assert.equal(preview.querySelector('[data-v243-use-date]'),null);
 field.onclick({preventDefault(){}});assert.equal(document.querySelector('.modal.open'),null);
});
test('month browsing does not change the booking date until a day is selected',()=>{
 const {document,window}=setup(),field=document.getElementById('job_booking_date'),preview=document.querySelector('.bookingAvailabilityWorkspace');
 preview.querySelector('[data-v243-next-month]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.match(preview.querySelector('.v243MonthHead').textContent,/November/);assert.equal(field.value,'2026-10-16');assert.ok(preview.querySelector('.bookingInlinePlanner'));
});
test('the main dashboard calendar retains its existing modal and confirmation',()=>{
 const {document}=setup('currentDate');document.getElementById('currentDate').onclick({preventDefault(){}});assert.ok(document.querySelector('#dashboardPlannerCalendarModal.open'));assert.ok(document.querySelector('[data-v243-use-date]'));assert.equal(document.querySelector('.bookingAvailabilityWorkspace'),null);
});


test('the day planner stays visible without a redundant hide control',()=>{
 const {document,window}=setup(),field=document.getElementById('job_booking_date'),preview=document.querySelector('.bookingAvailabilityWorkspace');
 field.onclick({preventDefault(){}});assert.ok(preview.querySelector('.bookingInlinePlanner'));
 preview.querySelector('[data-v243-calendar-day="2026-10-19"]').dispatchEvent(new window.Event('click',{bubbles:true}));assert.ok(preview.classList.contains('hasDayPlanner'));
 assert.equal(preview.querySelector('[data-hide-day-planner]'),null);assert.ok(preview.querySelector('.bookingInlinePlanner'));assert.equal(preview.classList.contains('hasDayPlanner'),true);assert.equal(field.value,'2026-10-19');
});

test('inline booking dates omit earlier days and continue into next month',()=>{
 const {document,window}=setup(),preview=document.querySelector('.bookingAvailabilityWorkspace');
 preview.querySelector('[data-v243-calendar-day="2026-10-20"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 const days=Array.from(preview.querySelectorAll('[data-v243-calendar-day]')).map(el=>el.dataset.v243CalendarDay);
 assert.equal(days[0],'2026-10-20');assert.ok(days.includes('2026-11-02'));
 assert.equal(preview.querySelector('[data-v243-calendar-day="2026-10-19"]'),null);
 preview.querySelector('[data-v243-calendar-day="2026-11-02"]').dispatchEvent(new window.Event('click',{bubbles:true}));
 assert.equal(document.getElementById('job_booking_date').value,'2026-11-02');
 preview.querySelector('[data-v243-prev-month]').dispatchEvent(new window.Event('click',{bubbles:true}));
 assert.ok(preview.querySelector('[data-v243-calendar-day="2026-10-01"]'));
});

test('rolling dates cross year and leap-month boundaries correctly',()=>{
 const {document,window}=setup(),field=document.getElementById('job_booking_date'),preview=document.querySelector('.bookingAvailabilityWorkspace');
 for(const [start,next] of [['2026-12-29','2027-01-04'],['2028-02-28','2028-03-01']]){
  field.value=start;field.dispatchEvent(new window.Event('change'));
  assert.ok(preview.querySelector('[data-v243-calendar-day="'+next+'"]'));
 }
 assert.ok(preview.querySelector('[data-v243-calendar-day="2028-02-29"]'));
});

