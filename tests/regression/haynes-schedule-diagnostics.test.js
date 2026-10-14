import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {readScheduleDiagnostics} from '../../workers/haynes/service-dom.mjs';
test('schedule diagnostics omit credentials, VIN, CSRF, arbitrary values and unrelated page text',()=>{
 const {document}=parseHTML(`<html><body>PRIVATEVIN123<form action="/touch/site/layout/maintenanceSchedule?_csrf=SECRETCSRF&typeId=t_619108899"><input name="password" value="SECRETPASSWORD"><input name="_csrf" value="SECRETCSRF"><label><input type="radio" name="maintenancePeriodId" value="mp_320815742">18,000 miles/24 months</label><select><option value="ms_319118557">Normal conditions (United Kingdom)</option></select><button onclick="submit('SECRETCSRF')">Continue</button><a href="/touch/site/layout/maintenanceSchedule?_csrf=SECRETCSRF">Continue</a></form></body></html>`);
 const result=vm.runInNewContext('('+readScheduleDiagnostics.toString()+')()',{document,location:new URL('https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_619108899&_csrf=SECRETCSRF'),URL,URLSearchParams});
 const json=JSON.stringify(result);
 for(const secret of ['PRIVATEVIN123','SECRETPASSWORD','SECRETCSRF'])assert.equal(json.includes(secret),false);
 assert.equal(result.choices[0].value,'mp_320815742');assert.equal(result.choices[0].label,'18,000 miles/24 months');
 assert.equal(result.continueControls.length,2);assert.equal(result.continueControls[0].onclick,true);
 assert.equal(result.forms[0].action,'/touch/site/layout/maintenanceSchedule?typeId=t_619108899');
});
