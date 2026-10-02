import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const rulesSource=fs.readFileSync('public/js/vecta-haynes-rules.js','utf8');
const core=vm.createContext({URL,Date});vm.runInContext(rulesSource,core);const R=core.VectaHaynesRules;
const request={registration:'FX69 XWU',mileage:74000,conditions:'normal',period:'12,500 miles/12 months'};
const raw={registration:'FX69XWU',vehicle:'Nissan Qashqai 1.7 dCi',period:request.period,sourceUrl:'https://www.workshopdata.com/touch/site/layout/maintenanceSchedule?typeId=t_619016977',operations:['Renew the engine oil','Renew the oil filter','Check the brake fluid','FOLLOW UP Renew the brake pedal'],parts:['Oil filter'],additionalWork:['Renew the fuel filter every 37,500 miles/36 months'],oil:['Engine oil SAE 5W-30 ACEA C3','Engine sump, including filter 5.9 (l)'],labourHours:'1.30'};

test('normalisation keeps specs, parts and conditional work separate from the checklist',()=>{
  const data=R.normalise(raw,request);assert.equal(data.registration,'FX69XWU');assert.equal(data.labourHours,1.3);assert.equal(data.operations.length,3);assert.equal(data.additionalWork.length,1);assert.match(data.oil[0],/ACEA C3/);
});
test('wrong vehicle, wrong interval, missing oil and incomplete checklist fail closed',()=>{
  for(const patch of [{registration:'OTHER'},{period:'25,000 miles/24 months'},{oil:[]},{operations:['Renew oil']},{sourceUrl:'https://other.example/data'}])assert.throws(()=>R.normalise({...raw,...patch},request));
});
test('region selection handles Honda and Nissan labels and rejects ambiguity',()=>{
  assert.equal(R.ukEngine([{label:'Engine (Europe)'},{label:'Engine ( except Europe)'}]).label,'Engine (Europe)');
  assert.equal(R.ukEngine([{label:'Engine ( except Central America, North America)'}]).label,'Engine ( except Central America, North America)');
  assert.throws(()=>R.ukEngine([{label:'Engine (Europe), variant A'},{label:'Engine (Europe), variant B'}]));
  assert.throws(()=>R.ukEngine([{label:'Engine (North America)'}]));
});
test('suggested interval respects both age and mileage; beyond coverage needs a manual choice',()=>{
  const periods=['75,000 miles/72 months','87,500 miles/84 months','100,000 miles/96 months'].map(label=>({label}));
  assert.equal(R.suggest(periods,74000,'30/09/2019',new Date('2026-10-02')).label,'100,000 miles/96 months');
  assert.equal(R.suggest(periods,120000,'30/09/2019',new Date('2026-10-02')),null);
  assert.throws(()=>R.suggest(periods,0,'30/09/2019'));
});
test('extension and website use identical validation rules',()=>assert.equal(fs.readFileSync('extensions/haynes-helper/rules.js','utf8'),rulesSource));

function reader(html,url){
  const {window,document}=parseHTML(html);let handler;
  window.HTMLElement.prototype.getClientRects=function(){return [{}];};
  for(const select of document.querySelectorAll('select'))Object.defineProperty(select,'selectedOptions',{value:[select.options[0]]});
  const ctx=vm.createContext({document,location:new URL(url),URL,Event:window.Event,chrome:{runtime:{onMessage:{addListener:h=>{handler=h;}}}}});
  vm.runInContext(rulesSource,ctx);vm.runInContext(fs.readFileSync('extensions/haynes-helper/haynes-page.js','utf8'),ctx);
  return command=>{let response;handler(command,{},value=>response=value);return response;};
}
test('DOM reader excludes follow-up repairs, preserves oil details and identifies smart-link oil page',()=>{
  const read=reader(`<html><body><select id="selectedPeriod"><option>12,500 miles/12 months</option></select><div id="partsList"><h3>Oil filter</h3></div><p>STANDARD TIME 1.30</p><h2>Engine</h2><ul><li><h3>Renew the engine oil<br><span>Engine sump, including filter 5.9 (l)</span></h3><span class="checker ok"></span></li><li><a href="https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_619016977">D</a></li><li><h3>Renew the oil filter</h3><span class="checker ok"></span></li><li><h3>FOLLOW UP Renew the brake pedal</h3><span class="checker ok"></span></li></ul><ul><li><h3>Renew fuel filter every 37,500 miles</h3><input id="addSentence_114"></li></ul></body></html>`,raw.sourceUrl);
  // selectedOptions is a browser API absent from this lightweight DOM fixture.
  const documentRead=read({command:'snapshot'});assert.equal(documentRead.error,undefined);assert.equal(documentRead.operations.length,2);assert.match(documentRead.operations[0],/5.9/);assert.equal(documentRead.parts[0],'Oil filter');assert.equal(documentRead.additionalWork.length,1);assert.match(documentRead.lubricantUrl,/lubricants/);
});
test('DOM reader keeps engine and coolant sections separate',()=>{
  const read=reader('<html><body><div><h2>Engine ( except Central America, North America)</h2><ul><li>Engine oil SAE 5W-30 ACEA C3</li><li>Engine sump, including filter 5.9 (l)</li></ul></div><div><h2>Cooling system</h2><ul><li>Coolant 7.3 (l)</li></ul></div></body></html>','https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_619016977');
  const data=read({command:'snapshot'});assert.equal(data.engineSections.length,1);assert.equal(data.engineSections[0].lines.length,2);assert.ok(!data.engineSections[0].lines.some(s=>/Coolant/.test(s)));
});

