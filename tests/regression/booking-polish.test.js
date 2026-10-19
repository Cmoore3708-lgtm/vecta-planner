import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function calendar(form={}){const context=vm.createContext({state:{form:{registration:'AB12 CDE',vehicle:'Toyota Hilux',job_types:['MOT','Other'],work_required:'Rattle on braking',...form}},esc});vm.runInContext(html.slice(html.indexOf('function calendarEscape('),html.indexOf('async function submit(')),context);return context;}
test('homepage leads with the workshop photo and retains four booking choices',()=>{
 const {document}=parseHTML(fs.readFileSync('website/index.html','utf8'));
 const hero=document.querySelector('.hero');assert.ok(hero.querySelector('.heroText .bookingRegForm'));assert.equal(hero.querySelector('.heroText').previousElementSibling,hero.querySelector('.heroPhoto'));
 assert.equal(hero.querySelectorAll('[data-home-type]').length,4);assert.equal(hero.querySelectorAll('.bookingRegForm').length,1);
});
test('progress labels identify the current step and completed steps at every stage',()=>{
 const context=vm.createContext({state:{step:1}});vm.runInContext(html.slice(html.indexOf('function bookingProgressHtml('),html.indexOf('function render(')),context);
 for(let step=1;step<=5;step++){context.state.step=step;const {document}=parseHTML(context.bookingProgressHtml());const items=[...document.querySelectorAll('li')];assert.deepEqual(items.map(item=>item.lastElementChild.textContent),['Your car','Work','Date','Details','Confirm']);assert.equal(document.querySelectorAll('[aria-current="step"]').length,1);assert.equal(items[step-1].getAttribute('aria-current'),'step');assert.equal(document.querySelectorAll('.on').length,step);}
});
test('calendar imports as an all-day event on the exact date across clock changes and year boundaries',()=>{
 const c=calendar();for(const [date,end] of [['2026-10-24','20261025'],['2026-10-25','20261026'],['2026-12-31','20270101'],['2028-02-29','20280301']]){const content=c.bookingCalendarContent(date,'test-request');assert.match(content,new RegExp('DTSTART;VALUE=DATE:'+date.replaceAll('-','')));assert.match(content,new RegExp('DTEND;VALUE=DATE:'+end));assert.match(content,/UID:test-request@vectamotors.co.uk/);assert.match(content,/STATUS:CONFIRMED/);assert.match(content,/Vecta Motors/);assert.doesNotMatch(content,/DTSTART[^\r\n]*T\d/);assert.ok(content.endsWith('END:VCALENDAR\r\n'));}
 for(const date of ['2026-02-30','2026-13-01','2026-2-01','2026-10-25\r\nATTENDEE:evil','',undefined])assert.equal(c.bookingCalendarContent(date,'test'),'');
});
test('calendar escapes customer notes and folds Unicode lines to valid UTF-8 lengths',()=>{
 const c=calendar({job_types:['Service','Tyres','Other'],service_choice:'Full Service',tyre_size:'225/45 R18',tyre_choice:'Premium',work_required:'Noise, bumps; check \\ exhaust\r\nBEGIN:VEVENT\n'+ 'é🚗'.repeat(80)});
 const content=c.bookingCalendarContent('2026-11-03','stable-id');const unfolded=content.replace(/\r\n /g,'');assert.match(unfolded,/Full Service\\, Tyres\\, Something else/);assert.match(unfolded,/225\/45 R18/);assert.match(unfolded,/Noise\\, bumps\\; check \\\\ exhaust\\nBEGIN:VEVENT\\n/);assert.equal(content.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);for(const line of content.split('\r\n'))assert.ok(Buffer.byteLength(line,'utf8')<=75);
});
test('confirmation shortcuts download a calendar and open the same directions used by the homepage',()=>{
 const c=calendar();const {document}=parseHTML(c.bookingReceiptActionsHtml('2026-11-03','receipt'));
 const a=document.querySelector('.receipt-calendar');assert.equal(a.textContent.trim(),'＋ Add to calendar');assert.equal(a.getAttribute('download'),'Vecta-AB12CDE-2026-11-03.ics');const content=decodeURIComponent(a.getAttribute('href').split(',').slice(1).join(','));assert.match(content,/DTSTART;VALUE=DATE:20261103/);
 const directions=document.querySelector('.receipt-directions');const home=parseHTML(fs.readFileSync('website/index.html','utf8')).document;assert.equal(directions.getAttribute('href'),home.querySelector('.locationMapLink').getAttribute('href'));assert.equal(directions.getAttribute('target'),'_blank');assert.match(directions.getAttribute('rel'),/noopener/);
 assert.equal(parseHTML(c.bookingReceiptActionsHtml('', 'receipt')).document.querySelector('.receipt-calendar'),null);
 assert.match(html,/bookingReceiptActionsHtml\(d\.date,d\.request_id\)/);
});
