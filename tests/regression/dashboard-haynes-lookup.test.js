import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default||traverseModule;
const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function installActualEditorBridge(window,document,editor){
 let bridge;
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const code=match[1];
  traverse(parse(code,{sourceType:'script'}),{AssignmentExpression(path){
   const n=path.node;if(n.left.type!=='MemberExpression'||n.left.object.name!=='window'||n.left.property.name!=='openJobModal')return;
   const binding=path.scope.getBinding('openJobModal');if(binding?.path.node.type!=='FunctionDeclaration')return;
   assert.equal(binding.path.node.id.name,'openJobModal');
   bridge=code.slice(n.start,n.end);
  }});
 }
 assert.ok(bridge,'The core job editor must be exported from its own scope');
 const context={window,document,openJobModal:editor};
 vm.runInNewContext(bridge,context);
 const amendments=html.match(/<script id="v230-amendments-js">([\s\S]*?)<\/script>/)[1];
 const ast=parse(amendments,{sourceType:'script'});
 const nodes=ast.program.body[0].expression.callee.body.body;
 const start=nodes.findIndex(n=>n.type==='VariableDeclaration'&&n.declarations[0].id.name==='originalOpenJobModal');
 vm.runInNewContext(nodes.slice(start,start+2).map(n=>amendments.slice(n.start,n.end)).join('\n'),context);
}

const src=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');
const module=src.slice(src.indexOf('/* Dashboard registration lookup:'));
function setup(fetch){const {window,document}=parseHTML('<html><body><header class="top"><h1>Dashboard</h1><div class="plannerGlobalSearchWrap"></div></header></body></html>');const create=document.createElement.bind(document);document.createElement=n=>{const el=create(n);if(n==='dialog')el.showModal=()=>{};return el;};window.fetch=fetch;window.VectaHaynesJobTools={remember:v=>v,vehicleLink:()=> 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_123',safeImage:()=>''};let preset;installActualEditorBridge(window,document,(id,p)=>preset=p);vm.runInNewContext(module,{window,document,AbortController,URLSearchParams,setTimeout,Date});window.VectaHaynesDashboardLookup.install();return {window,document,preset:()=>preset};}
const vehicle={registration:'FX69XWU',make:'Nissan',model:'Qashqai',variant:'Diesel',typeId:'t_123'};
test('lookup plate sits before global search and starts blank',()=>{const {document}=setup(()=>{});const form=document.getElementById('haynesDashboardLookup');assert.equal(form.nextElementSibling.className,'plannerGlobalSearchWrap');assert.equal(form.querySelector('input').value,'');assert.match(form.textContent,/GB/);});
test('matched lookup opens quote form with unallocated vehicle and no automatic save',async()=>{const {window,document,preset}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:'FX69XWU'}}));await window.VectaHaynesDashboardLookup.open('fx69 xwu');const page=document.getElementById('haynesLookupPage');const form=page.querySelector('form');form.elements={mileage:{value:'120000'}};page.querySelector('[data-create="quote"]').onclick();assert.equal(preset().status,'quote');assert.equal(preset().registration,'FX69XWU');assert.equal(preset().mileage,120000);assert.equal(preset().technician,'Unallocated');assert.equal(document.getElementById('haynesLookupPage'),null);});
test('mismatched vehicle cannot enable creation buttons',async()=>{const {window,document}=setup(async()=>({ok:true,json:async()=>({status:'MATCHED',vehicle:{...vehicle,registration:'OTHER'}})}));await window.VectaHaynesDashboardLookup.open('FX69 XWU');assert.match(document.querySelector('[data-status]').textContent,/unavailable/);assert.equal(document.querySelector('[data-create]').hasAttribute('disabled'),true);});
test('last MOT mileage displays its own units and leaves current mileage blank',async()=>{const {window,document}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:'FX69XWU',latestMileage:'120,000',latestMileageUnit:'mi',lastMotTestDate:'2026-09-20T10:00:00'}}));await window.VectaHaynesDashboardLookup.open('FX69 XWU');assert.equal(document.querySelector('[data-mot-mileage]').textContent,'120,000 miles');assert.match(document.querySelector('[data-mot-date]').textContent,/2026-09-20/);assert.equal(document.querySelector('[name="mileage"]').value,'');});

test('Create Job uses the production editor bridge and preserves the looked-up vehicle',async()=>{const {window,document,preset}=setup(async url=>({ok:true,json:async()=>url.includes('haynes-vehicle')?{status:'MATCHED',vehicle}:{registration:vehicle.registration}}));await window.VectaHaynesDashboardLookup.open(vehicle.registration);const page=document.getElementById('haynesLookupPage');page.querySelector('form').elements={mileage:{value:'85000'}};page.querySelector('[data-create="job"]').onclick();assert.equal(preset().status,'booked');assert.equal(preset().registration,vehicle.registration);assert.equal(preset().vehicle,'Nissan Qashqai');assert.equal(preset().mileage,85000);assert.equal(document.getElementById('haynesLookupPage'),null);});