function clientContext(saveResult=true){
  const {document,window:domWindow}=parseHTML('<html><body><div id="servicePreviewControls"></div><div id="printSheet"><div class="servicePrint"><span class="ssMileageEntry">100000</span><div class="ssSection"><span class="ssCheck selected">Existing check</span></div><div class="ssFooter"></div></div></div></body></html>');
  domWindow.HTMLElement.prototype.showModal=function(){};domWindow.HTMLElement.prototype.close=function(){};
  Object.defineProperty(domWindow.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value')||this.options[0]?.getAttribute('value')||'';},set(value){for(const option of [...this.options])option.toggleAttribute('selected',option.getAttribute('value')===value);}});
  Object.defineProperty(domWindow.HTMLSelectElement.prototype,'selectedOptions',{configurable:true,get(){return [this.querySelector('option[selected]')||this.options[0]];}});
  const listeners=[];let id=0,saves=0;
  const window={addEventListener:(type,handler)=>listeners.push(handler),postMessage:msg=>{
    const response=msg.action==='ping'?{ready:true}:msg.action==='discover'?{data:{registration:raw.registration,vehicle:raw.vehicle,registrationDate:'30/09/2019',periods:[{label:raw.period,url:raw.sourceUrl}]}}:{data:raw};
    for(const handler of listeners)handler({source:window,origin:'https://vecta-test.example',data:{channel:'vecta-haynes-response',id:msg.id,...response}});
  }};
  const ctx=vm.createContext({document,window,URL,Date,location:{origin:'https://vecta-test.example'},crypto:{randomUUID:()=>String(++id)},setTimeout,clearTimeout,alert:()=>{},confirm:()=>true,activeServiceRegistration:raw.registration,activeServiceJobId:'job-1',activeServiceKind:'service',saveServiceSheet:async()=>{saves++;return saveResult;}});
  vm.runInContext(rulesSource,ctx);vm.runInContext(fs.readFileSync('public/js/vecta-haynes-client.js','utf8'),ctx);
  return {ctx,document,get saves(){return saves;}};
}
test('client requires fresh mileage, uses text-only rendering and saves into existing paperwork',async()=>{
  const c=clientContext();c.ctx.VectaHaynes.attachPreview();assert.equal(c.document.querySelectorAll('[data-haynes-get]').length,1);c.ctx.VectaHaynes.attachPreview();assert.equal(c.document.querySelectorAll('[data-haynes-get]').length,1);
  await c.ctx.VectaHaynes.open();const dialog=c.document.querySelector('dialog'),buttons=dialog.querySelectorAll('button');
  assert.equal(dialog.querySelector('input').value,'');dialog.querySelector('input').value='74000';dialog.querySelector('#haynes-conditions').value='normal';
  await buttons[0].onclick();await buttons[0].onclick();assert.equal(buttons[1].hidden,false);await buttons[1].onclick();
  assert.equal(c.saves,1);assert.equal(c.document.querySelector('.ssMileageEntry').textContent,'74000');assert.equal(c.document.querySelectorAll('.servicePrint .selected').length,1);assert.equal(c.document.querySelectorAll('[data-haynes]').length,1);assert.equal(c.document.querySelector('[data-haynes] .selected'),null);
  const block=c.ctx.VectaHaynes.section({...raw,conditions:'normal',mileage:74000,fetchedAt:new Date().toISOString(),labourHours:1.3,operations:['<img src=x onerror=alert(1)>'],parts:[],additionalWork:[]});assert.equal(block.querySelector('img'),null);
});
test('late lookup cannot write into another job',async()=>{
  const c=clientContext();await c.ctx.VectaHaynes.open();const dialog=c.document.querySelector('dialog'),buttons=dialog.querySelectorAll('button');dialog.querySelector('input').value='74000';dialog.querySelector('#haynes-conditions').value='normal';await buttons[0].onclick();await buttons[0].onclick();c.ctx.activeServiceJobId='job-2';await buttons[1].onclick();assert.equal(c.saves,0);assert.equal(c.document.querySelector('#printSheet [data-haynes]'),null);
});
test('cloud-save failure keeps imported data visible for retry',async()=>{
  const c=clientContext(false);await c.ctx.VectaHaynes.open();const dialog=c.document.querySelector('dialog'),buttons=dialog.querySelectorAll('button');dialog.querySelector('input').value='74000';dialog.querySelector('#haynes-conditions').value='normal';await buttons[0].onclick();await buttons[0].onclick();await buttons[1].onclick();assert.equal(c.saves,1);assert.ok(c.document.querySelector('[data-haynes]'));assert.match(dialog.querySelector('[role=status]').textContent,/use Save to retry/i);
});
