import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function section(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
function setup(group='Nissan Internal'){
  const {document}=parseHTML('<html><body><div id="jobModal"></div></body></html>');
  const fleet={id:'INTERNAL|NMDR2',registration:'NMDR2',model:'Qashqai',fleetGroup:group,contactEmail:'andrew@example.test',roadGoing:false};
  const c={document,console,todayIso:()=> '2026-11-03',app:{vehicles:[{id:'v1',registration:'NMDR2',customer_id:'shared'}],customers:[{id:'shared',name:'NMUK',email:'Donna@example.test'}],jobs:[{id:'old',registration:'NMDR2',customer_email:'old@example.test'}],invoices:[],serviceRecords:[]},fleetVehicles:[fleet],fleetPlans:[],fleetCompletions:[],normReg:r=>String(r).replace(/\s/g,'').toUpperCase(),fleetVehicleForRegistration:()=>c.fleetVehicles[0],fleetVehiclePlans:()=>[],jobVehicleDueData:()=>({}),fleetIsInternalRegistration:()=>true,allVehicleHistoryJobs:()=>c.app.jobs,vehicleHistoryDate:()=>'',searchFleetCustomerName:()=> 'NMUK',esc:s=>String(s??''),niceDate:s=>s,jobTypeChip:()=>'',money:()=>'',fleetDisplayModel:s=>s,fullPlate:s=>s,fleetGroupLabel:s=>s,vehicleEmailLinkHtml:email=>`<a class="email">${email}</a>`,closeModals(){},openInvoice(){},fleetNmukTypeFromVehicle:()=> 'Internal',fleetIncomeCustomerFromVehicle:()=> 'NMUK',openJobModal:(_id,defaults)=>{c.newJob=defaults;},renameVehicleRegistrationEverywhere:async r=>r,saveFleet:async()=>{c.savedFleet=JSON.stringify(c.fleetVehicles);return true;},saveAll:async()=>{},upsertRemote:async()=>{},alert:message=>{throw Error(message);},vectaJobIsDeletedForLists:()=>false,fleetIsContractorIncome:()=>false,storedRegistrationValue:r=>r};
  vm.createContext(c);
  vm.runInContext(section('function serviceSheetDate(value)', 'function serviceSheetDueData(')+'\n'+section('function serviceSheetDateInput(', 'function serviceSheetSummaryHtml(')+'\n'+section('function maintenanceDateInput(', 'function openVehicleRecord(idOrReg)')+'\n'+section('function knownRegistrationDetails(', 'function jobVehicleDueItem('),c);
  c.openVehicleRecord=c.openVehicleRecordBase;
  return c;
}
test('vehicle record and registration lookup use fleet contact ahead of shared customer and old jobs',()=>{
  const c=setup();c.openVehicleRecord('NMDR2');
  assert.equal(c.document.getElementById('recordVehicleEmail').value,'andrew@example.test');
  assert.equal(c.document.querySelector('.email').textContent,'andrew@example.test');
  assert.equal(c.knownRegistrationDetails('NMDR2').customer_email,'andrew@example.test');
});
test('edited fleet email survives save, cloud reload and reopen; new jobs use it without changing historical/shared contacts',async()=>{
  const c=setup();c.openVehicleRecord('NMDR2');
  c.document.getElementById('recordVehicleEmail').value='correct@example.test';
  await c.document.getElementById('recordSaveVehicle').onclick();
  c.fleetVehicles=JSON.parse(c.savedFleet);c.openVehicleRecord('NMDR2');
  assert.equal(c.document.getElementById('recordVehicleEmail').value,'correct@example.test');
  c.document.getElementById('recordNewJob').onclick();
  assert.equal(c.newJob.customer_email,'correct@example.test');
  assert.equal(c.knownRegistrationDetails('NMDR2').customer_email,'correct@example.test');
  assert.equal(c.app.customers[0].email,'Donna@example.test');
  assert.equal(c.app.jobs[0].customer_email,'old@example.test');
});
test('blank fleet contact cannot resurrect an unrelated email',async()=>{
  const c=setup('Nissan Pool Cars');c.openVehicleRecord('NMDR2');
  c.document.getElementById('recordVehicleEmail').value='';
  await c.document.getElementById('recordSaveVehicle').onclick();
  assert.equal(c.document.getElementById('recordVehicleEmail').value,'');
  assert.equal(c.knownRegistrationDetails('NMDR2').customer_email,'');
  c.document.getElementById('recordNewJob').onclick();assert.equal(c.newJob.customer_email,'');
});
