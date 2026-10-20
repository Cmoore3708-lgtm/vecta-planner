import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const booking=fs.readFileSync('website/booking/index.html','utf8');
function fn(source,name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);return source.slice(start,end);}
test('advisories repeat at appointment choice with the question only on step 3',()=>{
 const context={state:{lookup:'success',step:1,form:{mot_advisories:['Tyre worn'],inspect_mot_advisories:'yes'}},esc:x=>x};vm.createContext(context);
 vm.runInContext(fn(booking,'advisoryListHtml')+'\n'+fn(booking,'advisoryQuestionHtml'),context);
 const first=context.advisoryListHtml(),third=context.advisoryListHtml(true);
 assert.match(first,/Latest MOT advisories/);assert.doesNotMatch(first,/Would you like/);
 assert.match(third,/These advisories were recommended on your last MOT:/);assert.match(third,/Would you like/);assert.match(third,/data-advisory-choice="yes" class="selected"/);
 assert.ok(booking.indexOf('advisoryListHtml(true)')<booking.indexOf('<span class="kicker">STEP 3 OF 5'));
});
test('selecting MOT allocates Chris but removing MOT preserves the current mechanic',()=>{
 const html=fs.readFileSync('index.html','utf8'),tech={value:'Alfie',options:[{value:'Alfie'},{value:'Chris'}]},type={value:'General'};
 const ctx={document:{getElementById:id=>id==='job_technician'?tech:id==='job_job_type'?type:null,querySelectorAll:()=>[]},templateDataForType:()=>({}),jobTypeValues:x=>x.split(','),normaliseJobTypeKey:x=>x.toLowerCase(),jobTypeStorageValue:x=>x.join(','),updateMotTimeField:()=>{throw new Error('stop after allocation')}};vm.createContext(ctx);vm.runInContext(fn(html,'applyTemplate'),ctx);
 assert.throws(()=>ctx.applyTemplate('MOT'),/stop/);assert.equal(tech.value,'Chris');
 type.value='MOT,Service';tech.value='Alfie';assert.throws(()=>ctx.applyTemplate('MOT'),/stop/);assert.equal(tech.value,'Alfie');
});

test('advisory answers are required only on the step where the question is displayed',()=>{
 for(const path of ['public/booking.html','website/booking/index.html']){
  const source=fs.readFileSync(path,'utf8'),context={state:{step:1,form:{registration:'DC14EEZ',vehicle:'Volkswagen Tiguan',mot_advisories:['Pads worn'],inspect_mot_advisories:'',job_types:['MOT'],appointment_date:'2026-10-29',appointment_time:'08:00',technician:'Chris'}},isNissanVehicle:()=>false,workDescriptionRequired:()=>false};
  vm.createContext(context);vm.runInContext(fn(source,'valid'),context);
  assert.equal(context.valid(),true,path+' step 1');context.state.step=2;assert.ok(context.valid(),path+' step 2');
  context.state.step=3;assert.equal(context.valid(),false,path+' unanswered step 3');
  for(const answer of ['yes','no']){context.state.form.inspect_mot_advisories=answer;assert.equal(context.valid(),true,path+' step 3 '+answer);}
  context.state.form.inspect_mot_advisories='';context.state.form.mot_advisories=[];assert.equal(context.valid(),true,path+' no advisories');
 }
});
