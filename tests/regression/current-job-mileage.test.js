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
const names=new Set(['normaliseCurrentJobMileage','confirmedJobMileage','noteWithCurrentJobMileage','requireCurrentJobMileage','saveJob','openInvoiceForJob','upgradeSavedServiceSheet']);
const functions=[];
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))(traverseModule.default||traverseModule)(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(path){if(names.has(path.node.id.name))functions.push(generate(path.node).code);}});
function setup(value=''){
 const {window,document}=parseHTML('<html><body><input id="job_current_mileage"><input id="saveJob"></body></html>');document.getElementById('job_current_mileage').value=value;const alerts=[];
 const c={window,document,console,alert:message=>alerts.push(message),app:{jobs:[{id:'j',status:'booked',mileage:50000}]},gatherJob:()=>({...c.app.jobs[0],status:'work_complete'}),normalisePaperworkKind:x=>x,paperworkTitle:()=> 'Service',serviceSheetSummaryHtml:()=>'',activeServiceRegistration:'ABC123',serviceIconKeyFromTitle:()=>''};vm.createContext(c);vm.runInContext(functions.join('\n'),c);return {c,document,alerts};
}
test('current mileage must be positive whole miles and never inferred from MOT or old service data',()=>{
 const {c}=setup();for(const v of ['',null,'-1','0','1.5','Infinity','2000001','abc'])assert.equal(c.normaliseCurrentJobMileage(v),'');assert.equal(c.normaliseCurrentJobMileage(' 54,321 '),'54321');assert.equal(c.confirmedJobMileage({mileage:50000}),'');
 const note=c.noteWithCurrentJobMileage('Customer note\n[[PARTS_STATUS:Parts here]]','54,321');assert.equal(c.confirmedJobMileage({customer_note:note}),'54321');assert.match(note,/PARTS_STATUS/);assert.equal((c.noteWithCurrentJobMileage(note,'56000').match(/VECTA_CURRENT_MILEAGE/g)||[]).length,1);
});
test('real save pipeline refuses completion before mutating the job when current mileage is missing or invalid',async()=>{
 for(const value of ['','abc','1.2','-20']){const {c,document,alerts}=setup(value);assert.equal(await c.saveJob('j'),false);assert.equal(c.app.jobs[0].status,'booked');assert.equal(c.app.jobs[0].mileage,50000);assert.equal(document.getElementById('job_current_mileage').getAttribute('aria-invalid'),'true');assert.equal(alerts.length,1);}
});
test('valid current mileage clears validation and no-vehicle tasks do not demand an odometer',()=>{
 const {c,document}=setup('54,321');assert.equal(c.requireCurrentJobMileage({}),true);assert.equal(document.getElementById('job_current_mileage').value,'54321');document.getElementById('job_current_mileage').value='';assert.equal(c.requireCurrentJobMileage({no_vehicle:true}),true);assert.equal(c.requireCurrentJobMileage({card_type:'mini_task'}),true);
});
test('new invoice uses confirmed job mileage before an older service sheet and leaves invoice totals untouched',()=>{
 const {c}=setup();let invoice;c.app.jobs=[{id:'j',registration:'ABC123',mileage:54321,customer_note:'[[VECTA_CURRENT_MILEAGE:54321]]',amount_quoted:120}];Object.assign(c,{savedInvoiceForJobId:()=>null,privatePricingItemsFromNote:()=>[],invoiceLineWithMotVat:x=>x,invoiceDescriptionText:()=> 'Service',invoiceJobTypeLabel:()=> 'Service',jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({mileage:10000}),latestServiceMileage:()=>45000,uid:()=> 'i',nextInvoiceNumberText:()=> '123',todayIso:()=> '2026-10-20',openInvoice:(_,inv)=>invoice=inv});c.openInvoiceForJob('j');assert.equal(invoice.mileage,'54321');assert.equal(invoice.lines[0].amount,120);
});
test('reopening paperwork for the job displays its current mileage while old stored HTML remains intact',()=>{
 const {c}=setup(),saved='<div class="servicePrint"><div class="ssHeader"></div><span class="ssMileageEntry">45000</span></div>';
 const next=c.upgradeSavedServiceSheet(saved,{customer_note:'[[VECTA_CURRENT_MILEAGE:54321]]'},'service');assert.match(next,/>54321<\/span>/);assert.match(saved,/>45000<\/span>/);
});
