import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parse} from '@babel/parser';
import generateModule from '@babel/generator';
import traverseModule from '@babel/traverse';
const generate=generateModule.default||generateModule;
const html=readFileSync('index.html','utf8');
const names=new Set(['currentJobMileageRequired','currentJobMileageUnknown','jobTypeValues','normaliseJobTypeKey','normaliseCurrentJobMileage','confirmedJobMileage','noteWithCurrentJobMileage','requireCurrentJobMileage','saveJob','openInvoiceForJob','upgradeSavedServiceSheet']);
const functions=[];
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))(traverseModule.default||traverseModule)(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(path){if(names.has(path.node.id.name))functions.push(generate(path.node).code);}});
function setup(value=''){
 const {window,document}=parseHTML('<html><body><input id="job_current_mileage"><input id="saveJob"></body></html>');document.getElementById('job_current_mileage').value=value;const alerts=[];
 const c={window,document,console,alert:message=>alerts.push(message),app:{jobs:[{id:'j',status:'booked',mileage:50000}]},gatherJob:()=>({...c.app.jobs[0],status:'work_complete'}),normalisePaperworkKind:x=>x,paperworkTitle:()=> 'Service',serviceSheetSummaryHtml:()=>'',activeServiceRegistration:'ABC123',serviceIconKeyFromTitle:()=>'',invoiceIsStaff:()=>false};vm.createContext(c);vm.runInContext(functions.join('\n'),c);return {c,document,alerts};
}
test('current mileage must be positive whole miles and never inferred from MOT or old service data',()=>{
 const {c}=setup();for(const v of ['',null,'-1','0','1.5','Infinity','2000001','abc'])assert.equal(c.normaliseCurrentJobMileage(v),'');assert.equal(c.normaliseCurrentJobMileage(' 54,321 '),'54321');assert.equal(c.confirmedJobMileage({mileage:50000}),'');
 const note=c.noteWithCurrentJobMileage('Customer note\n[[PARTS_STATUS:Parts here]]','54,321');assert.equal(c.confirmedJobMileage({customer_note:note}),'54321');assert.match(note,/PARTS_STATUS/);assert.equal((c.noteWithCurrentJobMileage(note,'56000').match(/VECTA_CURRENT_MILEAGE/g)||[]).length,1);
});
test('real save pipeline refuses completion before mutating the job when current mileage is missing or invalid',async()=>{
 for(const value of ['','abc','1.2','-20']){const {c,document,alerts}=setup(value);const pending=c.saveJob('j');assert.ok(document.querySelector('#jobMileagePrompt'));document.querySelector('[data-mileage-enter]').click();assert.equal(await pending,false);assert.equal(c.app.jobs[0].status,'booked');assert.equal(c.app.jobs[0].mileage,50000);assert.equal(document.getElementById('job_current_mileage').getAttribute('aria-invalid'),'true');assert.equal(alerts.length,0);}
});
test('valid current mileage clears validation and no-vehicle tasks do not demand an odometer',async()=>{
 const {c,document}=setup('54,321');assert.equal(await c.requireCurrentJobMileage({}),true);assert.equal(document.getElementById('job_current_mileage').value,'54321');document.getElementById('job_current_mileage').value='';assert.equal(await c.requireCurrentJobMileage({no_vehicle:true}),true);assert.equal(await c.requireCurrentJobMileage({card_type:'mini_task'}),true);
});
test('new invoice uses confirmed job mileage before an older service sheet and leaves invoice totals untouched',()=>{
 const {c}=setup();let invoice;c.app.jobs=[{id:'j',registration:'ABC123',mileage:54321,customer_note:'[[VECTA_CURRENT_MILEAGE:54321]]',amount_quoted:120}];Object.assign(c,{savedInvoiceForJobId:()=>null,privatePricingItemsFromNote:()=>[],invoiceLineWithMotVat:x=>x,invoiceDescriptionText:()=> 'Service',invoiceJobTypeLabel:()=> 'Service',jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({mileage:10000}),latestServiceMileage:()=>45000,uid:()=> 'i',nextInvoiceNumberText:()=> '123',todayIso:()=> '2026-10-20',openInvoice:(_,inv)=>invoice=inv});c.openInvoiceForJob('j');assert.equal(invoice.mileage,'54321');assert.equal(invoice.lines[0].amount,120);
});
test('reopening paperwork for the job displays its current mileage while old stored HTML remains intact',()=>{
 const {c}=setup(),saved='<div class="servicePrint"><div class="ssHeader"></div><span class="ssMileageEntry">45000</span></div>';
 const next=c.upgradeSavedServiceSheet(saved,{customer_note:'[[VECTA_CURRENT_MILEAGE:54321]]'},'service');assert.match(next,/>54321<\/span>/);assert.match(saved,/>45000<\/span>/);
});


