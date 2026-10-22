import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('MOT appointment list ends with Tomorrow followed by Vic Young',()=>{
  assert.match(html,/function halfHourMotTimeOptions\(val\)[\s\S]*?times\.concat\(\['Tomorrow','Vic Young'\]\)/);
});

test('special MOT appointment choices are preserved when jobs are saved and reopened',()=>{
  assert.match(html,/function normaliseMotTime\(value\)[\s\S]*?'tomorrow':'Tomorrow'[\s\S]*?'vic young':'Vic Young'/);
  assert.match(html,/function motTimeFromJob\(j\)[\s\S]*?normaliseMotTime\(j\.mot_time\)/);
  assert.match(html,/function setMotTimeOnNote\(note,time\)[\s\S]*?normaliseMotTime\(time\)/);
});

test('planner MOT label keeps the vehicle name visible and uses appointment time without inferring drop-off time',()=>{
 const helper=html.match(/function plannerMotHeaderHtml\(j\)\{[^\n]+/)[0];
 const card=html.match(/function jobCardHtml\(j\)\{[^\n]+/)[0];
 const context={esc:v=>String(v||''),hasMotJobType:j=>String(j.job_type).includes('mot'),motTimeFromJob:j=>j.mot_time||'',topFor:()=>0,heightFor:()=>95.8,jobTypeInlineStyle:()=>'',plannerPlate:()=>'<span class="plate">N16 VTR</span>',partsStatusDot:()=>'',plannerJobTypesHtml:(_j,_size,exclude)=>{assert.equal(exclude,true);return ''}};
 const websiteHelper=html.slice(html.indexOf('function isWebsiteBookingJob(j){'),html.indexOf('\nfunction applyWebsiteDefaultMajorService'));
 vm.createContext(context);vm.runInContext(websiteHelper+'\n'+html.match(/function plannerVehicleLabel\(j\)\{[^\n]+/)[0]+'\n'+helper+'\n'+card,context);
 const result=context.jobCardHtml({id:'1',job_type:'mot',mot_time:'14:00',drop_time:'08:00',estimated_hours:1,vehicle:'Citroen C3',work_required:'MOT test'});
 assert.match(result,/<div class="plannerPlateAndMot"><span class="plate">N16 VTR<\/span><\/div><b class="jobVehicle plannerJobVehicle">Citroen C3<\/b><\/div><span class="plannerMotHeader"[^>]*>MOT \(14:00\)<\/span>/);
 assert.match(result,/plannerMotJob/);
 assert.doesNotMatch(result,/websiteBookingOutline/);
 assert.match(context.jobCardHtml({id:'web',job_type:'mot',website_request_id:'request-1',estimated_hours:1}),/websiteBookingOutline/);
 assert.equal(context.plannerMotHeaderHtml({job_type:'mot',drop_time:'08:00'}).includes('08:00'),false);
 assert.equal(context.plannerMotHeaderHtml({job_type:'service'}),'');
});
