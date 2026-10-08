import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

for (const path of ['public/booking.html','website/booking/index.html']) {
 const html=fs.readFileSync(path,'utf8');
 const valid=html.match(/function valid\(\)\{.*\}/)[0];
 test(`${path}: service bookings require mileage or the explicit unknown choice`,()=>{
  const form={vehicle:'Test vehicle',vehicle_make:'Test',mot_advisories:[],job_types:['Service'],service_choice:'Full Service',mileage:'',mileage_unknown:false};
  const context=vm.createContext({state:{step:2,form},isNissanVehicle:()=>false,workDescriptionRequired:()=>false});
  vm.runInContext(valid,context);
  assert.equal(Boolean(context.valid()),false);
  form.mileage_unknown=true;assert.equal(Boolean(context.valid()),true);
  form.mileage_unknown=false;
  for(const mileage of ['120000','0']) {form.mileage=mileage;assert.equal(Boolean(context.valid()),true);}
  for(const mileage of ['','-1','1.5','Infinity','unknown']) {form.mileage=mileage;assert.equal(Boolean(context.valid()),false);}
  form.mileage_unknown=true;form.service_choice='';assert.equal(Boolean(context.valid()),false);
  form.job_types=['MOT'];assert.equal(Boolean(context.valid()),true);
 });
 test(`${path}: selecting unknown clears stale mileage and unselecting restores the requirement`,()=>{
  const toggle=html.slice(html.indexOf('const unknown=document.querySelector'),html.indexOf(';bindHaynes();',html.indexOf('const unknown=document.querySelector')));
  const checkbox={checked:true};let renders=0;
  const context=vm.createContext({document:{querySelector:()=>checkbox},state:{form:{mileage:'120000',mileage_unknown:false}},render:()=>renders++});
  vm.runInContext(toggle,context);checkbox.onchange();
  assert.equal(context.state.form.mileage,'');assert.equal(context.state.form.mileage_unknown,true);
  checkbox.checked=false;checkbox.onchange();assert.equal(context.state.form.mileage_unknown,false);assert.equal(renders,2);
 });
 test(`${path}: servicing shows last MOT mileage beside current mileage and an accessible checkbox`,()=>{
  const form={job_types:['Service'],last_mot_mileage:'110000',mileage:'',mileage_unknown:true,work_required:''};
  const context=vm.createContext({state:{step:2,form},esc:String,prettyMiles:value=>`${value} miles`,recommendationsHtml:()=>'',workTypeCardsHtml:()=>'',tyreOptionsHtml:()=>'',serviceOptionsHtml:()=>'',workDescriptionRequired:()=>false});
  vm.runInContext(html.slice(html.indexOf('function stepHtml(){'),html.indexOf('function render(){')),context);
  const {document}=parseHTML(context.stepHtml());
  assert.equal(document.querySelector('[aria-label="Mileage at last MOT"]').value,'110000 miles');
  assert.equal(document.querySelector('[data-field="mileage"]').hasAttribute('disabled'),true);
  assert.equal(document.querySelector('[data-mileage-unknown]').hasAttribute('checked'),true);
  assert.match(document.querySelector('.mileage-unknown').textContent,/Unsure of your mileage/);
  form.last_mot_mileage='';assert.match(context.stepHtml(),/Not available/);
 });
 test(`${path}: scripts compile and booking notes preserve the workshop instruction`,()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  assert.match(html,/type="checkbox" data-mileage-unknown/);
  assert.match(html,/work_required:\(f\.job_types\.includes\('Service'\)&&f\.mileage_unknown\?'Current mileage unknown\. Check mileage on arrival/);
 });
}
