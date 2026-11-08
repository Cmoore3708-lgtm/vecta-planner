import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
function load(name,c){const start=html.indexOf(`function ${name}(`);vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),c);}
test('unknown tyre size clears previous size, brand and price, permits continuation and survives review/booking notes',()=>{
 const {document}=parseHTML('<div class="tyre-picker"><input data-tyre-part value="225"><input data-tyre-part value="40"><input data-tyre-part value="18"></div>');
 const form={parts_preference:'budget',job_types:['Tyres'],tyre_size:'225/40R18',tyre_choice:'Premium',tyre_brand:'Old brand',tyre_guide:{totalPence:40000},tyre_positions:['FL','FR'],tyre_quantity:2};
 const calls=[],state={step:2,form},c={document,state,tyreLookup:{update:(...args)=>calls.push(args)},refreshTyrePanel(){},renderActions(){},isNevosEligibleVehicle:()=>false,workDescriptionRequired:()=>false};vm.createContext(c);
 for(const name of ['chooseUnknownTyreSize','valid','tyreReviewHtml','tyreBookingDescription'])load(name,c);
 c.chooseUnknownTyreSize();assert.equal(form.tyre_size_unknown,true);assert.equal(form.tyre_size,'');assert.equal(form.tyre_choice,'');assert.equal(form.tyre_guide,null);assert.equal(form.tyre_brand,'');assert.equal(form.tyre_positions.length,0);assert.equal(c.valid(),true);
 assert.ok([...document.querySelectorAll('input')].every(x=>x.value===''));assert.equal(document.querySelector('.tyre-picker').classList.contains('size-unknown'),true);assert.deepEqual(calls,[['',1]]);
 assert.match(c.tyreReviewHtml(),/contact you when we have your car/);assert.doesNotMatch(c.tyreReviewHtml(),/400|Premium|225/);assert.match(c.tyreBookingDescription(),/Contact the customer/);assert.match(html,/f\.job_types\.includes\('Tyres'\)&&\(f\.tyre_choice\|\|f\.tyre_size_unknown\)\?tyreBookingDescription/);
 form.tyre_size_unknown=false;assert.equal(Boolean(c.valid()),false);
});
test('all five booking steps retain a Back button, including direct registration entry and invalid initial forms',()=>{
 for(const step of [1,2,3,4,5])for(const valid of [true,false]){
  const {document}=parseHTML('<div id="actions"></div>');let renders=0;
  const state={step,lookup:'idle',form:{job_types:['Tyres']}},window={location:{href:''}},c={document,state,window,haynesState:{status:'idle'},directBooking:true,bookingMissingRequirements:()=>[],valid:()=>valid,render:()=>renders++,submit(){}};vm.createContext(c);load('renderActions',c);c.renderActions();
  const back=document.querySelector('#back');assert.equal(document.getElementById('actions').firstElementChild,back);assert.equal(back.textContent,'Back');back.click();
  if(step===1){assert.equal(window.location.href,'/');assert.equal(state.step,1);}else{assert.equal(state.step,step-1);assert.equal(renders,1);}
 }
});
test('photo help offers camera, upload and unknown buttons and an accessible reassurance popup',()=>{
 const {document,MutationObserver}=parseHTML('<html><body><main id="app"><div id="host"></div></main></body></html>');const create=document.createElement.bind(document);let opened=0,chosen=0;
 document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>opened++;el.close=()=>el.onclose();}return el;};
 const c={document,MutationObserver,setTimeout,clearTimeout,URL:{revokeObjectURL(){}}};c.window=c;vm.runInNewContext(fs.readFileSync('public/js/vecta-tyre-photo.js','utf8'),c);
 c.VectaTyrePhoto.mount(document.getElementById('host'),()=>{},()=>chosen++);
 const buttons=[...document.querySelectorAll('.tyre-photo-actions button')];assert.deepEqual(buttons.map(x=>x.textContent),['Take photo','Upload photo','I don’t know']);assert.equal(document.querySelector('[data-photo-camera-input]').getAttribute('capture'),'environment');assert.equal(document.querySelector('[data-photo-upload-input]').hasAttribute('capture'),false);
 buttons[2].click();assert.equal(chosen,1);assert.equal(opened,1);const dialog=document.querySelector('dialog');assert.equal(dialog.querySelector('p').textContent,'That’s OK, we will contact you when we have your car to discuss your options');dialog.querySelector('button').click();assert.equal(document.querySelector('dialog'),null);
});

test('final review requires explicit parts and serious-repair choices for every work type',()=>{
 for(const types of [['Service'],['MOT'],['Other'],['Tyres'],['MOT','Service']]){
 const {document}=parseHTML('<div id="actions"></div>');let submissions=0;
 const c={document,state:{step:5,form:{job_types:types,parts_range:'',parts_preference:'',serious_repair_choice:''}},bookingMissingRequirements:()=>[],submit:()=>submissions++};vm.createContext(c);
 for(const name of ['partsRangeHtml','seriousRepairChoiceHtml','valid','renderActions'])load(name,c);
 assert.equal((c.partsRangeHtml().match(/type="radio"/g)||[]).length,3);assert.doesNotMatch(c.partsRangeHtml(),/checked/);assert.doesNotMatch(c.seriousRepairChoiceHtml(),/checked/);
 c.renderActions();assert.equal(document.getElementById('send').disabled,true);
 c.state.form.parts_preference='mid_range';c.renderActions();assert.equal(document.getElementById('send').disabled,true);
 c.state.form.serious_repair_choice='book_later';c.renderActions();
 const send=document.getElementById('send');assert.equal(send.disabled,false);send.click();assert.equal(submissions,1);assert.ok(document.getElementById('back'));
 }
});
