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
test('customer emails stay as links and open in a separate view through refresh, close and reopen',async()=>{
 const {window,document}=parseHTML(readFileSync('public/track.html','utf8'));document.hidden=false;
 const data={booking:{registration:'TEST001',booking_date:'2026-11-12',can_message:true},events:[{id:'confirmation',seq:1,kind:'correspondence',actor:'workshop',created_at:'2026-11-11T09:00:00Z',message:'Your booking is confirmed\n\nFull message with parking instructions. https://www.vectamotors.co.uk/track#private-token',details:{delivery:'prepared'}},{id:'note',seq:2,kind:'note',created_at:'2026-11-11T10:00:00Z',message:'Please leave your locking wheel nut key.'}],approvals:[],original:null};
 const dialog=document.getElementById('portalEmailDialog');let shows=0,focusId=null;
 dialog.showModal=()=>{shows++;dialog.open=true;};dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'));};
 const c={window,document,location:{hash:'#fixture',search:''},Intl,Date,URLSearchParams,AbortSignal,clearTimeout(){},setTimeout(){},fetch:async()=>({ok:true,json:async()=>data})};
 vm.runInNewContext(titles+'\n'+readFileSync('public/js/vecta-customer-portal.js','utf8'),c);await new Promise(r=>setImmediate(r));
 const card=()=>document.querySelector('[data-event-id="confirmation"]'),body=document.getElementById('portalEmailBody');
 assert.equal(card().tagName,'ARTICLE');assert.equal(card().querySelector('.portalEventBody'),null);
 assert.equal(card().querySelector('button strong').textContent,'Initial booking confirmation');
 assert.equal(card().querySelector('button').getAttribute('aria-haspopup'),'dialog');
 assert.doesNotMatch(document.getElementById('portalHistory').textContent,/parking instructions/);assert.equal(body.children.length,0);
 const note=document.querySelector('[data-event-id="note"]');assert.equal(note.tagName,'DETAILS');assert.equal(note.hasAttribute('open'),false);note.setAttribute('open','');
 card().querySelector('button').click();assert.equal(shows,1);assert.equal(dialog.open,true);
 assert.equal(document.getElementById('portalEmailTitle').textContent,'Initial booking confirmation');
 assert.match(body.textContent,/parking instructions/);assert.match(body.textContent,/Email draft prepared/);assert.doesNotMatch(body.textContent,/private-token/);
 data.events.push({id:'reminder',seq:3,kind:'correspondence',actor:'workshop',created_at:'2026-11-12T09:00:00Z',message:'This is a reminder that your car is booked in tomorrow.'});
 await window.VectaCustomerPortal.refresh();assert.equal(dialog.open,true);assert.equal(shows,1);assert.match(body.textContent,/parking instructions/);
 assert.equal(document.querySelector('[data-event-id="note"]').hasAttribute('open'),true);
 const newest=document.querySelector('.portalEvent');assert.equal(newest.dataset.eventId,'reminder');assert.equal(newest.querySelector('button strong').textContent,'Booking reminder');assert.equal(newest.querySelector('.portalEventBody'),null);
 card().querySelector('button').focus=()=>{focusId='confirmation';};document.getElementById('portalEmailClose').click();
 assert.equal(dialog.open,false);assert.equal(body.children.length,0);assert.equal(focusId,'confirmation');
 newest.querySelector('button').click();assert.equal(shows,2);assert.equal(document.getElementById('portalEmailTitle').textContent,'Booking reminder');assert.match(body.textContent,/booked in tomorrow/);assert.doesNotMatch(body.textContent,/parking instructions/);
 dialog.close();assert.equal(body.children.length,0);
});
test('saved job types collapse without losing selected types; new jobs, quotes and provisional bookings stay open',()=>{
 const html=readFileSync('index.html','utf8'),expression=html.split('\n').find(line=>line.startsWith("'<details class=\"jobTypesDisclosure\"" )).replace(/\+$/,'');
 for(const [id,status,open] of [['job-1','booked',false],['job-1','in_progress',false],['job-1','completed',false],[null,'booked',true],['quote-1','quote',true],['provisional-1','provisional',true]]){
  const content=vm.runInNewContext(expression,{id,j:{status},templateNames:['MOT','Full Service'],templateSource:{},selectedTypes:['MOT'],normaliseJobTypeKey:v=>v.toLowerCase(),jobTypeInlineStyle:()=>'',esc:v=>v});
  const {document}=parseHTML(content),details=document.querySelector('.jobTypesDisclosure');assert.equal(details.hasAttribute('open'),open,`${id} ${status}`);
  assert.equal(details.querySelector('summary').textContent,'Job Types');assert.equal(details.querySelectorAll('[data-template]').length,2);assert.equal(details.querySelector('.selected').dataset.template,'MOT');
 }
});
