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
 const form={parts_preference:'mid_range',job_types:['Other'],work_required:'',mot_advisories:[]};const context=vm.createContext({state:{step:2,form},isNevosEligibleVehicle:()=>false});
 vm.runInContext(fn('workDescriptionRequired','valid')+html.match(/function valid\(\)\{.*\}/)[0],context);
 assert.equal(Boolean(context.valid()),false);form.work_required='Rattle when braking';assert.equal(Boolean(context.valid()),true);
 form.job_types=['MOT'];form.work_required='';assert.equal(Boolean(context.valid()),true);
 form.job_types=['MOT','Other'];assert.equal(Boolean(context.valid()),false);
});
test('receipt preserves the already rendered vehicle image, chosen service, tyres and escaped problem details',()=>{
 const {document}=parseHTML('<div class="vehicle-photo"><figure class="haynes-image"><img src="data:image/svg+xml,coloured-car" data-vehicle-ready="1" alt="Blue Nissan Qashqai"></figure></div>');
 const form={parts_preference:'mid_range',registration:'AB12 CDE',vehicle:'Nissan Qashqai',job_types:['Service','MOT','Tyres','Other'],service_choice:'Full Service',tyre_size:'225/45 R18',tyre_choice:'Premium',work_required:'Noise <script>alert(1)</script>\non braking',inspect_mot_advisories:'yes',mot_advisories:['Brake pads worn']};
 const context=vm.createContext({document,state:{form},esc,selectedTyreGuide:()=>null,savedTyreGuide:()=>null});vm.runInContext(fn('tyreReviewHtml','partsRangeHtml')+fn('bookingConfirmationSummaryHtml','submit').replace(/async $/,''),context);
 let receipt=parseHTML(context.bookingConfirmationSummaryHtml()).document;
 assert.equal(receipt.querySelector('img').getAttribute('src'),'data:image/svg+xml,coloured-car');assert.match(receipt.textContent||receipt.toString(),/AB12 CDE/);assert.match(receipt.toString(),/Full Service, MOT, Tyres, Something else/);assert.match(receipt.toString(),/225\/45 R18/);assert.match(receipt.toString(),/Premium/);assert.equal(receipt.querySelector('script'),null);assert.match(receipt.toString(),/Brake pads worn/);
 document.querySelector('figure').remove();receipt=parseHTML(context.bookingConfirmationSummaryHtml()).document;assert.equal(receipt.querySelector('img'),null);assert.match(receipt.toString(),/Nissan Qashqai/);
});

test('Something else shows the customer car without wheel effects, examples and a closed NEVOS disclosure',()=>{
 const form={parts_preference:'mid_range',job_types:['Other'],registration:'CM14KEL',vehicle:'Nissan Qashqai',vehicle_colour:'white'};
 const context=vm.createContext({state:{form},haynesState:{vehicle:{imageUrl:'https://www.haynespro-assets.com/workshop/images/319106279.svg',make:'Nissan',model:'Qashqai'}},esc});
 vm.runInContext(fn('otherWorkOptionsHtml','workTypeCardsHtml'),context);
 const {document}=parseHTML(context.otherWorkOptionsHtml()),image=document.querySelector('img');
 assert.equal(image.dataset.registration,'CM14KEL');assert.equal(image.dataset.colour,'white');assert.equal(image.dataset.vehicleSource,'https://www.haynespro-assets.com/workshop/images/319106279.svg');
 assert.equal(document.querySelector('.tp-wheels,[data-tyre-car],[data-service-car],[data-tyre-position]'),null);
 assert.deepEqual([...document.querySelectorAll('#other-work-help>li')].map(x=>x.textContent),['ECU remaps','Bodywork repairs','Diagnostics','Exhausts','Brakes','Suspension','Towbars','Valeting','Batteries','Puncture repairs']);
 const details=document.querySelector('details');assert.equal(details.querySelector('summary').textContent,'NEVOS?');assert.equal(details.hasAttribute('open'),false);
 assert.equal(details.querySelectorAll('li').length,7);assert.match(details.textContent,/Pre handover valet & inspection/);assert.match(details.textContent,/literally works magic on dents/);assert.match(details.textContent,/OEM standard/);assert.match(details.textContent,/We aren’t able to service your NEVOS/);
 form.job_types=['Tyres','Other'];
 const combined=parseHTML(context.otherWorkOptionsHtml()).document;
 assert.equal(combined.querySelector('img'),null,'Tyres selected: avoid repeating the customer car in Something else');assert.equal(combined.querySelectorAll('#other-work-help>li').length,10);assert.ok(combined.querySelector('details summary'));
 form.job_types=['Other'];assert.ok(parseHTML(context.otherWorkOptionsHtml()).document.querySelector('img'),'deselecting Tyres restores the Something else car');
 form.job_types=['Tyres'];assert.ok(parseHTML(context.otherWorkOptionsHtml()).document.querySelector('#otherWorkTitle'));assert.equal(parseHTML(context.otherWorkOptionsHtml()).document.querySelector('img'),null);
});

