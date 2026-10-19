import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fn(name,next){return html.slice(html.indexOf('function '+name+'('),html.indexOf('function '+next+'('));}
test('homepage has four choices and carries combined selections into booking',()=>{
 const home=fs.readFileSync('website/index.html','utf8');
 const {document}=parseHTML(home);const cards=[...document.querySelectorAll('[data-home-type]')];
 assert.deepEqual(cards.map(c=>c.dataset.homeType),['Service','MOT','Tyres','Other']);
 assert.deepEqual(cards.map(c=>c.querySelector('h3').textContent.toLowerCase()),['service','mot','tyres','something else']);
 const window={location:{href:''}};const context=vm.createContext({window,BOOKING_URL:'/booking/',selectedWorkTypes:new Set(['MOT','Other']),VectaBookingTransfer:{show(){}},requestAnimationFrame:fn=>fn()});
 const start=home.indexOf('  function cleanReg('),end=home.indexOf('  function toggleWorkCard(');
 vm.runInContext(home.slice(start,end),context);assert.equal(context.goToBooking('AB12 CDE'),true);
 const url=new URL(window.location.href,'https://example.test');assert.equal(url.searchParams.get('types'),'MOT,Other');assert.equal(url.searchParams.get('reg'),'AB12CDE');
});
test('legacy brakes and diagnostics links select Something else once',()=>{
 const source=html.slice(html.indexOf('const bookingParams='),html.indexOf('const state='))+'globalThis.chosen=suppliedTypes;';
 const context=vm.createContext({URLSearchParams,window:{location:{search:'?types=Brakes,Diagnostics%20%2F%20warning%20light,Other,MOT,invalid'}}});
 vm.runInContext(source,context);assert.deepEqual(Array.from(context.chosen),['Other','MOT']);
});
test('booking shows four accessible choices and retains NEVOS restriction',()=>{
 const context=vm.createContext({state:{form:{job_types:['MOT','Other']}},esc});vm.runInContext(fn('workTypeCardsHtml','stepHtml'),context);
 const {document}=parseHTML(context.workTypeCardsHtml(true));const cards=[...document.querySelectorAll('[data-type]')];
 assert.deepEqual(cards.map(c=>c.dataset.type),['Service','MOT','Tyres','Other']);assert.equal(cards[0].hasAttribute('disabled'),true);assert.equal(cards[3].getAttribute('aria-pressed'),'true');assert.equal(cards[3].querySelector('strong').textContent,'Something else');
});
test('Something else requires a description while Service and MOT retain their rules',()=>{
 const form={job_types:['Other'],work_required:'',mot_advisories:[]};const context=vm.createContext({state:{step:2,form},isNissanVehicle:()=>false});
 vm.runInContext(fn('workDescriptionRequired','valid')+html.match(/function valid\(\)\{.*\}/)[0],context);
 assert.equal(Boolean(context.valid()),false);form.work_required='Rattle when braking';assert.equal(Boolean(context.valid()),true);
 form.job_types=['MOT'];form.work_required='';assert.equal(Boolean(context.valid()),true);
 form.job_types=['MOT','Other'];assert.equal(Boolean(context.valid()),false);
});
test('receipt preserves the already rendered vehicle image, chosen service, tyres and escaped problem details',()=>{
 const {document}=parseHTML('<div class="vehicle-photo"><figure class="haynes-image"><img src="data:image/svg+xml,coloured-car" data-vehicle-ready="1" alt="Blue Nissan Qashqai"></figure></div>');
 const form={registration:'AB12 CDE',vehicle:'Nissan Qashqai',job_types:['Service','MOT','Tyres','Other'],service_choice:'Full Service',tyre_size:'225/45 R18',tyre_choice:'Premium',work_required:'Noise <script>alert(1)</script>\non braking',inspect_mot_advisories:'yes',mot_advisories:['Brake pads worn']};
 const context=vm.createContext({document,state:{form},esc});vm.runInContext(fn('bookingConfirmationSummaryHtml','submit').replace(/async $/,''),context);
 let receipt=parseHTML(context.bookingConfirmationSummaryHtml()).document;
 assert.equal(receipt.querySelector('img').getAttribute('src'),'data:image/svg+xml,coloured-car');assert.match(receipt.textContent||receipt.toString(),/AB12 CDE/);assert.match(receipt.toString(),/Full Service, MOT, Tyres, Something else/);assert.match(receipt.toString(),/225\/45 R18 · Premium/);assert.equal(receipt.querySelector('script'),null);assert.match(receipt.toString(),/Brake pads worn/);
 document.querySelector('figure').remove();receipt=parseHTML(context.bookingConfirmationSummaryHtml()).document;assert.equal(receipt.querySelector('img'),null);assert.match(receipt.toString(),/Nissan Qashqai/);
});
