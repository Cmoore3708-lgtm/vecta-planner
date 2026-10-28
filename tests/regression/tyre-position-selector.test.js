import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML,DOMParser} from 'linkedom';
const booking=fs.readFileSync('website/booking/index.html','utf8');
const helper=fs.readFileSync('public/js/vecta-tyre-positions.js','utf8');
function setup(){
 const {document}=parseHTML('<html><body><main></main></body></html>');
 const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'Budget',tyre_brand:'FALKEN',nevos_vehicle:'no'};
 const calls=[],root={document,DOMParser,state:{form},haynesState:{vehicle:null},renderActions(){},esc:String,Intl,Date};root.window=root;
 const context=vm.createContext(root);
 vm.runInContext(fs.readFileSync('public/js/vecta-tyre-booking.js','utf8'),context);
 root.VectaTyreBooking.createController=()=>({update:(...args)=>calls.push(args)});
 vm.runInContext(helper,context);
 vm.runInContext(booking.slice(booking.indexOf('let tyreGuideState='),booking.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();
 return {context,root,document,form,calls};
}
test('wheel positions control exact stock quantity, selected total and workshop instructions',()=>{
 const {context,document,form,calls}=setup();
 assert.equal(form.tyre_quantity,0);assert.equal(document.querySelectorAll('#tyrePositions .tp-controls button').length,4);
 assert.equal(document.getElementById('tyreCards').nextElementSibling.id,'tyrePositions');
 document.querySelector('[data-tyre-position="Front passenger"]').click();
 document.querySelector('[data-tyre-position="Rear driver"]').click();
 assert.equal(form.tyre_quantity,2);assert.deepEqual(calls.at(-1),['205/55R16',2]);
 const option={category:'budget',available:true,brand:'FALKEN',model:'TEST',unitPence:8500,totalPence:17000};
 vm.runInContext('tyreGuideState='+JSON.stringify({status:'matched',result:{size:form.tyre_size,quantity:2,checkedAt:new Date().toISOString(),options:[{...option,choices:[option]}]}})+';refreshTyrePanel()',context);
 assert.match(document.querySelector('.tyre-guide-card.selected .tyre-guide-total').textContent,/2 tyres: £170/);
 assert.match(context.tyreBookingDescription(),/Tyre positions: Front passenger, Rear driver/);
 document.querySelector('[data-tyre-position="Front passenger"]').click();assert.equal(form.tyre_quantity,1);assert.equal(context.selectedTyreGuide(),null,'quantity change must clear stale prices');
 document.querySelector('[data-tyre-position="Rear driver"]').click();assert.equal(form.tyre_quantity,0);assert.equal(context.selectedTyreGuide(),null);assert.match(document.querySelector('.tyre-guide-card.selected .tyre-guide-total').textContent,/0 tyres: £0/);
});
test('aligned drawings show four working wheel targets and brand logos; unknown artwork keeps labelled controls',()=>{
 const {context,document,form}=setup();const api=context.VectaTyrePositions;
 const vehicle={imageUrl:'https://www.haynespro-assets.com/workshop/images/319004664.svgz',make:'Nissan',model:'Juke'};
 document.querySelector('main').innerHTML=api.html(form,vehicle);
 const img=document.querySelector('[data-tyre-car]');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 0 282 205"/>');img.dataset.vehicleReady='1';
 let changes=0;api.mount(form,()=>changes++);
 assert.equal(document.querySelectorAll('.tp-wheel').length,4);assert.equal(document.querySelectorAll('.tp-controls button').length,4);
 document.querySelector('.tp-far').click();assert.equal(changes,1);assert.equal(form.tyre_quantity,1);
 api.mount(form,()=>changes++);assert.equal(document.querySelector('.tp-far').getAttribute('aria-pressed'),'true');assert.match(document.querySelector('.tp-far .tp-brand').textContent||document.querySelector('.tp-far .tp-brand img').alt,/FALKEN/);
 assert.ok(document.querySelector('.tp-car-detail').style.maskImage.includes('radial-gradient'));
 vehicle.imageUrl=vehicle.imageUrl.replace('319004664','999999');document.querySelector('main').innerHTML=api.html(form,vehicle);api.mount(form,()=>changes++);assert.equal(document.querySelectorAll('.tp-wheel').length,0);assert.equal(document.querySelectorAll('.tp-controls button').length,4);
});
test('position module and styling are mirrored in both deployed websites',()=>{
 for(const name of ['js/vecta-tyre-positions.js','js/vecta-tyre-positions.css'])assert.deepEqual(fs.readFileSync('public/'+name),fs.readFileSync('website/'+name));
 assert.match(booking,/tyre_positions.length>0/);
 const css=fs.readFileSync('public/js/vecta-tyre-positions.css','utf8');assert.match(css,/\.tyre-position-picker \.tyre-quantity\{display:none\}/);
});
test('the current Qashqai J12 artwork has four aligned, selectable tyre targets',()=>{
 const {context,document,form}=setup(),api=context.VectaTyrePositions;
 document.querySelector('main').innerHTML=api.html(form,{imageUrl:'https://www.haynespro-assets.com/workshop/images/319106279.svgz',make:'Nissan',model:'Qashqai J12'});
 const img=document.querySelector('[data-tyre-car]');
 img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 45 265 155"/>');img.dataset.vehicleReady='1';
 let changes=0;api.mount(form,()=>changes++);
 assert.equal(document.querySelectorAll('.tp-wheel').length,4);
 assert.equal(document.querySelectorAll('.tp-far').length,2);
 const rear=document.querySelector('.tp-far[data-tyre-position="Rear driver"]');
 assert.ok(parseFloat(rear.style.top)>50,'the far rear target sits in the lower body, not near the windows');
 rear.click();assert.equal(changes,1);assert.deepEqual([...form.tyre_positions],['Rear driver']);assert.equal(form.tyre_quantity,1);
 api.mount(form,()=>changes++);assert.equal(document.querySelector('.tp-wheel[data-tyre-position="Rear driver"]').getAttribute('aria-pressed'),'true');
});
test('automatic perspective projection works without a model profile and mirrors front-facing direction',()=>{
 const {context}=setup(),api=context.VectaTyrePositions;
 for(const direction of [1,-1]){
  const front=[direction===1?170:130,160,20,33],rear=[direction===1?260:40,135,10,23];
  const wheels=api.projectWheels(front,rear,null,{x:20,width:260});
  assert.equal(wheels.length,4);assert.ok(wheels.flat().every(Number.isFinite));
  assert.ok((front[0]-wheels[2][0])*direction>0);
  assert.ok((rear[0]-wheels[3][0])*direction>0);
  assert.ok(wheels[3][1]>rear[1]-rear[3],'the far rear wheel stays below the window line');
 }
 const withHidden=api.projectWheels([170,157,20,34],[262,132,11,27],[79,139,15,25],{x:20,width:260});
 assert.equal(withHidden[2][0],79);assert.equal(withHidden[2][1],146.5);
 assert.equal(withHidden[3][0],171);
});
test('late artwork readiness triggers targets even when another image mount returns early',async()=>{
 const {context,root,document,form}=setup();let changed,disconnected=false;
 root.MutationObserver=class{constructor(callback){changed=callback;}observe(){}disconnect(){disconnected=true;}};
 root.VectaVehicleImage={mount:async()=>{}};
 document.querySelector('main').innerHTML=context.VectaTyrePositions.html(form,{imageUrl:'https://www.haynespro-assets.com/workshop/images/319106279.svgz'});
 context.VectaTyrePositions.mount(form,()=>{});await Promise.resolve();
 assert.equal(document.querySelectorAll('.tp-wheel').length,0);
 const img=document.querySelector('[data-tyre-car]');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 45 265 155"/>');img.dataset.vehicleReady='1';
 changed();assert.equal(document.querySelectorAll('.tp-wheel').length,4);assert.equal(disconnected,true);
});
test('brand can be selected before wheels, revealing the car prompt and retaining the brand at zero quantity',()=>{
 const {context,document,form,calls}=setup();form.tyre_brand='';
 const option={category:'budget',available:true,brand:'FALKEN',model:'TEST',unitPence:8500,totalPence:8500};
 vm.runInContext('tyreGuideState='+JSON.stringify({status:'matched',result:{size:form.tyre_size,quantity:1,checkedAt:new Date().toISOString(),options:[{...option,choices:[option]}]}})+';refreshTyrePanel()',context);
 assert.equal(document.getElementById('tyrePositions').hidden,true);assert.equal(document.querySelectorAll('[data-tyre-position]').length,0);
 document.querySelector('.tyre-option[data-tyre-choice="Budget"]').click();assert.equal(document.getElementById('tyrePositions').hidden,true,'range selection alone must not reveal the car');
 document.querySelector('[data-tyre-brand="FALKEN"]').click();
 assert.equal(form.tyre_quantity,0);assert.equal(form.tyre_brand,'FALKEN');
 assert.equal(document.querySelector('[data-tyre-brand="FALKEN"]').getAttribute('aria-pressed'),'true');
 assert.equal(document.getElementById('tyrePositions').hidden,false);
 assert.equal(document.querySelector('.tp-prompt').textContent,'Please select how many tyres you need');
 document.querySelector('[data-tyre-position="Front passenger"]').click();assert.equal(form.tyre_quantity,1);assert.match(document.querySelector('.tyre-guide-card.selected .tyre-guide-total').textContent,/1 tyre: £85/);
 document.querySelector('[data-tyre-position="Front passenger"]').click();assert.equal(form.tyre_quantity,0);assert.deepEqual(calls.at(-1),['205/55R16',1]);
 assert.equal(document.querySelector('[data-tyre-brand="FALKEN"]').getAttribute('aria-pressed'),'true');assert.equal(document.getElementById('tyrePositions').hidden,false);
 document.querySelector('.tyre-option[data-tyre-choice="Premium"]').click();assert.equal(form.tyre_brand,'');assert.equal(document.getElementById('tyrePositions').hidden,true);
 assert.equal(context.selectedTyreGuide(),null,'a new range must not silently choose its first brand');
});
test('commercial or unavailable tyre prices retain an explicit brand-confirmation route',()=>{
 const {context,document,form}=setup();form.tyre_brand='';form.tyre_photo_spec={commercial:true};
 context.refreshTyrePanel();
 const confirm=document.querySelector('[data-tyre-choice="Budget"][data-tyre-brand="Brand to be confirmed"]');assert.ok(confirm);confirm.click();
 assert.equal(form.tyre_brand,'Brand to be confirmed');assert.equal(document.getElementById('tyrePositions').hidden,false);
 document.querySelector('[data-tyre-position="Rear driver"]').click();assert.equal(form.tyre_quantity,1);assert.equal(context.selectedTyreGuide(),null);
});
