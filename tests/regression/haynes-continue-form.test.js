import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {readConditionSchedules} from '../../workers/haynes/service-dom.mjs';
import {selectServicePeriod} from '../../lib/haynes-service.js';
function read({token='fresh-token',method='get',action='/touch/site/layout/maintenanceSchedule',system='ms_319118557'}={}){
 const {document}=parseHTML(`<html><body><form method="${method}" action="${action}"><input name="typeId" value="t_619108899"><input name="maintenanceSystemId" value="${system}"><input name="_csrf" value="${token}"><input name="currentTypeCar" value="t_619108899"><input name="currentSubject" value="MAINTENANCE"><input name="currentPage" value="SCHEDULES"><label><input type="radio" name="maintenancePeriodId" value="mp_320815741">9,000 miles/12 months</label><label><input type="radio" name="maintenancePeriodId" value="mp_320815742">18,000 miles/24 months</label><button>Continue</button></form></body></html>`);
 return vm.runInNewContext('('+readConditionSchedules.toString()+')()',{document,location:new URL('https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_619108899&ktypNr=148229'),URL});
}
test('CM14 KEL Continue form uses the live token and selects the matching 18k schedule',()=>{
 const links=read();assert.equal(links.length,2);
 const selected=selectServicePeriod(links,{mileage:15000,ageMonths:22,typeId:'t_619108899',system:'ms_319118557'});
 const url=new URL(selected.href);assert.equal(url.searchParams.get('maintenancePeriodId'),'mp_320815742');assert.equal(url.searchParams.get('_csrf'),'fresh-token');assert.equal(url.searchParams.get('currentTypeCar'),'t_619108899');
 assert.equal(new URL(read({token:'replacement-token'})[1].href).searchParams.get('_csrf'),'replacement-token');
});
test('Continue reader rejects external destinations, POST actions and invalid systems',()=>{
 assert.equal(read({action:'https://evil.example/touch/site/layout/maintenanceSchedule'}).length,0);
 assert.equal(read({method:'post'}).length,0);assert.equal(read({system:'wrong'}).length,0);
 assert.equal(selectServicePeriod(read(),{mileage:15000,typeId:'t_999',system:'ms_319118557'}),undefined);
});
