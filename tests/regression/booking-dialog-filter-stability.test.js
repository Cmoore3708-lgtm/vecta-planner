import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
function load(name,c){const start=html.indexOf(`function ${name}(`);vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),c);}
test('fuel filter and spark plug choices retain the dropdown, tyre artwork and page while updating the total',()=>{
 for(const kind of ['fuel_filter','spark_plug']){
  const {document}=parseHTML('<div class="tyre-picker"><img></div><select data-service-extra><option value="check">Check</option><option value="replace">Replace</option><option value="none">No</option></select><div class="guide-price-wrap">£100</div>');
  const select=document.querySelector('select'),tyres=document.querySelector('.tyre-picker');let actions=0,renders=0;
  const state={form:{registration:'AB12 CDE'}},c={document,state,serviceExtraKind:()=>kind,pricingHtml:()=>`<div class="guide-price-wrap">£${state.form.service_extra_choice==='replace'?150:100}</div>`,render(){renders++},renderActions(){actions++}};
  vm.createContext(c);load('bindServiceExtra',c);c.bindServiceExtra();
  for(const value of ['replace','none','check']){Object.defineProperty(select,'value',{value,configurable:true});select.onchange();assert.equal(state.form.service_extra_choice,value);assert.equal(document.querySelector('select'),select);assert.equal(document.querySelector('.tyre-picker'),tyres);assert.equal(document.querySelector('.guide-price-wrap').textContent,value==='replace'?'£150':'£100');}
  assert.equal(state.form.service_extra_kind,kind);assert.equal(state.form.service_extra_registration,'AB12CDE');assert.equal(renders,0);assert.equal(actions,3);
 }
});
test('editing mileage opens the existing dialog, and closing preserves the service position and focus',()=>{
 const {document}=parseHTML('<button data-edit-service-mileage>Edit</button><dialog id="serviceMileageDialog"><button data-close-service-mileage autofocus>Close</button><input data-field="mileage"><input data-mileage-unknown><button data-save-service-mileage>Save</button></dialog>');
 const dialog=document.querySelector('dialog'),input=document.querySelector('[data-field="mileage"]'),edit=document.querySelector('[data-edit-service-mileage]');let shown=0,closed=0,renderOptions,focusOptions;
 dialog.showModal=()=>shown++;dialog.close=()=>closed++;edit.focus=options=>focusOptions=options;
 const state={step:2,mileage_dialog_open:false,form:{service_choice:'Full Service'}};
 const c={document,state,serviceMileageValid:()=>true,updateMileageDialogValidity(){},render:options=>renderOptions=options};vm.createContext(c);load('bindMileageDialog',c);c.bindMileageDialog();edit.click();
 assert.equal(shown,1);assert.equal(state.mileage_dialog_open,true);assert.equal(renderOptions,undefined);assert.equal(document.querySelector('[data-field="mileage"]'),input);
 document.querySelector('[data-save-service-mileage]').click();assert.equal(closed,1);assert.equal(state.mileage_dialog_open,false);assert.equal(renderOptions.preserveServicePosition,true);assert.equal(focusOptions.preventScroll,true);
 assert.doesNotMatch(html,/data-field="mileage" autofocus/);
});
