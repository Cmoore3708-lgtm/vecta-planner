import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import tyreGuide from '../../lib/tyre-guide-proxy.js';
import {selectCatalogueGuides} from '../../workers/tyres/tiers.mjs';
const fixtures=JSON.parse(readFileSync(new URL('../../workers/tyres/confirmed-catalogue-fixture.json',import.meta.url)));
const fixture=fixtures.find(f=>f.requestedSize==='205/55R16');
const payload=(quantity=1)=>({status:'MATCHED',...selectCatalogueGuides(fixture.guideCatalogue,{size:fixture.requestedSize,quantity,settings:fixture.settings})});
function client(){const ctx={setTimeout,clearTimeout,AbortController,Date};vm.runInNewContext(readFileSync(new URL('../../public/js/vecta-tyre-booking.js',import.meta.url),'utf8'),ctx);return ctx.VectaTyreBooking;}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('customer input normalises sizes and rejects incomplete or unsafe guides',()=>{
 const c=client();assert.equal(c.sizeKey('205/55r16'),'205/55R16');assert.equal(c.sizeKey('205/55/16'),'205/55R16');assert.equal(c.sizeKey('205/55'),null);
});
test('guide validation rejects expired prices, wrong size, wrong quantity and inconsistent totals',()=>{
 const c=client(),p=payload();assert.equal(c.cleanResult(p,'205/55R16',1).options[0].unitPence,6200);
 for(const patch of [{size:'225/45R17'},{quantity:4},{guideOnly:false},{checkedAt:'2020-01-01T00:00:00Z'},{options:[{...p.options[0],totalPence:1},...p.options.slice(1)]}])assert.throws(()=>c.cleanResult({...p,...patch},'205/55R16',1));
});
test('latest size wins when responses finish out of order; quantity refreshes exact totals',async()=>{
 const c=client(),pending=[],seen=[];
 const ctrl=c.createController({delay:0,onChange:s=>seen.push(s),fetchGuide:(size,quantity)=>new Promise(resolve=>pending.push({size,quantity,resolve}))});
 ctrl.update('205/55R16',1);await tick();ctrl.update('205/55R16',2);await tick();
 pending[1].resolve(payload(2));await tick();pending[0].resolve(payload(1));await tick();
 assert.equal(ctrl.getState().result.quantity,2);assert.equal(ctrl.getState().result.options[2].totalPence,20200);
 ctrl.update('205/55R16',1);await tick();pending[2].resolve(payload(1));await tick();ctrl.update('205/55R16',2);assert.equal(ctrl.getState().status,'matched');assert.equal(pending.length,3);
 ctrl.update('',1);assert.equal(ctrl.getState().result,null);ctrl.dispose();
});
test('supplier failures leave no stale price on screen',async()=>{
 const c=client(),ctrl=c.createController({delay:0,fetchGuide:async()=>{throw Error('offline')}});ctrl.update('205/55R16',1);await tick();assert.equal(ctrl.getState().status,'unavailable');assert.equal(ctrl.getState().result,null);ctrl.dispose();
});
function response(){return{code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}}}
test('public endpoint fails closed without worker configuration and rejects malformed requests',async()=>{
 const old={url:process.env.TYRE_WORKER_URL,token:process.env.TYRE_WORKER_TOKEN};delete process.env.TYRE_WORKER_URL;delete process.env.TYRE_WORKER_TOKEN;
 try{let r=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:1}},r);assert.equal(r.body.status,'NOT_CONFIGURED');assert.equal(r.headers['Cache-Control'],'no-store');r=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:9}},r);assert.equal(r.code,400)}finally{for(const [key,value]of [['TYRE_WORKER_URL',old.url],['TYRE_WORKER_TOKEN',old.token]])value===undefined?delete process.env[key]:process.env[key]=value}
});
test('public endpoint derives prices from verified Sellout catalogue and strips supplier fields',async()=>{
 const old={url:process.env.TYRE_WORKER_URL,token:process.env.TYRE_WORKER_TOKEN,fetch:global.fetch};process.env.TYRE_WORKER_URL='https://worker.example';process.env.TYRE_WORKER_TOKEN='x'.repeat(32);
 try{global.fetch=async(url,opts)=>{assert.equal(url.href,'https://worker.example/quote');assert.equal(opts.headers.Authorization,'Bearer '+'x'.repeat(32));return{ok:true,text:async()=>JSON.stringify({status:'MATCHED',size:'205/55R16',checkedAt:new Date().toISOString(),catalogue:fixture.guideCatalogue,settings:fixture.settings,Cost:1})}};const r=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:2}},r);assert.equal(r.body.status,'MATCHED');assert.deepEqual(r.body.options.map(x=>x.totalPence),[12400,14800,20200]);assert.equal(JSON.stringify(r.body).includes('Cost'),false);
 global.fetch=async()=>({ok:true,text:async()=>JSON.stringify({status:'MATCHED',size:'225/45R17',checkedAt:new Date().toISOString(),catalogue:fixture.guideCatalogue,settings:fixture.settings})});const bad=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:1}},bad);assert.equal(bad.body.status,'UNAVAILABLE');
 }finally{global.fetch=old.fetch;for(const[key,value]of [['TYRE_WORKER_URL',old.url],['TYRE_WORKER_TOKEN',old.token]])value===undefined?delete process.env[key]:process.env[key]=value}
});
test('actual booking cards render the cutout, preserve selection and save the selected guide in booking notes',async()=>{
 const {parseHTML}=await import('linkedom');const {document}=parseHTML('<html><body><main></main></body></html>');
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'',nevos_vehicle:'no'};
 const context=vm.createContext({document,state:{form},VectaTyreBooking:client(),renderActions(){},esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;'),Intl,Date});
 vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();
 vm.runInContext('tyreGuideState={status:"matched",result:'+JSON.stringify(payload())+'};refreshTyrePanel()',context);
 assert.equal(document.querySelectorAll('.tyre-cutout').length,3);assert.equal(document.querySelectorAll('.tyre-guide-price')[0].textContent,'£62');
 document.querySelector('[data-tyre-choice="Budget"]').click();assert.equal(form.tyre_guide.unitPence,6200);assert.equal(document.querySelector('.selected').querySelector('strong').textContent,'Budget');
 assert.match(context.tyreBookingDescription(),/Tyre quantity: 1/);assert.match(context.tyreBookingDescription(),/£62 total including VAT/);
 form.tyre_size='225/45R17';assert.doesNotMatch(context.tyreBookingDescription(),/£62/);
 form.nevos_vehicle='yes';document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();assert.equal(document.querySelector('[data-tyre-choice="Budget"]').disabled,true);assert.equal(document.querySelector('[data-tyre-choice="Premium"]').disabled,false);
});