test('Something else omits missing or unsafe artwork while keeping the service examples and NEVOS information',()=>{
 for(const imageUrl of ['', 'https://example.com/not-your-car.svg']){
 const context=vm.createContext({state:{form:{job_types:['Other']}},haynesState:{vehicle:{imageUrl}},esc});vm.runInContext(fn('otherWorkOptionsHtml','workTypeCardsHtml'),context);
 const {document}=parseHTML(context.otherWorkOptionsHtml());assert.equal(document.querySelector('img'),null);assert.equal(document.querySelectorAll('#other-work-help>li').length,10);assert.ok(document.querySelector('details summary'));
 }
});

test('NEVOS question and required answer apply only to Nissan Qashqai and Juke variants',()=>{
 const examples=[
  [{vehicle_make:'NISSAN',vehicle:'QASHQAI TEKNA E-POWER AUTO'},true],
  [{vehicle_make:'nissan',vehicle:'Juke N-Connecta'},true],
  [{vehicle:'Nissan Qashqai+2'},true],
  [{vehicle_make:'Nissan',vehicle:'Nissan',haynes_identity:{make:'Nissan',model:'Juke',vehicle:'Nissan Juke 1.0'}},true],
  [{vehicle_make:'NISSAN',vehicle:'LEAF'},false],
  [{vehicle_make:'NISSAN',vehicle:'MICRA'},false],
  [{vehicle_make:'NISSAN',vehicle:'X-TRAIL'},false],
  [{vehicle_make:'NISSAN',vehicle:'NOTE'},false],
  [{vehicle_make:'Toyota',vehicle:'Toyota Corolla'},false],
  [{vehicle_make:'Toyota',vehicle:'Juke'},false],
  [{vehicle_make:'Nissan',vehicle:'Nissan'},false],
  [{vehicle:'Qashqai'},false]
 ];
 for(const [identity,expected] of examples){
  const form={parts_preference:'mid_range',...identity,job_types:['MOT'],work_required:'',nevos_vehicle:''};
  const context=vm.createContext({state:{step:2,form},workDescriptionRequired:()=>false});
  vm.runInContext(fn('isNevosEligibleVehicle','isMotBooking')+fn('nevosHtml','workDescriptionRequired')+html.match(/function valid\(\)\{.*\}/)[0],context);
  assert.equal(context.isNevosEligibleVehicle(),expected,JSON.stringify(identity));assert.equal(context.nevosHtml().includes('Is this a NEVOS vehicle?'),expected);
  assert.equal(Boolean(context.valid()),!expected,'Only eligible models must answer before continuing');
  form.nevos_vehicle='no';assert.equal(Boolean(context.valid()),true);assert.equal(context.nevosHtml(),'');
 }
});


