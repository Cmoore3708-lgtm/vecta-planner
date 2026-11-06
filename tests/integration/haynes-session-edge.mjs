// Isolated Windows acceptance fixture. Edge resolves the supplier hostname to
// the local HTTPS server and every other hostname to NOTFOUND. No supplier call.
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '../../workers/haynes/node_modules/playwright/index.mjs';
import { browserLookup } from '../../workers/haynes/vehicle-browser.mjs';
import { browserServiceLookup } from '../../workers/haynes/service-browser.mjs';
import { START } from '../../workers/haynes/session-recovery.mjs';

const fixtureFolder = process.argv[2];
const loginPath = '/touch/site/layout/wsdLogin';
const paths = new URL(START).pathname.split('/').slice(0,-1).join('/') + '/';
const login = '<section id="loginContent"><form method="POST" action="'+loginPath+'">' +
  '<input id="username" name="username"><input id="password" name="password" type="password">' +
  '<input type="checkbox" name="savePassword"><input type="submit" name="submit" value="Login">' +
  '<input type="hidden" name="_csrf" value="fixture"></form></section>';
const search = '<form action="modelDetail"><input id="numberPlate" name="numberPlate">' +
  '<input type="hidden" name="typeId" value="t_1"><button id="licencePlateBtn">Search</button></form>';
const model = '<a href="makesOverview?makeId=m_1">Fixture</a><a href="modelOverview?modelId=d_1">Test Car</a>' +
  '<a href="modelTypes?modelId=d_1">1.4 (A1) 2019 - 2020</a><div>Vehicle Registration Number: W23ADM<br>VIN: fixture</div>' +
  '<select onchange="location.href=\'/touch/site/layout/maintenanceSchedule?typeId=t_1&amp;maintenanceSystemId=ms_1\'">' +
  '<option>Select Maintenance system (United Kingdom)</option><option value="mp_1">10,000 miles/12 months</option></select>';
const schedule = '<select id="selectedPeriod"><option value="mp_1" selected>10,000 miles/12 months</option></select>' +
  '<ul id="partsList"><li><h3>Oil filter</h3></li></ul>';
let mode, authorised, submissions, expireAfterSearch;
const fixtureErrors = [];
function redirect(res, target) { res.writeHead(303,{location:target}); res.end(); }
const server = https.createServer({
  key:await fs.readFile(path.join(fixtureFolder,'server.key')),cert:await fs.readFile(path.join(fixtureFolder,'server.crt'))
}, async (req,res) => {
  try {
    const url = new URL(req.url, START);
    if (url.pathname === loginPath && req.method === 'POST') {
      submissions++;
      let body=''; for await(const chunk of req)body+=chunk;
      const fields=new URLSearchParams(body);
      assert.equal(fields.get('username'),'fixture'); assert.equal(fields.get('password'),'test-only');
      assert.equal(fields.get('_csrf'),'fixture'); assert.equal(fields.get('savePassword'),'on');
      if(mode!=='rejected'){authorised=true;return redirect(res,START);}
    }
    res.setHeader('Content-Type','text/html');
    if(url.pathname === loginPath){
      let form = mode==='foreign-action' ? login.replace('action="'+loginPath+'"','action="https://other.invalid/"') : login;
      if(mode==='challenge')form+='<input autocomplete="one-time-code">';
      res.end(form);return;
    }
    if(!authorised)return redirect(res,loginPath);
    if(url.pathname===paths+'modelDetail'){
      assert.equal(url.searchParams.get('numberPlate'),'W23ADM');
      if(expireAfterSearch){expireAfterSearch=false;authorised=false;return redirect(res,loginPath);}
      res.end(model);return;
    }
    if(url.pathname===paths+'maintenanceSchedule'){res.end(schedule);return;}
    res.end(search);
  } catch (error) { fixtureErrors.push(error);res.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'haynes-test-'));
let browser;
try {
  browser=await chromium.launchPersistentContext(profile,{
    channel:'msedge', headless:true, ignoreHTTPSErrors:true,
    args:['--disable-background-networking','--no-proxy-server',
      '--host-resolver-rules=MAP www.workshopdata.com 127.0.0.1:'+server.address().port+', MAP * ~NOTFOUND, EXCLUDE localhost']
  });
  const lookup=browserLookup(browser,{reusePage:true});
  const service=browserServiceLookup(browser);
  const marker=path.join(process.env.LOCALAPPDATA,'VectaHaynes','last-sign-in.json');
  for(const scenario of ['expired','mid-search','challenge','foreign-action','rejected']){
    mode=scenario;authorised=mode==='mid-search';expireAfterSearch=authorised;submissions=0;
    await fs.rm(marker,{force:true});
    if(mode==='expired'){
      const [vehicle, sheet]=await Promise.all([lookup('W23ADM'),service({registration:'W23ADM',mileage:10000,period:'mp_1'})]);
      assert.equal(vehicle.registration,'W23ADM');assert.deepEqual(sheet.parts,['Oil filter']);assert.equal(submissions,1);
    }else if(mode==='mid-search'){
      assert.equal((await lookup('W23ADM')).registration,'W23ADM');assert.equal(submissions,1);
    }else{
      const code=mode==='challenge'?'VERIFICATION_REQUIRED':'LOGIN_REQUIRED';
      await assert.rejects(lookup('W23ADM'),{code});
      await assert.rejects(lookup('W23ADM'),{code});
      assert.equal(submissions,mode==='rejected'?1:0);
    }
    assert.deepEqual(fixtureErrors,[]);
    console.log('Passed Windows Edge sign-in scenario:',scenario);
  }
}finally{
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  await fs.rm(profile,{recursive:true,force:true});
}
