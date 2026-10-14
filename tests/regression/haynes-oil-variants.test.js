import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {readOil,readSchedule} from '../../workers/haynes/service-dom.mjs';
import {serviceResult} from '../../lib/haynes-service.js';
test('supplier preferred and alternative oil rows retain grade, standard and temperature conditions',()=>{
 const rows=[['Preferred','All temperatures','SAE 0W-20','API SN'],['Alternative','All temperatures','SAE 0W-20','API SP'],['Alternative','Above -30 °C','SAE 5W-30','ILSAC GF-6']];
 const html=rows.map(([kind,temp,grade,standard])=>`<li><p>Engine oil (${kind} lubricant specification)<br>${temp}</p><span class="lube_value1">${grade}</span><span class="lube_value2">${standard}</span><span class="lube_value3"></span></li>`).join('');
 const {document}=parseHTML(`<div class="filter-lubricant-data"><h2>Engine</h2><div class="repair-items"><ul>${html}<li><p>Gear oil</p><span class="lube_value1">OTHER</span></li></ul></div></div><div class="filter-lubricant-data" hidden><h2>Other engine</h2><li><p>Engine oil</p><span class="lube_value1">HIDDEN</span></li></div>`);
 const oil=vm.runInNewContext('('+readOil.toString()+')()',{document,getComputedStyle:()=>({display:'block'})});
 assert.equal(oil.length,3);assert.match(oil[0].applicability,/Preferred lubricant specification.*All temperatures/);assert.equal(oil[0].specification,'SAE 0W-20 · API SN');assert.match(oil[2].applicability,/Alternative lubricant specification.*Above -30 °C/);assert.equal(oil[2].specification,'SAE 5W-30 · ILSAC GF-6');
 const result=serviceResult({vehicle:{registration:'CM14KEL',make:'NISSAN',model:'Qashqai',variant:'1.5 e-Power',typeId:'t_619108899'},mileage:15000,period:'mp_320815742',schedule:'18,000 miles/24 months',oil:oil.map(x=>({...x,capacity:'Engine sump, including filter 5.1 (l)'}))},{registration:'CM14KEL',mileage:15000});
 assert.equal(result.oil.length,3);assert.equal(result.oil[2].capacity,'Engine sump, including filter 5.1 (l)');
});
test('schedule blue smart lubricant link and sump quantity remain linked to the engine-oil operation',()=>{
 const href='https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_619108899&smartLinkLubricant=true&componentId=adjcd_307888';
 const {document}=parseHTML(`<ul><li><h3>Renew the engine oil *</h3><p>Engine, Engine sump, including filter 5.1 (l)</p><a href="${href}">Go to Lubricants page</a></li></ul>`);
 const data=vm.runInNewContext('('+readSchedule.toString()+')()',{document,URL});assert.equal(data.oilLink,href);assert.equal(data.oilCapacity,'Engine, Engine sump, including filter 5.1 (l)');
});