test('other work examples show for every work selection with the existing car rule',()=>{
 for(const job_types of [[],['Service'],['MOT'],['Tyres'],['Other'],['Service','Tyres']]){
  const context=vm.createContext({state:{form:{job_types}},haynesState:{vehicle:{make:'Nissan',model:'Juke',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg'}},esc});
  vm.runInContext(fn('otherWorkOptionsHtml','workTypeCardsHtml'),context);
  const {document}=parseHTML(context.otherWorkOptionsHtml());
  assert.equal(document.querySelector('h3').textContent,'Other work we do');
  assert.equal(Boolean(document.querySelector('img')),!job_types.includes('Tyres'));
 }
 assert.ok(html.includes('${otherWorkOptionsHtml()}<label>Describe what work'));
});


test('selecting NEVOS shows the complete priced services panel without opening a disclosure',()=>{
 const form={job_types:[],nevos_vehicle:'yes',registration:'CM14KEL',vehicle:'Nissan Qashqai',vehicle_colour:'white'};
 const context=vm.createContext({state:{form},haynesState:{vehicle:{imageUrl:'https://www.haynespro-assets.com/workshop/images/319106279.svg',make:'Nissan',model:'Qashqai'}},esc});
 vm.runInContext(fn('otherWorkOptionsHtml','workTypeCardsHtml'),context);
 const {document}=parseHTML(context.otherWorkOptionsHtml());
 assert.equal(document.querySelector('h3').textContent,'We offer a range of services for NEVOS customers:');
 assert.equal(document.querySelector('details'),null);
 assert.equal(document.querySelector('img').dataset.registration,'CM14KEL');
 assert.equal(document.querySelector('img').dataset.colour,'white');
 const rows=[...document.querySelectorAll('#other-work-help>li')];
 assert.deepEqual(rows.slice(0,5).map(row=>[row.querySelector('span').textContent,row.querySelector('strong').textContent]),[
  ['Mini valet','£30'],['Pre handover valet & inspection','£50'],['Tyre rotation','£24'],['Puncture repairs','£20'],['New tyres','from £120']
 ]);
 assert.equal(rows[5].querySelector('span').textContent,'Our Paint-less dent repairer literally works magic on dents');
 assert.equal(rows[6].querySelector('span').textContent,'We can repair your NEVOS bodywork damage to OEM standard.');
 assert.doesNotMatch(document.toString(),/ECU remaps/);
 form.job_types=['Tyres'];
 const withTyres=parseHTML(context.otherWorkOptionsHtml()).document;
 assert.equal(withTyres.querySelectorAll('#other-work-help>li').length,7);
 assert.equal(withTyres.querySelector('img'),null,'Tyres already show the customer car');
 form.job_types=['Other'];form.nevos_vehicle='no';
 assert.equal(parseHTML(context.otherWorkOptionsHtml()).document.querySelector('h3').textContent,'Other work we do');
});

test('priced NEVOS rows append distinct description lines, preserve customer notes and select Other work',()=>{
 const {document}=parseHTML('<html><body><main></main></body></html>');
 const form={job_types:['MOT'],nevos_vehicle:'yes',work_required:'Please keep the keys at reception.\nExisting note',parts_preference:'oem'};
 const context=vm.createContext({document,state:{step:2,form},haynesState:{},esc,
  bindServiceExtra(){},bindHaynes(){},bindAdvisoryChoices(){},bindTyreCards(){},bindTyreSearch(){},renderActions(){}});
 vm.runInContext(fn('otherWorkOptionsHtml','workTypeCardsHtml')+fn('bind','bookingMissingRequirements'),context);
 context.render=()=>{document.querySelector('main').innerHTML=context.otherWorkOptionsHtml()+'<textarea data-field="work_required"></textarea>';document.querySelector('[data-field="work_required"]').value=form.work_required;context.bind();};
 context.render();
 const expected=['Mini valet £30','Pre handover valet & inspection £50','Tyre rotation £24','Puncture repairs £20','New tyres from £120'];
 assert.deepEqual([...document.querySelectorAll('[data-nevos-service]')].map(b=>b.dataset.nevosService),expected);
 assert.equal(document.querySelectorAll('.nevos-repair button').length,0);
 for(const line of expected){
  [...document.querySelectorAll('[data-nevos-service]')].find(b=>b.dataset.nevosService===line).click();
  assert.equal(document.querySelector('[data-field="work_required"]').value,form.work_required);
 }
 assert.equal(form.work_required,'Please keep the keys at reception.\nExisting note\n'+expected.join('\n'));
 assert.deepEqual(Array.from(form.job_types),['MOT','Other']);
 document.querySelector('[data-nevos-service]').click();
 assert.equal(form.work_required.split('\n').filter(line=>line===expected[0]).length,1,'Repeated clicks do not duplicate a requested service');
 assert.equal(document.querySelectorAll('.nevos-service-button.added').length,5);
 const description=document.querySelector('[data-field="work_required"]');
 description.value='Customer edited the notes.';description.oninput({target:description});
 assert.equal(document.querySelectorAll('.nevos-service-button.added').length,0,'Manual edits update the added indicators');
 document.querySelector('[data-nevos-service]').click();
 assert.equal(form.work_required,'Customer edited the notes.\nMini valet £30');
 form.work_required='';form.job_types=[];context.render();document.querySelector('[data-nevos-service]').click();
 assert.equal(form.work_required,'Mini valet £30','An empty description gets no leading blank line');
 assert.deepEqual(Array.from(form.job_types),['Other']);
});
