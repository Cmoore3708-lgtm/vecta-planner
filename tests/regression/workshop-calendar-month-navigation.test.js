import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function installNewJobAvailabilityCalendar('),html.indexOf('\nfunction previousVehicleWork('));
test('month navigation reaches November from October even from the 31st, and returns one month at a time',()=>{
 const {document}=parseHTML('<html><body><div class="jobSectionGrid"><input id="job_booking_date" value="2026-10-31"></div></body></html>');
 const ctx={document,app:{jobs:[],settings:{mechanics:['Alfie','Chris','Anyone']}},selectedIso:()=> '2026-10-31',todayIso:()=> '2026-10-22',esc:String,mechanicHours:()=>0,niceDate:String,plannerTechnicianLane:String,byTime:()=>0};
 vm.runInNewContext(source,ctx);ctx.installNewJobAvailabilityCalendar(true);
 const preview=document.querySelector('.bookingAvailabilityWorkspace');
 const title=()=>preview.querySelector('.v243MonthHead strong').textContent;
 const click=selector=>preview.onclick({target:preview.querySelector(selector),stopPropagation(){}});
 assert.equal(title(),'October 2026');click('[data-v243-next-month]');assert.equal(title(),'November 2026');
 assert.ok(preview.querySelector('[data-v243-calendar-day="2026-11-02"]'));
 click('[data-v243-next-month]');assert.equal(title(),'December 2026');click('[data-v243-prev-month]');assert.equal(title(),'November 2026');
});
