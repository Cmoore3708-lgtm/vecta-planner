import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup(mileage=''){
 const input={dataset:{field:'mileage'},value:mileage},choice={dataset:{serviceChoice:'Oil & Filter Change'}},type={dataset:{type:'Service'}};
 let renders=0,updates=0;
 const state={step:2,mileage_dialog_open:true,form:{registration:'AB12CDE',mileage,mileage_unknown:false,job_types:['Service'],service_choice:'Full Service',work_required:'Full Service'}};
 const document={querySelector:()=>null,querySelectorAll:s=>s==='[data-field]'?[input]:s==='[data-service-choice]'?[choice]:s==='[data-type]'?[type]:[]};
 const ctx={state,document,bindServiceExtra(){},bindHaynes(){},bindAdvisoryChoices(){},bindTyreCards(){},bindTyreSearch(){},render(){renders++},renderActions(){},updateMileageDialogValidity(){},servicePricing:{update(){updates++}}};
 vm.createContext(ctx);
 vm.runInContext(html.match(/function confirmedEvServiceVehicle\(\)\{[^\n]+/)[0],ctx);
 vm.runInContext(html.slice(html.indexOf('function serviceMileageValid(){'),html.indexOf('function updateMileageDialogValidity(){')),ctx);
 vm.runInContext(html.slice(html.indexOf('function bind(){'),html.indexOf('\nfunction ',html.indexOf('function bind(){')+1)),ctx);
 ctx.bind();return {ctx,input,choice,type,state,counts:()=>({renders,updates})};
}
test('typing 135 keeps the same mileage input and does not start pricing rerenders',()=>{
 const s=setup();for(const value of ['1','13','135']){s.input.value=value;s.input.oninput({target:s.input});}
 assert.equal(s.state.form.mileage,'135');assert.deepEqual(s.counts(),{renders:0,updates:0});
});
test('switching services carries current mileage and unknown choice without reopening prompt',()=>{
 for(const [mileage,unknown] of [['135000',false],['',true]]){
 const s=setup(mileage);s.state.form.mileage_unknown=unknown;s.choice.onclick();
 assert.equal(s.state.form.mileage,mileage);assert.equal(s.state.form.mileage_unknown,unknown);
 assert.equal(s.state.form.service_choice,'Oil & Filter Change');assert.equal(s.state.mileage_dialog_open,false);
 }
 const empty=setup();empty.choice.onclick();assert.equal(empty.state.mileage_dialog_open,true);
});
test('background price callbacks leave an open mileage dialog intact',()=>{
 let updates=0;const ctx={state:{step:2,mileage_dialog_open:true,form:{job_types:['Service']}},document:{querySelector:()=>null},servicePriceState:{status:'loading'},bookingSubmitting:false,refreshBookingTotal(){updates++},VectaServicePricing:{createController(options){return options}}};
 vm.createContext(ctx);
 const start=html.indexOf('const servicePricing=');
 vm.runInContext(html.slice(start,html.indexOf('function liveServiceQuote',start))+';globalThis.controller=servicePricing;',ctx);
 ctx.controller.onChange({status:'matched'});assert.equal(updates,0);
 ctx.state.mileage_dialog_open=false;ctx.controller.onChange({status:'matched'});assert.equal(updates,1);
});

test('selecting Service prompts for mileage before choosing a service, including reselection',()=>{
 for(const mileage of ['', '35000']){
  const s=setup(mileage);s.state.form.job_types=['MOT'];s.state.form.service_choice='';s.state.mileage_dialog_open=false;
  s.type.onclick();
  assert.ok(s.state.form.job_types.includes('Service'));
  assert.equal(s.state.form.service_choice,'');
  assert.equal(s.state.mileage_dialog_open,true);
  assert.equal(s.state.form.mileage,mileage);
  s.type.onclick();assert.equal(s.state.mileage_dialog_open,false);
  assert.ok(!s.state.form.job_types.includes('Service'));
  s.type.onclick();assert.equal(s.state.mileage_dialog_open,true);
 }
 const blocked=setup();blocked.state.form.job_types=['MOT'];blocked.state.form.nevos_vehicle='yes';blocked.state.mileage_dialog_open=false;
 blocked.type.onclick();assert.ok(!blocked.state.form.job_types.includes('Service'));assert.equal(blocked.state.mileage_dialog_open,false);
});
test('service price request starts while mileage is open with no service level or mileage entered',async()=>{
 const s=setup();s.state.form.job_types=[];s.state.form.service_choice='';s.state.mileage_dialog_open=false;
 const requests=[];let notifyStarted;const started=new Promise(resolve=>notifyStarted=resolve);
 Object.assign(s.ctx,{AbortController,AbortSignal,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync('public/js/vecta-service-pricing.js','utf8'),s.ctx);
 const controller=s.ctx.VectaServicePricing.createController({batch:true,getForm:()=>s.state.form,onChange(){},wait:async()=>{},fetcher:async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});notifyStarted();
  return {ok:true,json:async()=>({status:'DISABLED'})};
 }});
 s.ctx.render=()=>controller.update();
 try{
  s.type.onclick();assert.equal(s.state.mileage_dialog_open,true);assert.equal(s.state.form.service_choice,'');
  await started;
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/service-price');
  assert.equal(requests[0].body.allServices,true);assert.equal(requests[0].body.mileage,null);
  assert.equal(s.state.mileage_dialog_open,true);
 }finally{controller.reset();}
});

test('accepting the maintenance recommendation asks for mileage before the service level',()=>{
 const s=setup();
 const recommendation={dataset:{addRecommendation:'Service'}};
 s.state.form.job_types=['MOT'];s.state.form.service_choice='';s.state.mileage_dialog_open=false;
 s.ctx.document.querySelectorAll=selector=>selector==='[data-add-recommendation]'?[recommendation]:[];
 const start=html.indexOf('function bindV137()');
 vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),s.ctx);
 s.ctx.bindV137();recommendation.onclick();
 assert.deepEqual([...s.state.form.job_types],['MOT','Service']);
 assert.equal(s.state.form.service_choice,'');
 assert.equal(s.state.mileage_dialog_open,true);
});
