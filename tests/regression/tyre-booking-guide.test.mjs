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
 const old={url:process.env.TYRE_WORKER_URL,token:process.env.TYRE_WORKER_TOKEN,relay:process.env.HAYNES_RELAY_SITE_TOKEN};delete process.env.HAYNES_RELAY_SITE_TOKEN;delete process.env.TYRE_WORKER_URL;delete process.env.TYRE_WORKER_TOKEN;
 try{let r=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:1}},r);assert.equal(r.body.status,'NOT_CONFIGURED');assert.equal(r.headers['Cache-Control'],'no-store');r=response();await tyreGuide({method:'POST',body:{size:'205/55R16',quantity:9}},r);assert.equal(r.code,400)}finally{for(const [key,value]of [['TYRE_WORKER_URL',old.url],['TYRE_WORKER_TOKEN',old.token],['HAYNES_RELAY_SITE_TOKEN',old.relay]])value===undefined?delete process.env[key]:process.env[key]=value}
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
 assert.match(context.tyreBookingDescription(),/Tyre quantity: 1/);assert.match(context.tyreBookingDescription(),/£62 total including VAT/);assert.doesNotMatch(context.tyreBookingDescription(),/guide/i);assert.doesNotMatch(document.querySelector('.tyre-picker').textContent,/guide/i);assert.match(document.querySelector('.tyre-picker').textContent,/If the brand changes it’s due to limited stock levels/);
 form.tyre_size='225/45R17';assert.doesNotMatch(context.tyreBookingDescription(),/£62/);
 form.nevos_vehicle='yes';document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();assert.equal(document.querySelector('[data-tyre-choice="Budget"]').disabled,true);assert.equal(document.querySelector('[data-tyre-choice="Premium"]').disabled,false);
});
test('standalone website ships the same tyre assets and forwards only the tyre lookup switch',async()=>{
 for(const path of ['js/vecta-tyre-booking.js','js/vecta-tyre-booking.css','assets/tyre-guide-cutout.webp'])assert.deepEqual(readFileSync(new URL('../../website/'+path,import.meta.url)),readFileSync(new URL('../../public/'+path,import.meta.url)));
 const {default:website}=await import('../../website/api/availability.js');const original=global.fetch,calls=[];
 try{global.fetch=async(url)=>{calls.push(url);return{status:200,headers:new Map([['content-type','application/json']]),text:async()=>'{}'}};
 for(const query of [{tyres:'1',unrelated:'ignored'},{}]){const r=response();r.send=body=>{r.body=body;return r};await website({method:'POST',query,body:{size:'205/55R16',quantity:1}},r);assert.equal(r.code,200)}
 assert.deepEqual(calls,['https://vecta-planner.vercel.app/api/availability?tyres=1','https://vecta-planner.vercel.app/api/availability']);
 }finally{global.fetch=original}
});
test('number-only size entry keeps separators fixed and searches only on Check Live Prices',async()=>{
 const {parseHTML}=await import('linkedom'),{document}=parseHTML('<html><body><main></main></body></html>'),calls=[];
 const form={job_types:['Tyres'],tyre_size:'',tyre_quantity:1,tyre_choice:'Budget',nevos_vehicle:'no'};
 const context=vm.createContext({document,state:{form},setTimeout,clearTimeout,AbortController,Intl,Date,renderActions(){},esc:String,fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>payload()}}});
 vm.runInContext(readFileSync(new URL('../../public/js/vecta-tyre-booking.js',import.meta.url),'utf8'),context);
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();context.bindTyreSearch();
 const inputs=[...document.querySelectorAll('[data-tyre-part]')],button=document.querySelector('[data-tyre-check]');assert.deepEqual(inputs.map(e=>e.getAttribute('placeholder')),['205','55','16']);assert.deepEqual([...document.querySelectorAll('.tyre-size-parts>span')].map(e=>e.textContent),['/','R']);
 button.click();await tick();assert.equal(calls.length,0);assert.match(document.querySelector('#tyreGuideStatus').textContent,/Enter all three numbers/);
 for(const [index,value]of ['2a05','55','16'].entries()){inputs[index].value=value;inputs[index].oninput();}await tick();assert.equal(form.tyre_size,'205/55R16');assert.equal(calls.length,0);
 button.click();await tick();assert.equal(calls.length,1);assert.deepEqual(calls[0].body,{size:'205/55R16',quantity:1});assert.equal(document.querySelector('.tyre-guide-price').textContent,'£62');
 inputs[1].value='60';inputs[1].oninput();assert.equal(form.tyre_guide,null);assert.equal(document.querySelectorAll('.tyre-guide-price').length,0);assert.equal(document.querySelector('.tyre-brand-empty').textContent,'£TBC');await tick();assert.equal(calls.length,1);
 let prevented=false;inputs[0].onpaste({clipboardData:{getData:()=>'225/45R17'},preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(form.tyre_size,'225/45R17');assert.deepEqual(inputs.map(e=>e.value),['225','45','17']);assert.equal(calls.length,1);
 vm.runInContext('tyreLookup.dispose()',context);
});
test('quantity buttons automatically refresh checked prices and select sufficient stock without another search click',async()=>{
 const {parseHTML}=await import('linkedom'),{document}=parseHTML('<html><body><main></main></body></html>'),calls=[];
 const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'Budget',nevos_vehicle:'no'};
 const context=vm.createContext({document,state:{form},setTimeout,clearTimeout,AbortController,Intl,Date,renderActions(){},esc:String,fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);return{ok:true,json:async()=>payload(body.quantity)}}});
 vm.runInContext(readFileSync(new URL('../../public/js/vecta-tyre-booking.js',import.meta.url),'utf8'),context);
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();context.bindTyreSearch();
 const step=(range,direction)=>document.querySelector(`[data-tyre-range="${range}"][data-tyre-quantity-step="${direction}"]`).click();
 try{
  step('Budget','1');await tick();assert.equal(calls.length,0,'initial size search still requires the search button');
  step('Budget','-1');document.querySelector('[data-tyre-check]').click();await tick();
  assert.equal(document.querySelector('[data-tyre-choice="Premium"]').closest('.tyre-guide-card').querySelector('.tyre-guide-price').textContent,'£95');
  step('Premium','1');assert.equal(form.tyre_guide,null,'old quantity quote must not be saved while checking');await tick();
  assert.deepEqual(calls,[{size:'205/55R16',quantity:1},{size:'205/55R16',quantity:2}]);
  assert.equal(document.querySelector('[data-tyre-choice="Premium"]').closest('.tyre-guide-card').querySelector('.tyre-guide-price').textContent,'£101','premium stock for one must not be reused for two');
  assert.equal(document.querySelectorAll('.tyre-guide-total')[2].textContent,'2 tyres: £202');
  assert.equal(form.tyre_guide.totalPence,20200);assert.equal(form.tyre_guide.quantity,2);
  for(const card of document.querySelectorAll('.tyre-guide-card')){assert.doesNotMatch(card.textContent,/guide/i);assert.match(card.textContent,/per tyre · fully fitted/)}
  step('Premium','-1');await tick();assert.equal(form.tyre_guide.totalPence,9500);assert.equal(calls.length,2,'fresh quantity cache avoids unnecessary supplier calls');
 }finally{vm.runInContext('tyreLookup.dispose()',context)}
});
test('a temporary lookup failure retries once while the customer still sees a pulsing checking message',async()=>{
 const {parseHTML}=await import('linkedom'),{document}=parseHTML('<html><body><main></main></body></html>'),pending=[];
 const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'Budget',nevos_vehicle:'no'};
 const context=vm.createContext({document,state:{form},setTimeout,clearTimeout,AbortController,Intl,Date,renderActions(){},esc:String,fetch:async(_url,options)=>({ok:true,json:()=>new Promise(resolve=>pending.push({body:JSON.parse(options.body),resolve}))})});
 vm.runInContext(readFileSync(new URL('../../public/js/vecta-tyre-booking.js',import.meta.url),'utf8'),context);
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();context.bindTyreSearch();
 try{
  document.querySelector('[data-tyre-check]').click();await tick();const status=document.querySelector('#tyreGuideStatus');
  assert.equal(status.classList.contains('is-checking'),true);assert.match(status.textContent,/Checking live database for availability & prices\./);
  pending[0].resolve({status:'UNAVAILABLE'});await tick();assert.equal(pending.length,2);assert.deepEqual(pending[0].body,pending[1].body);
  assert.equal(status.classList.contains('is-checking'),true);assert.doesNotMatch(status.textContent,/unavailable/);
  pending[1].resolve(payload());await tick();assert.equal(status.classList.contains('is-checking'),false);assert.equal(form.tyre_guide.unitPence,6200);
  const css=readFileSync(new URL('../../public/js/vecta-tyre-booking.css',import.meta.url),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 }finally{vm.runInContext('tyreLookup.dispose()',context)}
});
test('retry is bounded and never repeats login, offline, configuration failures or invalid prices',async()=>{
 const c=client();
 for(const status of ['UNAVAILABLE','LOGIN_REQUIRED','SETTINGS_REQUIRED','OFFLINE','NOT_CONFIGURED','BUSY','DAILY_LIMIT']){
  let calls=0;const ctrl=c.createController({delay:0,fetchGuide:async()=>{calls++;return{status}}});
  ctrl.update('205/55R16',1);await tick();assert.equal(calls,status==='UNAVAILABLE'?2:1,status);assert.equal(ctrl.getState().status,'unavailable');ctrl.dispose();
 }
 let calls=0;const ctrl=c.createController({delay:0,fetchGuide:async()=>{calls++;return{...payload(),quantity:4}}});ctrl.update('205/55R16',1);await tick();assert.equal(calls,1);assert.equal(ctrl.getState().result,null);ctrl.dispose();
});
test('changing the size cancels an unavailable result before it can launch a retry',async()=>{
 const c=client(),pending=[];const ctrl=c.createController({delay:0,fetchGuide:(size,quantity,signal)=>new Promise(resolve=>pending.push({size,signal,resolve}))});
 ctrl.update('205/55R16',1);await tick();ctrl.update('',1);pending[0].resolve({status:'UNAVAILABLE'});await tick();assert.equal(pending[0].signal.aborted,true);assert.equal(pending.length,1);assert.equal(ctrl.getState().status,'idle');ctrl.dispose();
});
test('three brand rows per range select and retain the actual brand in booking review and notes',async()=>{
 const {parseHTML}=await import('linkedom'),{document}=parseHTML('<html><body><main></main></body></html>');
 const form={job_types:['Tyres'],tyre_size:'205/55R16',tyre_quantity:1,tyre_choice:'',nevos_vehicle:'no'};
 const context=vm.createContext({document,state:{form},VectaTyreBooking:client(),renderActions(){},esc:String,Intl,Date});
 const html=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 vm.runInContext(html.slice(html.indexOf('let tyreGuideState='),html.indexOf('function pricingHtml(')),context);
 document.querySelector('main').innerHTML=context.tyreOptionsHtml();
 vm.runInContext('tyreGuideState={status:"matched",result:'+JSON.stringify(payload())+'};refreshTyrePanel()',context);
 assert.deepEqual([...document.querySelectorAll('.tyre-guide-card')].map(card=>card.querySelectorAll('.tyre-brand-choice').length),[3,3,3]);
 assert.equal(document.querySelectorAll('.tyre-brand-label').length,3);
 document.querySelector('[data-tyre-brand="KUMHO"]').click();
 assert.equal(form.tyre_choice,'Mid Range');assert.equal(form.tyre_brand,'KUMHO');assert.equal(form.tyre_guide.unitPence,7500);
 assert.match(context.tyreBookingDescription(),/Tyre: KUMHO/);assert.match(context.tyreBookingDescription(),/£75 total including VAT/);
 assert.equal(document.querySelector('[data-tyre-brand="KUMHO"]').getAttribute('aria-pressed'),'true');
 const review=html.match(/function tyreReviewHtml\(\)[^\n]+/)[0];vm.runInContext(review,context);
 assert.match(context.tyreReviewHtml(),/KUMHO/);assert.match(context.tyreReviewHtml(),/£75/);
 form.nevos_vehicle='yes';document.querySelector('main').innerHTML=context.tyreOptionsHtml();context.bindTyreCards();
 for(const row of document.querySelectorAll('[data-tyre-brand]'))assert.equal(row.disabled,row.dataset.tyreChoice!=='Premium');
 const old=form.tyre_brand;document.querySelector('[data-tyre-brand="COMFORSER"]').click();assert.equal(form.tyre_brand,old);
});
test('choice validation accepts legacy single-brand responses and rejects malformed or duplicated extra brands',()=>{
 const c=client(),p=payload();
 const legacy={...p,options:p.options.map(({choices,...rest})=>rest)};
 assert.equal(c.cleanResult(legacy,p.size,1).options[0].choices.length,1);
 for(const choices of [[],Array(4).fill(p.options[0].choices[0]),[p.options[0].choices[0],p.options[0].choices[0]],[p.options[0].choices[0],{...p.options[0].choices[1],totalPence:1}]]){
  assert.throws(()=>c.cleanResult({...p,options:[{...p.options[0],choices},...p.options.slice(1)]},p.size,1));
 }
});

