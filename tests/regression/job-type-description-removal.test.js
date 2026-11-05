import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('index.html','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf('\nfunction ',start+1));}
const presets={
  General:{work_required:'General repair'},
  MOT:{work_required:'MOT test / MOT preparation.',amount_quoted:65,vat_mode:'no_vat'},
  Brakes:{work_required:'Brake inspection / pads and discs as required.'},
  'Full Service':{work_required:'Oil and filter\nAir and cabin filters'},
  'Interim Service':{work_required:'Oil and filter'},
  'EV Interim Service':{work_required:'Cabin filter\nFill screen wash\nCheck tyres'},
  Tyres:{work_required:'Tyres'},
  'Same work':{work_required:'MOT test / MOT preparation.'}
};
function setup(types='general',description=''){
  const fields={job_job_type:{value:types},job_work_required:{value:description,dataset:{}},job_amount_quoted:{value:'120'},job_vat_mode:{value:'inc_vat'}};
  const context={JOB_TYPE_SEPARATOR:' || ',app:{settings:{jobTemplates:presets}},templates:presets,editingJobId:'existing',window:{},document:{getElementById:id=>fields[id]||null,querySelectorAll:()=>[]},updateMotTimeField(){},syncPresetPricingToPrivateBreakdown(){},refreshServicePricingAdvisor(){},addTemplatePartsToJob(){},applyNewBookingPartsStatusPreset(){},servicePricingQuote:()=>null};
  vm.createContext(context);
  vm.runInContext(['normaliseJobTypeKey','jobTypeValues','jobTypeStorageValue','templateDataForType','templateWorkForTypes','servicePricingType','jobTemplateWorkBlock','removeJobTemplateWork','applyTemplate'].map(fn).join('\n'),context);
  return {c:context,fields,work:fields.job_work_required};
}
test('tick then untick removes only that preset and keeps other work and manual notes',()=>{
  const {c,work}=setup('general','Customer reports a rattle\nPlease call before extra work');
  c.applyTemplate('MOT');c.applyTemplate('Brakes');c.applyTemplate('MOT');
  assert.equal(work.value,'Customer reports a rattle\nPlease call before extra work\n'+presets.Brakes.work_required);
  c.applyTemplate('MOT');c.applyTemplate('MOT');
  assert.equal(work.value,'Customer reports a rattle\nPlease call before extra work\n'+presets.Brakes.work_required);
});
test('the only selected type can be removed and cannot reapply its price or VAT',()=>{
  const {c,work,fields}=setup('MOT',presets.MOT.work_required);
  c.applyTemplate('MOT');assert.equal(work.value,'');assert.equal(fields.job_job_type.value,'general');
  assert.equal(fields.job_amount_quoted.value,'120');assert.equal(fields.job_vat_mode.value,'inc_vat');
});
test('saved/reopened cards remove an unchanged preset without needing editor history',()=>{
  const {c,work}=setup('MOT || Brakes',presets.MOT.work_required+'\n'+presets.Brakes.work_required+'\nCustomer will collect at 4');
  c.applyTemplate('MOT');assert.equal(work.value,presets.Brakes.work_required+'\nCustomer will collect at 4');
});
test('edited preset descriptions and job-type names inside instructions remain intact',()=>{
  for(const description of ['MOT test / MOT preparation. Customer requests no wash','Please check MOT advisories','MOT preparation only — no test']){
    const {c,work}=setup('MOT || Brakes',description);c.applyTemplate('MOT');assert.equal(work.value,description);
  }
});
test('multiline presets are removed as a whole while nearby notes survive',()=>{
  const {c,work}=setup('EV Interim Service || Brakes','Keep locking nut\n'+presets['EV Interim Service'].work_required+'\nCustomer has checked tyres');
  c.applyTemplate('EV Interim Service');assert.equal(work.value,'Keep locking nut\nCustomer has checked tyres');
});
test('switching service level replaces the old generated block and retains customer instructions',()=>{
  const {c,work}=setup('general','Please check a coolant leak');c.applyTemplate('Interim Service');c.applyTemplate('Full Service');
  assert.equal(work.value,'Please check a coolant leak\nFull Service\nOil and filter\nAir and cabin filters');
  c.applyTemplate('Full Service');assert.equal(work.value,'Please check a coolant leak');
});
test('legacy unheaded service descriptions are removed on reopened jobs',()=>{
  const {c,work}=setup('Full Service || MOT',presets['Full Service'].work_required+'\n'+presets.MOT.work_required);
  c.applyTemplate('Full Service');assert.equal(work.value,presets.MOT.work_required);
});
test('identical wording used by a remaining selected type is retained',()=>{
  const {c,work}=setup('MOT || Same work',presets.MOT.work_required);c.applyTemplate('MOT');assert.equal(work.value,presets.MOT.work_required);
});
test('tyre picker removal uses the same description cleanup without bypassing its order checks',()=>{
  const {c,work}=setup('Tyres || MOT','Tyres\n'+presets.MOT.work_required);let picker=false;
  c.window.VectaJobPricing={selected(){picker=true;}};c.applyTemplate('Tyres');assert.equal(picker,true);assert.equal(work.value,'Tyres\n'+presets.MOT.work_required);
  c.applyTemplate('Tyres',true);assert.equal(work.value,presets.MOT.work_required);
});
