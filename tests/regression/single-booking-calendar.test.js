import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync('website/booking/index.html','utf8');
function fn(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}
function setup(types){const {document}=parseHTML('<html><body></body></html>');const context={document,state:{step:3,lookup:'success',mot_calendar_month:'',form:{job_types:types,mot_advisories:['Tyre worn'],inspect_mot_advisories:'',completion_deadline:'',available_slots:[{date:'2026-10-23',time:'08:00',technician:'Alfie'},{date:'2026-11-03',time:'09:00',technician:'Chris'}]}},esc:x=>x,prettyDate:x=>x,isMotBooking:()=>types.includes('MOT')};vm.createContext(context);vm.runInContext(['monthKey','calendarMonthLabel','shiftMonth','motCalendarHtml','advisoryListHtml','advisoryQuestionHtml','stepHtml','bindV137'].map(fn).join('\n'),context);context.render=()=>{document.body.innerHTML=context.stepHtml();context.bindV137()};context.render();return context;}
test('every work type uses one calendar and no appointment list or later calendar',()=>{
 for(const types of [['Service'],['Tyres'],['Other'],['MOT'],['MOT','Service']]){
  const c=setup(types),doc=c.document;
  assert.equal(doc.querySelectorAll('.mot-calendar').length,1);
  assert.equal(doc.querySelectorAll('[data-slot],.future-calendar').length,0);
  assert.equal(doc.querySelector('h2').textContent,'Choose your date');
  assert.match(doc.querySelector('.step>p')?.textContent||doc.querySelector('h2+p').textContent,types.includes('MOT')?/9 days/:/48 hours/);
  assert.equal(doc.querySelectorAll('[data-mot-date]').length,1);
  const day=doc.querySelector('[data-mot-date]');day.onclick();
  assert.equal(c.state.form.appointment_date,'2026-10-23');assert.equal(c.state.form.technician,'Alfie');assert.equal(c.state.form.appointment_time,'08:00');
  doc.querySelector('[data-change-mot-date]').onclick();assert.equal(c.state.form.appointment_date,'');
  doc.querySelector('[data-mot-month="2026-11"]').onclick();doc.querySelector('[data-mot-date]').onclick();
  assert.equal(c.state.form.appointment_date,'2026-11-03');assert.equal(c.state.form.technician,'Chris');
 }
});
test('empty availability prevents date selection and advisories remain answerable',()=>{
 const c=setup(['Tyres']);c.state.form.available_slots=[];c.render();assert.equal(c.document.querySelector('[data-mot-date]'),null);
 assert.match(c.document.querySelector('.notice').textContent,/no online dates available/);
 assert.equal(c.document.querySelector('.appointment-advisories>b').textContent,'THESE ADVISORIES WERE RECOMMENDED ON YOUR LAST MOT');
 assert.match(source,/\.advisories\.appointment-advisories>b\{color:#000;font-size:14px/);
 assert.match(source,/\.advisories ul\{font-weight:400\}/);
});
