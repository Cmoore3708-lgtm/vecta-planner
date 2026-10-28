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
