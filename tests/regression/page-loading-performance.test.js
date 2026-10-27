import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const functions=new Map();
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=/.test(match[1])||!match[2].includes('function vectaListWindow(')&&!match[2].includes('function isJobInvoiced('))continue;
 const source=match[2],ast=parse(source,{sourceType:'unambiguous'});
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&!functions.has(node.id.name))functions.set(node.id.name,source.slice(node.start,node.end));for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)}};visit(ast.program);
}
function load(ctx,names){vm.createContext(ctx);for(const name of names){assert.ok(functions.has(name),name);vm.runInContext(functions.get(name),ctx)}return ctx;}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');

test('one invoice index preserves draft, linked, void and duplicate invoice behaviour',()=>{
 const invoices=[{id:'old',invoice_number:'100',job_id:'a',updated_at:'2026-10-01'},
 {id:'new',invoice_number:'100',job_id:'b',updated_at:'2026-10-02'},
 {id:'draft',invoice_number:'101',job_id:'c',status:'draft'},
 {id:'void',invoice_number:'102',job_id:'d',status:'void'},
 {id:'active',invoice_number:'103',job_id:'e'}];
 let reads=0;
 const c=load({Set,app:{invoices},vectaInvoiceIsActive:i=>i.status!=='void',vectaRenderInvoiceLookup:null},['vectaActiveInvoices','vectaCreateInvoiceLookup','isJobInvoiced']);
 const active=c.vectaActiveInvoices;c.vectaActiveInvoices=()=>{reads++;return active()};
 const jobs=[null,{id:'a'},{id:'b'},{id:'c'},{id:'c',invoice_id:'draft'},{id:'d',invoice_id:'void'},
 {id:'e'},{id:'other',invoice_id:'active'},{id:'x',invoiced_at:'2026-10-01'}];
 const expected=jobs.map(j=>c.isJobInvoiced(j));reads=0;
 c.vectaRenderInvoiceLookup=c.vectaCreateInvoiceLookup();
 for(let i=0;i<100;i++)assert.deepEqual(jobs.map(j=>c.isJobInvoiced(j)),expected);
 assert.equal(reads,1,'invoice collection is deduplicated once for 900 checks');
 c.vectaRenderInvoiceLookup=null;invoices.push({id:'later',invoice_number:'104',job_id:'x'});
 assert.equal(c.isJobInvoiced({id:'x'}),true,'a later read sees the new invoice');
});

test('display windows bound first paint; filtering and later records remain accessible',()=>{
 const c=load({vectaListWindows:{},esc},['vectaListWindow','vectaListMoreHtml']);
 const rows=Array.from({length:121},(_,id)=>({id}));
 assert.equal(c.vectaListWindow('jobs','completed',rows).length,50);
 assert.match(c.vectaListMoreHtml('jobs',121),/Showing 50 of 121/);
 c.vectaListWindows.jobs.limit+=50;
 assert.equal(c.vectaListWindow('jobs','completed',rows).length,100);
 c.vectaListWindows.jobs.limit+=50;
 assert.equal(c.vectaListWindow('jobs','completed',rows).length,121);
 assert.doesNotMatch(c.vectaListMoreHtml('jobs',121),/data-list-more/);
 const result=c.vectaListWindow('jobs','search:120',rows.filter(r=>r.id===120));
 assert.equal(result[0].id,120,'search filters the complete collection before windowing');
 assert.equal(c.vectaListWindows.jobs.limit,50);
 assert.equal(rows.length,121,'authoritative records are never truncated');
 c.vectaListWindow('fleet','all',rows);assert.equal(c.vectaListWindows.fleet.limit,50);
});

test('registration search shares one index and releases it on success or failure',()=>{
 let indexes=0;
 const c=load({vectaRenderInvoiceLookup:null,jobsSearchQuery:'ZZ 99',jobsListMode:'completed',
 vectaCreateInvoiceLookup:()=>{indexes++;return {}},jobsForList:()=>[{registration:'AA11AAA'},{registration:'ZZ99ZZZ'}]},['vectaJobsMatchingRows']);
 assert.equal(c.vectaJobsMatchingRows()[0].registration,'ZZ99ZZZ');assert.equal(indexes,1);
 assert.equal(c.vectaRenderInvoiceLookup,null);
 c.jobsForList=()=>{throw Error('failed')};assert.throws(()=>c.vectaJobsMatchingRows(),/failed/);
 assert.equal(c.vectaRenderInvoiceLookup,null);
});

test('navigation paints feedback first and abandons superseded pages',()=>{
 const frames=[],timers=[],renders=[],nodes={content:{innerHTML:''},viewTitle:{textContent:''}};
 const c=load({vectaNavigationSequence:0,view:'planner',esc,document:{getElementById:id=>nodes[id]},
 renderNav(){},navItems:()=>[['fleet','Fleet Manager'],['jobs','Jobs']],
 requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>timers.push(fn),render:()=>renders.push(c.view)},['vectaNavigateTo']);
 c.vectaNavigateTo('fleet');assert.match(nodes.content.innerHTML,/Opening Fleet Manager/);
 assert.equal(renders.length,0);
 c.vectaNavigateTo('jobs');frames.forEach(fn=>fn());timers.forEach(fn=>fn());
 assert.deepEqual(renders,['jobs']);assert.equal(nodes.viewTitle.textContent,'Jobs');
});

test('windowing never reaches Fleet printed reports or cloud reconciliation',()=>{
 const print=functions.get('fleetPrintCurrentView');assert.ok(print);
 assert.doesNotMatch(print,/vectaListWindow|vectaListWindows/);
 assert.match(print,/fleetEnriched\(\)\.forEach/);
 assert.doesNotMatch(functions.get('pullRemote'),/vectaListWindow|vectaListWindows/);
 assert.match(html,/finally\{vectaRenderInvoiceLookup=null;vectaRenderActiveInvoices=null;vectaRenderContractorNames=null;renderInProgress=false\}/);
});

test('active invoice cache is scoped to rendering and returns independently sortable arrays',()=>{
 let scanned=0;
 const c=load({app:{invoices:[{id:'a',invoice_number:'1'},{id:'b',invoice_number:'2'}]},
 vectaInvoiceIsActive:()=>{scanned++;return true},renderInProgress:true,vectaRenderActiveInvoices:null},['vectaActiveInvoices']);
 const first=c.vectaActiveInvoices();first.reverse();
 assert.deepEqual(Array.from(c.vectaActiveInvoices(),i=>i.id),['a','b']);assert.equal(scanned,2);
 c.renderInProgress=false;c.vectaRenderActiveInvoices=null;c.app.invoices.push({id:'c',invoice_number:'3'});
 assert.equal(c.vectaActiveInvoices().length,3);assert.equal(scanned,5);
});

test('contractor names are collected once per render and pick up later customer changes',()=>{
 let reads=0;
 const c=load({app:{settings:{contractors:['NDS']},jobs:[{customer_account:'WPC'}]},fleetVehicles:[],
 renderInProgress:true,vectaRenderContractorNames:null,fleetNormaliseCustomer:v=>{reads++;return String(v).trim()}},['contractorMasterNames']);
 const names=Array.from(c.contractorMasterNames());const firstReads=reads;
 for(let i=0;i<1000;i++)assert.deepEqual(Array.from(c.contractorMasterNames()),names);
 assert.equal(reads,firstReads,'invoice warnings do not rescan jobs for each invoice');
 c.renderInProgress=false;c.vectaRenderContractorNames=null;c.app.settings.contractors.push('FMS');
 assert.ok(c.contractorMasterNames().includes('FMS'));
});
