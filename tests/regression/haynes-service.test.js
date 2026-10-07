import { createServiceTaskRunner } from '../../workers/haynes/service-task.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { serviceRequest, serviceResult, selectServicePeriod } from '../../lib/haynes-service.js';
import { readSchedule, readOil } from '../../workers/haynes/service-dom.mjs';
const vehicle={registration:'FX69XWU',typeId:'t_619016977',make:'NISSAN',model:'Qashqai (J11)',variant:'1.7 dCi',imageUrl:'https://www.haynespro-assets.com/workshop/images/123.svg',vin:'SECRET',cookies:'SECRET'};
test('Service requires actual positive integer mileage and rejects mismatched returned context',()=>{
 for(const mileage of ['',0,-1,1.5,2000001])assert.throws(()=>serviceRequest({registration:'FX69XWU',mileage}));
 const request=serviceRequest({registration:'fx69 xwu',mileage:50000});
 const raw={vehicle,mileage:50000,period:'mp_319723152',schedule:'50,000 miles/48 months',oil:[{specification:'SAE 5W-30 · ACEA C3',capacity:'Engine sump, including filter 5.9 (l)'}],parts:['Oil filter'],additional:['Renew the air filter every 37,500 miles/36 months']};
 assert.throws(()=>serviceResult({...raw,mileage:48609},request));
 assert.throws(()=>serviceResult(raw,{...request,period:'mp_2'}));
 assert.throws(()=>serviceResult({...raw,vehicle:{...vehicle,registration:'AB12CDE'}},request));
 const result=serviceResult(raw,request);assert.equal(result.vehicle.vin,undefined);assert.equal(result.vehicle.cookies,undefined);assert.equal(result.requiresConfirmation,true);assert.match(result.oil[0].capacity,/5.9/);
});
function dom(html,fn){const prior=globalThis.document,css=globalThis.getComputedStyle;globalThis.document=parseHTML(html).document;globalThis.getComputedStyle=()=>({display:'block'});try{return fn();}finally{globalThis.document=prior;globalThis.getComputedStyle=css;}}
test('Haynes parts quantities are not oil capacities; additional intervals stay separate from scheduled parts',()=>{
 const result=dom('<select id="selectedPeriod"><option value="mp_1" selected>50,000 miles/48 months</option></select><ul id="partsList"><li><h3>Engine oil</h3><input value="1.00"></li><li><h3>Oil filter</h3></li></ul><ul><li><h3>Renew the fuel filter <span>every 37,500 miles/36 months</span></h3><input id="addSentence_123"></li><li><h3>Renew the engine oil</h3></li><li><a href="https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_1">Go to Lubricants page</a></li><li><h3>FOLLOW UP Renew brake pedal</h3><input id="timeCheckBoxAddWork_1"></li></ul>',readSchedule);
 assert.deepEqual(result.parts,['Engine oil','Oil filter']);assert.deepEqual(result.additional,['Renew the fuel filter every 37,500 miles/36 months']);assert.match(result.oilLink,/lubricants/);
});
test('Oil extraction preserves specification, fill context and applicability and excludes coolant',()=>{
 const oil=dom('<div class="filter-lubricant-data"><h2>Engine (except North America)</h2><ul><li><p>Engine oil</p><span class="lube_value1">SAE 5W-30</span><span class="lube_value2">ACEA C3</span></li><li class="note">Engine sump, including filter 5.9 (l)</li></ul></div><div class="filter-lubricant-data"><h2>Cooling system</h2><li><p>Coolant</p><span class="lube_value1">L255N</span></li></div>',readOil);
 assert.deepEqual(oil,[{applicability:'Engine (except North America)',specification:'SAE 5W-30 · ACEA C3',capacity:'Engine sump, including filter 5.9 (l)'}]);
});

test('duplicate desktop/mobile links cannot let an age interval override a higher mileage interval',()=>{
 const link=(m,months,id,system='ms_1')=>({label:m+' miles/'+months+' months',href:'https://www.workshopdata.com/touch/site/layout/maintenanceSchedule?typeId=t_1&maintenanceSystemId='+system+'&maintenancePeriodId='+id});
 const links=[link('50,000',48,'mp_1'),link('87,500',84,'mp_2'),link('200,000',192,'mp_3')];
 const duplicated=[...links,...links,link('200,000',192,'mp_4','ms_2')];
 assert.equal(selectServicePeriod(duplicated,{mileage:190000,ageMonths:84,system:'ms_1',typeId:'t_1'}).label,'200,000 miles/192 months');
 assert.equal(selectServicePeriod(duplicated,{mileage:50000,ageMonths:84,system:'ms_1',typeId:'t_1'}).label,'87,500 miles/84 months');
 assert.equal(selectServicePeriod(duplicated,{mileage:50000,period:'mp_4',system:'ms_1',typeId:'t_1'}),undefined);
});

test('service reads leave the caller free for booking polling and cannot overlap another service read',async()=>{
 let release;const reading=new Promise(r=>release=r),completed=[];
 const runner=createServiceTaskRunner(()=>reading,r=>completed.push(r));
 assert.equal(runner.start({id:'first',lease:'lease',request:{mileage:50000}}),true);
 assert.equal(runner.busy,true);assert.equal(runner.start({id:'second'}),false);
 let bookingPolled=false;await Promise.resolve().then(()=>bookingPolled=true);assert.equal(bookingPolled,true);assert.equal(completed.length,0);
 release({mileage:50000});await runner.done;assert.equal(completed[0].id,'first');assert.equal(runner.busy,false);
});
