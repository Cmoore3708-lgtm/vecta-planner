import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
function functionCode(html,name){const start=html.indexOf('function '+name+'(');assert.ok(start>=0,name);const firstEnd=html.indexOf('\n',start);if(html.slice(start,firstEnd).endsWith('}'))return html.slice(start,firstEnd);return html.slice(start,html.indexOf('\n}',start)+2);}
for(const [variant,html] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(variant+': retired templates cannot reappear from settings or selected historic jobs',()=>{
  const c={normaliseJobTypeKey:v=>String(v).toLowerCase(),jobTypeValues:j=>j.job_type.split('||'),isVehicleTaxAlias:()=>false};
  vm.runInNewContext(['isRetiredMajorService','jobEditorTemplateNames'].map(n=>functionCode(html,n)).join('\n'),c);
  assert.deepEqual(Array.from(c.jobEditorTemplateNames(['MOT','Major Service','Full Service','EV Major Service'],{job_type:'Major Service||Interim Service'})),['MOT','Full Service','Interim Service']);
 });
 test(variant+': new and historic service summaries show only an annual next service date',()=>{
  const c={esc:String,normalisePaperworkKind:k=>k,paperworkKindForJob:()=> 'service',normReg:String,fleetVehicleForRegistration:()=>null,app:{vehicles:[]},jobVehicleDueData:()=>({}),currentServiceTypeForJob:()=> 'Full Service',todayIso:()=> '2026-10-30'};
  vm.runInNewContext(['fleetAddMonthsFromDue','serviceSheetDate','serviceSheetDateInput','serviceSheetDueData','serviceSheetSummaryHtml'].map(n=>functionCode(html,n)).join('\n'),c);
  for(const [j,expected] of [[{registration:'TEST',job_type:'Full Service'},'2027-10-30'],[{registration:'OLD',job_type:'Major Service',completed_at:'2026-05-19T12:00:00Z'},'2027-05-19'],[{registration:'LEAP',completed_at:'2028-02-29'},'2029-02-28']]){
   const result=c.serviceSheetSummaryHtml(j,'service'),{document}=parseHTML(result);
   assert.equal(document.querySelector('[data-due-field="service"]').value,expected);
   assert.doesNotMatch(result,/Major Service|Service type|Next:/);
  }
 });
 test(variant+': saved sheets lose obsolete labels while preserving checks, mileage and dates',()=>{
  const {document}=parseHTML('<html></html>');
  const c={document,activeServiceRegistration:'TEST',confirmedJobMileage:()=>'',normalisePaperworkKind:k=>k,serviceRecordKind:()=> 'service',paperworkTitle:()=> 'Service Sheet',serviceSheetSummaryHtml:()=>'',serviceSheetDateInput:(v,label,field)=>'<input class="ssDueDateInput" data-due-field="'+field+'" value="'+v+'">',serviceIconKeyFromTitle:()=>''};
  vm.runInNewContext(functionCode(html,'upgradeSavedServiceSheet'),c);
  const saved='<div class="servicePrint"><div class="ssHeader"></div><div class="ssDueSummary"><div><b>Next service due</b><input class="ssDueDateInput" data-due-field="service" value="2027-05-19"></div><div><b>Service type</b><span>Major Service</span><small>Next: Full Service</small></div></div><div class="ssInfoRow"><b>Type:</b><span>Major Service</span></div><span class="ssMileageEntry">55118</span><div class="ssPreBody">Major Service with extra work<input class="oilRange" value="60"></div><span class="ssCheck checked" aria-checked="true"></span></div>';
  const upgraded=c.upgradeSavedServiceSheet(saved,{},'service');
  assert.doesNotMatch(upgraded,/Major Service|Service type|Next:/);
  assert.match(upgraded,/2027-05-19/);assert.match(upgraded,/55118/);assert.match(upgraded,/ssCheck checked/);assert.match(upgraded,/extra work/);assert.match(upgraded,/oilRange/);
 });
 test(variant+': old alternating fleet plans become annual without changing due dates',()=>{
  const c={fleetVehicles:[],fleetPlans:[{id:'p',vehicleId:'v',type:'Major Service',intervalMonths:24,status:'Active',currentDueDate:'2027-05-19',manualDueDate:true}],normaliseJobTypeKey:v=>String(v).toLowerCase(),fleetWriteLocal:()=>{}};
  vm.runInNewContext(['serviceTypeFromValue','alternateServiceType','fleetEnsureServicePlanTypes'].map(n=>functionCode(html,n)).join('\n'),c);
  assert.equal(c.fleetEnsureServicePlanTypes(),true);assert.equal(c.fleetPlans[0].type,'Annual Service');assert.equal(c.fleetPlans[0].currentDueDate,'2027-05-19');assert.equal(c.fleetPlans[0].manualDueDate,true);assert.equal(c.fleetEnsureServicePlanTypes(),false);
  assert.notEqual(c.alternateServiceType('Full Service'),'Major Service');
 });
 test(variant+': generic website bookings default to Full Service',()=>{
  const c={isWebsiteBookingJob:()=>true,jobTypeValues:j=>[j.job_type],normaliseJobTypeKey:v=>v.toLowerCase(),jobTypeStorageValue:a=>a.join('||'),templateDataForType:()=>({work_required:'Full Service',estimated_hours:1.5})};
  vm.runInNewContext(functionCode(html,'applyWebsiteDefaultService'),c);
  const j={job_type:'Service',work_required:'Service'};c.applyWebsiteDefaultService(j);assert.equal(j.job_type,'Full Service');assert.equal(j.work_required,'Full Service');
 });
}
