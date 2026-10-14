import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {readConditionSchedules} from '../../workers/haynes/service-dom.mjs';
import {selectServicePeriod} from '../../lib/haynes-service.js';
import {HaynesError} from '../../lib/haynes-vehicle.js';
const location=new URL('https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_619108899&ktypNr=148229');
function fixture({system='maintenanceSystem_ms_319118557',period='mp_320815742'}={}){
 const {document}=parseHTML(`<li class="dropdown active all"><a class="arrow" id="${system}" href="#"></a><ul class="dropdown-items combinedMaintenanceList"><li class="combinableSystem_period"><label for="mp_320815741">9,000 miles/12 months</label><span class="custom-checkbox"></span><input id="mp_320815741" type="checkbox" maintenanceperiodid="mp_320815741"></li><li class="combinableSystem_period active checked"><label for="${period}">18,000 miles/24 months</label><span class="custom-checkbox"></span><input id="${period}" checked type="checkbox" maintenanceperiodid="${period}"></li></ul></li>`);
 return vm.runInNewContext('('+readConditionSchedules.toString()+')()',{document,location,URL});
}
test('confirmed combined checkbox markup yields matching system, period and label without a form',()=>{
 const links=fixture();assert.equal(links.length,2);
 const selected=selectServicePeriod(links,{mileage:15000,system:'ms_319118557',typeId:'t_619108899'});
 assert.equal(selected.checkboxId,'mp_320815742');assert.equal(selected.systemHeadingId,'maintenanceSystem_ms_319118557');
 assert.equal(new URL(selected.href).searchParams.get('maintenancePeriodId'),'mp_320815742');
 assert.equal(selectServicePeriod(links,{mileage:15000,system:'ms_999',typeId:'t_619108899'}),undefined);
 assert.equal(fixture({system:'maintenanceSystem_unknown'}).length,0);assert.equal(fixture({period:'invalid'}).length,1);
});
const source=fs.readFileSync(new URL('../../workers/haynes/service-browser.mjs',import.meta.url),'utf8');
const selectCheckboxSchedule=vm.runInNewContext('('+source.slice(source.indexOf('export async function selectCheckboxSchedule')).replace(/^export /,'')+')',{HaynesError});

function duplicatedPage({bothVisible=false}={}) {
 const markup=hidden=>`<section ${hidden?'hidden':''}><li class="dropdown"><a id="maintenanceSystem_ms_319118557"></a><ul><li class="combinableSystem_period"><label for="mp_320815741">9,000 miles/12 months</label><input id="mp_320815741" type="checkbox" checked maintenanceperiodid="mp_320815741"></li><li class="combinableSystem_period"><label for="mp_320815742">18,000 miles/24 months</label><input id="mp_320815742" type="checkbox" maintenanceperiodid="mp_320815742"></li></ul></li></section>`;
 const {document}=parseHTML('<html><body>'+markup(false)+markup(!bothVisible)+'</body></html>');
 const clicks=[];
 function locator(nodes,selector='') {
   const one=()=>{if(nodes.length!==1)throw Error('strict mode violation: '+nodes.length);return nodes[0];};
   return {nodes,selector,
     count:async()=>nodes.length,nth:n=>locator([nodes[n]]),
     filter:({has})=>locator(nodes.filter(n=>n.querySelector(has.selector))),
     locator:selector=>locator(nodes.flatMap(n=>Array.from(n.querySelectorAll(selector))),selector),
     isVisible:async()=>!one().closest('[hidden]'),
     isChecked:async()=>one().hasAttribute('checked'),
     click:async()=>{const label=one();assert.equal(Boolean(label.closest('[hidden]')),false);const input=label.closest('li.combinableSystem_period').querySelector('input');if(input.hasAttribute('checked'))input.removeAttribute('checked');else input.setAttribute('checked','');clicks.push(input.id);}
   };
 }
 return {document,clicks,page:{locator:selector=>locator(Array.from(document.querySelectorAll(selector)),selector)}};
}
test('duplicate desktop/mobile IDs select only the displayed system and leave the hidden copy unchanged',async()=>{
 const links=fixture(),selected=links[1];const {document,page,clicks}=duplicatedPage();
 await assert.rejects(page.locator('input[id="mp_320815741"]').isChecked(),/strict mode violation/);
 await selectCheckboxSchedule(page,selected,[...links,...links]);
 assert.deepEqual(clicks,['mp_320815741','mp_320815742']);
 const sections=document.querySelectorAll('section');
 assert.equal(sections[0].querySelector('[id="mp_320815741"]').hasAttribute('checked'),false);
 assert.equal(sections[0].querySelector('[id="mp_320815742"]').hasAttribute('checked'),true);
 assert.equal(sections[1].querySelector('[id="mp_320815741"]').hasAttribute('checked'),true);
 assert.equal(sections[1].querySelector('[id="mp_320815742"]').hasAttribute('checked'),false);
 await selectCheckboxSchedule(page,selected,links);assert.equal(clicks.length,2);
});
test('two displayed copies are rejected before changing any checkbox',async()=>{
 const {page,clicks}=duplicatedPage({bothVisible:true});const links=fixture();
 await assert.rejects(selectCheckboxSchedule(page,links[1],links),{code:'SCHEDULE_REQUIRED'});assert.equal(clicks.length,0);
});
