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
 assert.match(mechanic,/name="vecta-mechanic-build" content="restored-v79-current-core"/);
});
test('management navigation attempts render the mechanics planner without calculating or displaying financial totals',()=>{
 const content={innerHTML:''},title={},date={};
 const c={view:'invoices',window:{},document:{body:{classList:{contains:()=>false}},querySelector:()=>null,getElementById:id=>({content,viewTitle:title,currentDate:date}[id]||null)},safe:fn=>fn(),selectedIso:()=> '2026-10-19',renderNav(){},plannerHtml:()=> 'MECHANICS PLANNER',bindView(){},linkifyDisplayedEmails(){},invoicesHtml:()=>{throw Error('Finance screen reached');},invoiceFinancialSummary:()=>{throw Error('Finance calculation reached');}};
 vm.runInNewContext(nav+'\n'+mechanic.match(/var renderInProgress=false;function render\(\)\{[^\n]+/)[0],c);c.render();assert.equal(c.view,'planner');assert.equal(content.innerHTML,'MECHANICS PLANNER');
});
test('the recovered full-width mechanic planner uses current configured names, without tasks, quotes or management tools',()=>{
 const recovered=JSON.parse(readFileSync('scripts/original-mechanic-variant.json','utf8')).recovered;
 assert.match(recovered.plannerHtml,/configuredMechanicNames/);assert.doesNotMatch(recovered.plannerHtml,/myTasksHtml|quotePanelHtml|manageTimeOff|workloadValue/);
 const c={configuredMechanicNames:()=>['Alfie','Chris','Anyone'],app:{jobs:[],settings:{}},jobsForDate:()=>[],allJobsForDate:()=>[],plannerWindowConfig:()=>({startMinutes:420,dayLast:960,gridPosition:0}),PLANNER_PX_PER_HOUR:60,plannerMetricsHtml:()=>'',unallocatedPanelHtml:()=> 'UNALLOCATED',mobilePlannerHtml:()=>'',plannerLiveControlsHtml:()=>'',esc:s=>s,mechanicHours:()=>0,currentTimeLineHtml:()=>'',plannerTimeRows:()=>'',laneHtml:m=>m};
 vm.runInNewContext(recovered.plannerHtml,c);const rendered=c.plannerHtml();assert.match(rendered,/mechanicPlannerOnly/);assert.match(rendered,/Chris/);assert.match(rendered,/UNALLOCATED/);assert.doesNotMatch(rendered,/Financial|Quoted|£/);
});

test('mechanics have no Main invoice-search or quote controls, including on a new card',()=>{
 assert.doesNotMatch(mechanic,/id="plannerGlobalSearch"|id="newQuoteTop"/);
 const {window,document}=parseHTML('<html><head></head><body><div id="jobModal"><div class="modalFoot"><button id="markReady">Ready to invoice</button><button id="createQuote">Create Quote</button><button id="saveJob">Create Job</button></div></div></body></html>');
 Object.defineProperty(window,'location',{value:{hostname:'vecta-mechanic-dashboard.vercel.app',pathname:'/'}});
 const source=mechanic.match(/<script>\s*\/\* V280 - staged mechanic[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
 const c={window,document,console,app:{jobs:[]},openJobModal(){}};vm.createContext(c);vm.runInContext(source,c);c.openJobModal(null);
 assert.equal(document.getElementById('markReady'),null);assert.equal(document.getElementById('createQuote'),null);assert.ok(document.getElementById('saveJob'));
});
