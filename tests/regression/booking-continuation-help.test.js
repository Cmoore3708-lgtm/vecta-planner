import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('website/booking/index.html','utf8');
function setup(step,form={}){
 const {document}=parseHTML('<div id="actions"></div>');
 const c={document,state:{step,lookup:'idle',form:{registration:'AB12CDE',vehicle:'Test car',job_types:[],service_choice:'',mileage:'',tyre_size:'',tyre_choice:'',tyre_positions:[],work_required:'',mot_advisories:[],customer_name:'',email:'',phone:'',...form}},haynesState:{status:'idle'},tyreGuideState:{status:'unavailable'},VectaWorkPhotos:{isBusy:()=>false},selectedTyreGuide:()=>null,tyreCategoryOptions:()=>[],esc:String,render(){},submit(){}};
 vm.createContext(c);
 for(const name of ['isNevosEligibleVehicle','workDescriptionRequired','valid','bookingMissingRequirements','renderActions']){
  const start=html.indexOf('function '+name+'(');vm.runInContext(html.slice(start,html.indexOf('\nfunction ',start+1)),c);
 }
 c.refresh=()=>{c.renderActions();assert.equal(document.querySelector('#next')?.hasAttribute('disabled')??!document.querySelector('#next'),!Boolean(c.valid()));return document.querySelector('#bookingNextHelp').textContent;};
 return c;
}
test('tyre outage guides the customer through range and wheel selections, then enables Continue without a live quote',()=>{
 const c=setup(2,{job_types:['Tyres']});
 assert.match(c.refresh(),/three tyre-size numbers/);assert.match(c.refresh(),/Budget, Mid range or Premium/);assert.match(c.refresh(),/which tyres/);
 Object.assign(c.state.form,{tyre_size:'205/55R16',tyre_choice:'Budget'});
 const help=c.refresh();assert.doesNotMatch(help,/three tyre-size numbers|Budget/);assert.match(help,/which tyres/);
 c.state.form.tyre_positions=['FL'];assert.equal(c.refresh(),'');assert.equal(c.valid(),true);
 assert.equal(c.document.querySelector('#next').getAttribute('aria-describedby'),'bookingNextHelp');
});
test('unknown tyre size can proceed without requesting range or positions',()=>{
 const c=setup(2,{job_types:['Tyres'],tyre_size_unknown:true});assert.equal(c.refresh(),'');assert.equal(c.valid(),true);
});
test('service, mileage, NEVOS and work-description omissions are all explained',()=>{
 const c=setup(2,{vehicle:'Nissan Qashqai',job_types:['Service','Other']});
 assert.match(c.refresh(),/NEVOS/);assert.match(c.refresh(),/Choose your service/);assert.match(c.refresh(),/current mileage/);assert.match(c.refresh(),/Describe the work/);
 Object.assign(c.state.form,{nevos_vehicle:'no',service_choice:'Full Service',mileage:'-1',work_required:'Check brakes'});
 assert.match(c.refresh(),/current mileage/);
 c.state.form.mileage='2.5';assert.match(c.refresh(),/current mileage/);
 c.state.form.mileage_unknown=true;assert.equal(c.refresh(),'');
 c.state.form.mileage_unknown=false;c.state.form.mileage='0';assert.equal(c.refresh(),'');
});
test('unavailable tyre brand explains a stock mismatch but TBC without supplier options permits continuation',()=>{
 const c=setup(2,{job_types:['Tyres'],tyre_size:'205/55R16',tyre_choice:'Budget',tyre_brand:'Old brand',tyre_positions:['FL','FR']});
 c.tyreGuideState.status='matched';assert.match(c.refresh(),/available tyre brand/);
 c.state.form.tyre_brand='Brand to be confirmed';assert.equal(c.refresh(),'');
});
test('date and advisory requirements disappear as each is completed',()=>{
 const c=setup(3,{mot_advisories:['Tyre worn'],available_slots:[{date:'2026-11-20'}]});
 assert.match(c.refresh(),/MOT advisories/);assert.match(c.refresh(),/appointment date/);
 Object.assign(c.state.form,{appointment_date:'2026-11-20',appointment_time:'09:00',technician:'Alfie'});
 assert.match(c.refresh(),/MOT advisories/);assert.doesNotMatch(c.refresh(),/appointment date/);
 c.state.form.inspect_mot_advisories='no';assert.equal(c.refresh(),'');
});
test('loading and empty calendars describe the next possible action',()=>{
 const c=setup(3);c.state.availability_loading=true;assert.match(c.refresh(),/Wait for the available dates/);
 c.state.availability_loading=false;assert.match(c.refresh(),/Contact Vecta Motors/);
});
test('contact guidance updates with each field, and uploading photos cannot silently block Continue',()=>{
 const c=setup(4);assert.match(c.refresh(),/full name/);assert.match(c.refresh(),/telephone/);assert.match(c.refresh(),/email/);
 c.state.form.customer_name='Test';assert.doesNotMatch(c.refresh(),/full name/);
 c.state.form.phone='0000';assert.doesNotMatch(c.refresh(),/telephone/);
 c.state.form.email='test@example.invalid';assert.equal(c.refresh(),'');
 c.VectaWorkPhotos.isBusy=()=>true;assert.match(c.refresh(),/photos to finish uploading/);
 c.VectaWorkPhotos.isBusy=()=>false;assert.equal(c.refresh(),'');
});
test('empty vehicle and work steps identify the missing selection',()=>{
 const c=setup(1,{registration:'',vehicle:''});assert.match(c.refresh(),/registration/);assert.match(c.refresh(),/make and model/);
 const work=setup(2);assert.match(work.refresh(),/Select the work/);
});