test('specified standalone jobs can complete without mileage, including spelling variants',async()=>{
 const {c,alerts}=setup();
 for(const job_type of ['Tow Bar Fit','Tow Bar Removal','Towbar fitting','MOT','Pre MOT check','Tyres','Puncture repair','Wash & hover','Wash & Hoover','Special Valet']){
  assert.equal(c.currentJobMileageRequired({job_type}),false,job_type);
  assert.equal(await c.requireCurrentJobMileage({job_type}),true,job_type);
 }
 assert.equal(alerts.length,0);
 assert.equal(c.currentJobMileageRequired({job_types:['MOT','Tyres']}),false);
});
test('service or other required work in a mixed job still requires mileage',()=>{
 const {c}=setup();
 for(const job_type of ['Full Service','Major Service','6 Month Safety Check','Brakes','General','MOT || Full Service','Tyres || Diagnostics','Tow Bar Fit || Interim Service'])assert.equal(c.currentJobMileageRequired({job_type}),true,job_type);
 assert.equal(c.currentJobMileageRequired({job_types:['Special Valet','Full Service']}),true);
 assert.equal(c.currentJobMileageRequired({job_type:'General',work_required:'MOT and tyres mentioned in repair notes'}),true);
});


test('Mileage unknown explicitly accepts the prompt and records an override without a fake reading',async()=>{
 const {c,document}=setup();const job={id:'j',job_type:'Full Service',customer_note:'Customer instructions'};
 const pending=c.requireCurrentJobMileage(job);assert.ok(document.querySelector('#jobMileagePrompt'));
 document.querySelector('[data-mileage-unknown]').click();assert.equal(await pending,true);
 assert.equal(c.currentJobMileageUnknown(job),true);assert.equal(c.confirmedJobMileage(job),'');
 assert.equal(document.querySelector('#job_current_mileage').value,'');assert.equal(document.querySelector('#job_current_mileage').dataset.mileageUnknown,'true');
 assert.equal(document.querySelector('#jobMileagePrompt'),null);assert.equal(await c.requireCurrentJobMileage(job),true);
 assert.equal(c.noteWithCurrentJobMileage(job.customer_note,'54321',true),'Customer instructions\n[[VECTA_CURRENT_MILEAGE:54321]]');
});
test('completion resumes after unknown without changing the saved baseline early',async()=>{
 const {c,document}=setup();let saved;
 c.app.jobs[0].job_type='Full Service';
 // Stop after mileage validation: duplicate check is the next independent save guard.
 c.privatePricingItemsFromNote=()=>[];c.v310DuplicateFor=()=>{saved=true;throw Error('after mileage guard')};
 const pending=c.saveJob('j');document.querySelector('[data-mileage-unknown]').click();
 await assert.rejects(pending,/after mileage guard/);assert.equal(saved,true);assert.equal(c.app.jobs[0].status,'booked');
 assert.equal(c.app.jobs[0].customer_note,undefined);
});
test('new invoices preserve explicit unknown instead of reusing a previous MOT reading',()=>{
 const {c}=setup();let invoice;c.app.jobs=[{id:'j',registration:'ABC123',mileage:50000,customer_note:'[[VECTA_CURRENT_MILEAGE_UNKNOWN]]',amount_quoted:120}];
 Object.assign(c,{savedInvoiceForJobId:()=>null,privatePricingItemsFromNote:()=>[],invoiceLineWithMotVat:x=>x,invoiceDescriptionText:()=> 'Service',invoiceJobTypeLabel:()=> 'Service',jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({mileage:10000}),latestServiceMileage:()=>45000,uid:()=> 'i',nextInvoiceNumberText:()=> '123',todayIso:()=> '2026-10-20',openInvoice:(_,inv)=>invoice=inv});
 c.openInvoiceForJob('j');assert.equal(invoice.mileage,'Unknown');assert.equal(invoice.lines[0].amount,120);
});

