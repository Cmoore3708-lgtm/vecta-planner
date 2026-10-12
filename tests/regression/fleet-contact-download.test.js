import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function context(){
 const ctx={fleetVehicles:[{registration:'INT1',model:'Forklift',fleetGroup:'Nissan Internal',contactName:'Driver',contactEmail:'driver@test'},{registration:'POOL1',model:'Nissan Leaf',fleetGroup:'Nissan Pool Cars',contactPhone:'0123456789'},{registration:'CON1',model:'Van',customer:'Acme',fleetGroup:'Contractor Fleet'},{registration:'OLD',fleetGroup:'Nissan Internal',status:'Archived'},{registration:'DELETED',fleetGroup:'Nissan Internal'}],fleetCustomerProfiles:{NMUK:{primaryContact:'Fleet',telephone:'0191000000'},Acme:{primaryContact:'Chris',telephone:'0191111111',invoiceEmail:'accounts@test',address:'Unit 1, Estate\nSunderland'}},fleetIsDeletedRegistration:r=>r==='DELETED',fleetNormaliseCustomer:x=>x,fleetDisplayModel:x=>x||'',fleetGroupLabel:x=>x,fleetEffectiveContactEmail:v=>v.fleetGroup==='Contractor Fleet'?'acme@test':v.contactEmail||''};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function fleetVehicleContactExportRows('),html.indexOf('function fleetMaintenanceHtml(){')),ctx);return ctx;
}
test('exports complete group contacts with inherited contractor details and excludes archived/deleted vehicles',()=>{
 const c=context(),before=JSON.stringify(c.fleetVehicles);
 assert.equal(c.fleetVehicleContactExportRows('Nissan Internal').length,1);
 const pool=c.fleetVehicleContactExportRows('Nissan Pool Cars')[0];assert.equal(pool[4],'Fleet');assert.equal(pool[5],'0123456789');
 const contractor=c.fleetVehicleContactExportRows('Contractor Fleet')[0];assert.equal(contractor[4],'Chris');assert.equal(contractor[6],'acme@test');assert.equal(contractor[7],'accounts@test');assert.equal(contractor[8],'Unit 1, Estate\nSunderland');
 assert.equal(c.fleetVehicleContactExportRows('invalid').length,0);assert.equal(JSON.stringify(c.fleetVehicles),before);
});
test('CSV safely quotes commas, newlines and quotes, and neutralises spreadsheet formulas',()=>{
 const c=context();assert.equal(c.fleetContactCsvCell('A,"B"\nC'),'"A,""B""\nC"');
 for(const value of ['=1+1',' +441234','@SUM(A1)','-2','\t=1'])assert.equal(c.fleetContactCsvCell(value)[1],"'");
 assert.equal(c.fleetContactCsvCell('0123456789'),'"0123456789"');
});
