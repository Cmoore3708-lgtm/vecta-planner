import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {readFileSync} from 'node:fs';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=readFileSync('index.html','utf8'),mechanic=mechanicVariant(main);
const nav=mechanic.match(/function navItems\(\)\{[^\n]+/)[0];
test('restored mechanics entry has only its original Dashboard and Completed Jobs navigation',()=>{
 const c={};vm.runInNewContext(nav,c);assert.deepEqual(JSON.parse(JSON.stringify(c.navItems())),[['planner','Dashboard'],['completedJobs','Completed Jobs']]);
 assert.match(main,/\['invoices','Financial'\]/);assert.doesNotMatch(mechanic,/id="dashboardBookedToday"/);assert.match(main,/id="dashboardBookedToday"/);
 assert.match(mechanic,/name="vecta-mechanic-build" content="current-workshop-layout-mechanic"/);
});
test('management navigation attempts render the mechanics planner without calculating or displaying financial totals',()=>{
 const content={innerHTML:''},title={},date={};let packed=0;
 const c={plannerPackVisibleDay:()=>{packed++},vectaCreateInvoiceLookup:()=>({ids:new Set(),jobs:new Set()}),view:'invoices',window:{addEventListener(){},matchMedia:()=>({matches:false})},document:{body:{classList:{contains:()=>false}},querySelector:()=>null,getElementById:id=>({content,viewTitle:title,currentDate:date}[id]||null)},safe:fn=>fn(),selectedIso:()=> '2026-10-19',renderNav(){},plannerHtml:()=> 'MECHANICS PLANNER',bindView(){},linkifyDisplayedEmails(){},invoicesHtml:()=>{throw Error('Finance screen reached');},invoiceFinancialSummary:()=>{throw Error('Finance calculation reached');}};
 vm.runInNewContext(nav+'\n'+mechanic.slice(mechanic.indexOf('function plannerBacklogScrollAreas('),mechanic.indexOf('function vectaCreateInvoiceLookup(')),c);c.render();assert.equal(c.view,'planner');assert.equal(content.innerHTML,'MECHANICS PLANNER');assert.equal(packed,1);
});
test('refresh preserves the sidebar and all three independent list positions',()=>{
 for(const entry of [main,mechanic]){
  const {document}=parseHTML('<html><body><input id="currentDate"><h1 id="viewTitle"></h1><div id="content"></div></body></html>');
  const isMechanic=entry===mechanic,area=isMechanic?'mechanicBoardBacklog':'livePriorityBacklog',list=isMechanic?'mechanicJobList':'unallocatedJobList';
  const plannerHtml=()=>'<div class="'+area+'"><div class="provisionalBookingList"></div><div class="'+list+'"></div><div class="'+list+'"></div></div>';
  const c={document,window:{addEventListener(){},matchMedia:()=>({matches:false})},view:'planner',safe:fn=>fn(),plannerHtml,
   navItems:()=>[['planner','Dashboard']],selectedIso:()=> '2026-11-06',vectaCreateInvoiceLookup:()=>({}),renderNav(){},plannerPackVisibleDay(){},bindView(){},linkifyDisplayedEmails(){}};
  vm.runInNewContext(entry.slice(entry.indexOf('function plannerBacklogScrollAreas('),entry.indexOf('function vectaCreateInvoiceLookup(')),c);
  c.render();const before=c.plannerBacklogScrollAreas();assert.equal(before.length,4);
  before.forEach((el,i)=>{el.scrollTop=(i+1)*20});
  c.render();const after=c.plannerBacklogScrollAreas();
  assert.notEqual(after[0],before[0]);assert.deepEqual(Array.from(after,el=>el.scrollTop),[20,40,60,80]);
 }
});
test('both entries share the current planner functions and preserve Main’s timed lanes and backlog',()=>{
 const expression=/function plannerHtml\(\)\{[\s\S]*?\n\}/;
 const mainPlanner=main.match(expression)[0],mechanicPlanner=mechanic.match(expression)[0];
 function render(source){
  const c={app:{settings:{mechanics:['Alfie','Chris']}},jobsForDate:()=>[],allJobsForDate:()=>[],plannerWindowConfig:()=>({startMinutes:420,dayLast:960,gridPosition:0}),PLANNER_PX_PER_HOUR:60,plannerMetricsHtml:()=>'',provisionalBookingsPanelHtml:()=> 'PROVISIONAL',unallocatedPanelHtml:()=> 'UNALLOCATED',quotePanelHtml:()=> 'QUOTES',myTasksHtml:()=>'',mobilePlannerHtml:()=>'',plannerLiveControlsHtml:()=>'',esc:s=>s,mechanicHours:()=>0,currentTimeLineHtml:()=>'',plannerTimeRows:()=>'',laneHtml:m=>m};
  vm.runInNewContext(main.match(/function configuredMechanicNames\(\)\{[^\n]+/)[0]+'\n'+main.match(/function plannerLaneMechanics\(\)\{[^\n]+/)[0]+'\n'+source,c);return c.plannerHtml();
 }
 assert.equal(mainPlanner,mechanicPlanner);assert.match(mechanicPlanner,/VECTA_MECHANIC_DEPLOYMENT===true\)return mechanicPlannerHtml/);
 const rendered=render(mechanicPlanner);assert.equal(rendered,render(mainPlanner));assert.match(rendered,/Anyone/);assert.match(rendered,/livePriorityBacklog[^]*PROVISIONALUNALLOCATEDQUOTES/);assert.doesNotMatch(rendered,/mechanicPlannerOnly/);
 assert.doesNotMatch(mechanic,/<style id="v75-mechanic-final-layout"/);
});

test('mechanics keep vehicle/job search without invoice results or quote controls',()=>{
 assert.match(mechanic,/id="plannerGlobalSearch"/);assert.doesNotMatch(mechanic,/id="newQuoteTop"/);
 const {window,document}=parseHTML('<html><head></head><body><div id="jobModal"><div class="modalFoot"><button id="markReady">Ready to invoice</button><button id="createQuote">Create Quote</button><button id="saveJob">Create Job</button></div></div></body></html>');
 Object.defineProperty(window,'location',{value:{hostname:'vecta-mechanic-dashboard.vercel.app',pathname:'/'}});
 const source=mechanic.match(/<script>\s*\/\* V280 - staged mechanic[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
 const c={window,document,console,app:{jobs:[]},openJobModal(){}};vm.createContext(c);vm.runInContext(source,c);c.openJobModal(null);
 assert.equal(document.getElementById('markReady'),null);assert.equal(document.getElementById('createQuote'),null);assert.ok(document.getElementById('saveJob'));
});

test('mechanics global search still returns jobs and vehicles but no invoice or price results',()=>{
 const search=mechanic.match(/function plannerSearchResults\(q\)\{[\s\S]*?\n\}/)[0];
 const c={app:{customers:[],vehicles:[],jobs:[{registration:'ABC123',work_required:'Service'}],invoices:[{id:'private',total:98765}]},fleetVehicles:[],normReg:s=>s,plannerSearchMatches:()=>true,plannerSearchCompact:s=>s,plannerSearchPhone:()=>'',plannerSearchNormaliseText:s=>s,invoiceNumericPart:()=>1};
 vm.runInNewContext(search,c);const result=c.plannerSearchResults('ABC123');assert.equal(result.jobs.length,1);assert.equal(result.vehicles.length,1);assert.equal(result.invoices.length,0);
});

test('the real registration lookup installs beside the restored mechanics search control',()=>{
 const {window,document}=parseHTML(mechanic);
 window.VectaHaynesJobTools={};window.fetch=()=>{throw Error('Opening the planner must not look up vehicles');};
 const source=readFileSync('public/js/haynes-job-tools.js','utf8');
 vm.runInNewContext(source.slice(source.indexOf('/* Dashboard registration lookup:')),{window,document,AbortController,URLSearchParams,setTimeout,clearTimeout,Date});
 window.VectaHaynesDashboardLookup.install();window.VectaHaynesDashboardLookup.install();
 const plate=document.getElementById('haynesDashboardLookup');assert.ok(plate);assert.equal(plate.nextElementSibling.className,'plannerGlobalSearchWrap');assert.equal(document.querySelectorAll('#haynesDashboardRegistration').length,1);
});

test('quote cards and vehicle history do not display quoted prices or invoice rows',()=>{
 const source=mechanic.match(/function quotePanelHtml\(\)\{[^\n]+/)[0];
 const c={quoteJobs:()=>[{id:'quote',registration:'ABC123',customer_name:'Example',work_required:'Service',amount_quoted:98765}],esc:s=>s,compactUnallocatedPlate:s=>s,money:()=>{throw Error('Mechanics must not render quote money');}};
 vm.runInNewContext(source,c);assert.match(c.quotePanelHtml(),/Service/);assert.doesNotMatch(c.quotePanelHtml(),/98765/);
 assert.doesNotMatch(mechanic,/<small>Amount quoted:|^  invoices\.forEach\(function\(inv\)\{history\.push/m);
});
