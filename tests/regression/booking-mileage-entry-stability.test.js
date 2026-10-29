import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup(mileage=''){
 const input={dataset:{field:'mileage'},value:mileage},choice={dataset:{serviceChoice:'Major Service'}};
 let renders=0,updates=0;
 const state={step:2,mileage_dialog_open:true,form:{mileage,mileage_unknown:false,job_types:['Service'],service_choice:'Full Service',work_required:'Full Service'}};
 const document={querySelector:()=>null,querySelectorAll:s=>s==='[data-field]'?[input]:s==='[data-service-choice]'?[choice]:[]};
 const ctx={state,document,bindHaynes(){},bindAdvisoryChoices(){},bindTyreCards(){},bindTyreSearch(){},render(){renders++},renderActions(){},updateMileageDialogValidity(){},servicePricing:{update(){updates++}}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function serviceMileageValid(){'),html.indexOf('function updateMileageDialogValidity(){')),ctx);
 vm.runInContext(html.slice(html.indexOf('function bind(){'),html.indexOf('\nfunction ',html.indexOf('function bind(){')+1)),ctx);
 ctx.bind();return {input,choice,state,counts:()=>({renders,updates})};
}
test('typing 135 keeps the same mileage input and does not start pricing rerenders',()=>{
 const s=setup();for(const value of ['1','13','135']){s.input.value=value;s.input.oninput({target:s.input});}
 assert.equal(s.state.form.mileage,'135');assert.deepEqual(s.counts(),{renders:0,updates:0});
});
test('switching services carries current mileage and unknown choice without reopening prompt',()=>{
 for(const [mileage,unknown] of [['135000',false],['',true]]){
 const s=setup(mileage);s.state.form.mileage_unknown=unknown;s.choice.onclick();
 assert.equal(s.state.form.mileage,mileage);assert.equal(s.state.form.mileage_unknown,unknown);
 assert.equal(s.state.form.service_choice,'Major Service');assert.equal(s.state.mileage_dialog_open,false);
 }
 const empty=setup();empty.choice.onclick();assert.equal(empty.state.mileage_dialog_open,true);
});
test('background price callbacks leave an open mileage dialog intact',()=>{
 let renders=0;const ctx={state:{step:2,mileage_dialog_open:true},bookingSubmitting:false,render(){renders++},VectaServicePricing:{createController(options){return options}}};
 vm.createContext(ctx);
 const start=html.indexOf('const servicePricing=');vm.runInContext(html.slice(start,html.indexOf('\n',start))+';globalThis.controller=servicePricing;',ctx);
 ctx.controller.onChange({status:'matched'});assert.equal(renders,0);
 ctx.state.mileage_dialog_open=false;ctx.controller.onChange({status:'matched'});assert.equal(renders,1);
});
