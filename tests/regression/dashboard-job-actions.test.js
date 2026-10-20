import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync('index.html','utf8');
const helper=html.slice(html.indexOf('function installDashboardJobActions(id)'),html.indexOf('function openJobModal(id,preset)'));
function setup({mechanic=true,account='Staff',mileage=true,saved=true}={}){
 const {window,document}=parseHTML('<html><body><div id="jobModal"><input id="job_status" value="booked"><div class="modalFoot"><button id="markComplete">Mark as complete</button><button id="markReady">Ready to invoice</button><button id="deleteJob">Delete</button><button id="saveJob">Save & Close</button></div></div></body></html>');
 window.VECTA_MECHANIC_DEPLOYMENT=mechanic;const saves=[];const c={window,document,requireCurrentJobMileage:()=>mileage};vm.createContext(c);
 // Match the real app boundary: app and saveJob are private to its closure.
 vm.runInContext(`(function(){const app={jobs:[{id:'j',status:'booked',customer_account:${JSON.stringify(account)}}]};function gatherJob(){return {id:'j'};}async function saveJob(id){capture(id,document.getElementById('job_status').value);return ${saved};}${helper}window.installForTest=installDashboardJobActions;})();`,Object.assign(c,{capture:(...args)=>saves.push(args)}));
 window.installForTest('j');return {window,document,saves,c};
}
for(const account of ['Staff','NMUK','CONTRACTOR'])test(`mechanic ${account} card uses its private app/save scope and only offers Complete`,async()=>{
 const t=setup({account});assert.equal(t.c.app,undefined);assert.equal(t.c.saveJob,undefined);assert.equal(t.document.getElementById('markReady'),null);assert.equal(t.document.getElementById('markComplete'),null);assert.equal(t.document.getElementById('deleteJob'),null);const button=t.document.getElementById('v280MechanicWorkComplete');assert.equal(button.textContent,'Complete');await button.onclick();assert.deepEqual(t.saves,[['j','work_complete']]);
});
test('Main labels its office action Ready to invoice and retains office handlers',()=>{
 const t=setup({mechanic:false});assert.equal(t.document.getElementById('markComplete').textContent,'Ready to invoice');assert.equal(t.document.getElementById('markReady').textContent,'Ready to invoice');assert.equal(t.document.getElementById('v280MechanicWorkComplete'),null);
});
test('mechanic action refuses missing mileage and restores status on rejected save',async()=>{
 const missing=setup({mileage:false});await missing.document.getElementById('v280MechanicWorkComplete').onclick();assert.equal(missing.saves.length,0);assert.equal(missing.document.getElementById('job_status').value,'booked');
 const rejected=setup({saved:false});const button=rejected.document.getElementById('v280MechanicWorkComplete');await button.onclick();assert.equal(rejected.document.getElementById('job_status').value,'booked');assert.equal(button.disabled,false);
});
test('editor installs dashboard actions after helper setup for internal and external openings',()=>{
 const core=html.slice(html.indexOf('function openJobModal(id,preset)'),html.indexOf('function gatherJob(id)'));
 assert.ok(core.indexOf('installDashboardJobActions(id);')>core.indexOf('window.initHaynesJobTools(m)'));
 const t=setup();t.window.installForTest('j');assert.equal(t.document.querySelectorAll('#v280MechanicWorkComplete').length,1);
});


test('work-complete jobs leave the mechanics planner and remain visible to Main for invoicing',()=>{
 const source=html.match(/function allJobsForDate\(\)\{[^\n]+/)[0];const c={window:{VECTA_MECHANIC_DEPLOYMENT:true},app:{jobs:[{id:'j',status:'work_complete',booking_date:'2026-10-20'}]},selectedIso:()=> '2026-10-20',vectaJobIsDeletedForLists:()=>false,isVehicleTaxJob:()=>false,isUnallocatedJob:()=>false};vm.runInNewContext(source,c);assert.equal(c.allJobsForDate().length,0);c.window.VECTA_MECHANIC_DEPLOYMENT=false;assert.equal(c.allJobsForDate().length,1);
});
