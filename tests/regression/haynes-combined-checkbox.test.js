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
test('checkbox selection clears other periods in the matching system and checks the selected interval using labels',async()=>{
 const links=fixture();const selected=links[1];const checked={'mp_320815741':true,'mp_320815742':false};const clicks=[];
 const page={locator(selector){const id=selector.match(/(?:id|for)="(mp_\d+)"/)[1];return {isChecked:async()=>checked[id],click:async()=>{clicks.push(id);checked[id]=!checked[id];}};}};
 await selectCheckboxSchedule(page,selected,links);
 assert.deepEqual(clicks,['mp_320815741','mp_320815742']);assert.equal(checked.mp_320815741,false);assert.equal(checked.mp_320815742,true);
 await selectCheckboxSchedule(page,selected,links);assert.equal(clicks.length,2);
});
