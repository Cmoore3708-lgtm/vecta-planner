import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { serviceRequest, serviceResult } from '../../lib/haynes-service.js';
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
