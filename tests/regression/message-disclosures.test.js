import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const titles=readFileSync('public/js/vecta-message-summary.js','utf8');
const titleContext={window:{}};vm.runInNewContext(titles,titleContext);
const title=titleContext.window.VectaMessageSummary.title;
test('old confirmations and reminders receive useful headings without mistaking customer text for email types',()=>{
 assert.equal(title({kind:'correspondence',message:'We are pleased to confirm your booking on Thu, 12 Nov 2026 for Other.'}),'Initial booking confirmation');
 assert.equal(title({kind:'correspondence',message:'Your booking is confirmed\n\nAB12 CDE'}),'Initial booking confirmation');
 assert.equal(title({kind:'correspondence',message:'Hi Chris,\n\nThis is a reminder that your car is booked in at VECTA tomorrow.'}),'Booking reminder');
 assert.equal(title({kind:'message',actor:'customer',message:'Can I have a booking reminder?'}),'Customer message');
 assert.equal(title({kind:'correspondence',message:'The parts have arrived.'}),'Workshop message');
 assert.equal(title({kind:'approval_response',details:{status:'declined'}}),'Work not authorised');
});
test('customer conversation hides message bodies initially and keeps an opened email open after a new message arrives',async()=>{
 const {window,document}=parseHTML(readFileSync('public/track.html','utf8'));document.hidden=false;
 const data={booking:{registration:'TEST001',booking_date:'2026-11-12',can_message:true},events:[{id:'confirmation',seq:1,kind:'correspondence',actor:'workshop',created_at:'2026-11-11T09:00:00Z',message:'Your booking is confirmed\n\nFull message with parking instructions.'}],approvals:[],original:null};
 const c={window,document,location:{hash:'#fixture',search:''},Intl,Date,URLSearchParams,AbortSignal,clearTimeout(){},setTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
 vm.runInNewContext(titles+'\n'+readFileSync('public/js/vecta-customer-portal.js','utf8'),c);await new Promise(r=>setImmediate(r));
 const card=()=>document.querySelector('[data-event-id="confirmation"]');
 assert.equal(card().tagName,'DETAILS');assert.equal(card().hasAttribute('open'),false);
 assert.equal(card().querySelector('summary strong').textContent,'Initial booking confirmation');
 assert.doesNotMatch(card().querySelector('summary').textContent,/parking instructions/);
 assert.match(card().querySelector('.portalEventBody').textContent,/parking instructions/);
 card().setAttribute('open','');data.events.push({id:'reminder',seq:2,kind:'correspondence',actor:'workshop',created_at:'2026-11-12T09:00:00Z',message:'This is a reminder that your car is booked in tomorrow.'});
 await window.VectaCustomerPortal.refresh();
 assert.equal(card().hasAttribute('open'),true);const newest=document.querySelector('.portalEvent');assert.equal(newest.dataset.eventId,'reminder');assert.equal(newest.hasAttribute('open'),false);assert.equal(newest.querySelector('summary strong').textContent,'Booking reminder');
});
test('saved job types collapse without losing selected types; new jobs, quotes and provisional bookings stay open',()=>{
 const html=readFileSync('index.html','utf8'),expression=html.split('\n').find(line=>line.startsWith("'<details class=\"jobTypesDisclosure\"" )).replace(/\+$/,'');
 for(const [id,status,open] of [['job-1','booked',false],['job-1','in_progress',false],['job-1','completed',false],[null,'booked',true],['quote-1','quote',true],['provisional-1','provisional',true]]){
  const content=vm.runInNewContext(expression,{id,j:{status},templateNames:['MOT','Full Service'],templateSource:{},selectedTypes:['MOT'],normaliseJobTypeKey:v=>v.toLowerCase(),jobTypeInlineStyle:()=>'',esc:v=>v});
  const {document}=parseHTML(content),details=document.querySelector('.jobTypesDisclosure');assert.equal(details.hasAttribute('open'),open,`${id} ${status}`);
  assert.equal(details.querySelector('summary').textContent,'Job Types');assert.equal(details.querySelectorAll('[data-template]').length,2);assert.equal(details.querySelector('.selected').dataset.template,'MOT');
 }
});
