import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
const html=readFileSync('index.html','utf8');
const source=html.match(/<script>\s*\/\* V280 - staged mechanic[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
function setup(hostname='vecta-mechanic-dashboard.vercel.app',pathname='/',saved=true){
 const {window,document}=parseHTML('<html><head></head><body><div id="jobModal"><input id="job_status" value="booked"><textarea id="job_work_required">Edited instructions</textarea><div class="modalFoot"><button id="markReady">Ready to invoice</button><button id="markComplete">Mark complete</button><button id="deleteJob">Delete Job</button><button id="saveJob">Save & Close</button></div></div></body></html>');
 Object.defineProperty(window,'location',{value:{hostname,pathname},configurable:true});
 const job={id:'1',status:'booked',amount_quoted:125,completed_at:'',archived:false};let captured;
 const context={window,document,console,app:{jobs:[job]},openJobModal(){},saveJob:async id=>{captured={id,status:document.getElementById('job_status').value,work:document.getElementById('job_work_required').value};return saved;}};
 vm.createContext(context);vm.runInContext(source,context);context.openJobModal('1');return {document,window,job,get captured(){return captured;}};
}
test('mechanics Complete saves current edits through the existing safe save pipeline at work_complete stage',async()=>{
 const t=setup();assert.equal(t.document.getElementById('deleteJob'),null);assert.equal(t.document.getElementById('markReady'),null);
 const complete=t.document.getElementById('v280MechanicWorkComplete');assert.equal(complete.textContent,'Complete');await complete.onclick();
 assert.deepEqual(t.captured,{id:'1',status:'work_complete',work:'Edited instructions'});
 assert.equal(t.job.completed_at,'');assert.equal(t.job.archived,false);assert.equal(t.job.amount_quoted,125);
});
test('failed mechanics save restores status and allows retry',async()=>{
 const t=setup(undefined,undefined,false);const button=t.document.getElementById('v280MechanicWorkComplete');await button.onclick();assert.equal(t.document.getElementById('job_status').value,'booked');assert.equal(button.disabled,false);
});
test('Main retains existing invoice/delete actions; the isolated mechanics preview uses the mechanics workflow',()=>{
 const main=setup('vecta-planner.vercel.app');assert.ok(main.document.getElementById('markReady'));assert.ok(main.document.getElementById('deleteJob'));assert.equal(main.document.getElementById('v280MechanicWorkComplete'),null);
 assert.ok(setup('preview.vercel.app','/mechanic.html').document.getElementById('v280MechanicWorkComplete'));
});
