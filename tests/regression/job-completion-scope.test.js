import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const guardrails=html.match(/<script id="v318-workshop-guardrails">([\s\S]*?)<\/script>/)[1];
const bindings=html.slice(html.indexOf("var completeButton=document.getElementById('markComplete');"),html.indexOf("var readyButton=document.getElementById('markReady');"));

function setup({existing=false,account='NMUK',towbar=false,combinedMot=false,stamped=true}={}){
  const job={id:'completion-test',registration:'UPUK2',customer_account:account,status:'booked',job_type:'Diagnostics',work_required:'Reset all tyre pressures, carry out DPF Regen. Reset all fault codes'};
  const draft={...job};
  if(towbar)draft.work_required='Remove towbar';
  const elements={markComplete:{},markCompleteEmail:{},job_status:{value:'booked'}};
  const listeners=[],calls=[],alerts=[];
  const context={document:{getElementById:id=>elements[id]||null},addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')listeners.push(fn)},alert:message=>alerts.push(message),confirm:()=>false,capture:(...args)=>calls.push(args),draft,job};
  context.window=context;
  vm.createContext(context);
  vm.runInContext(guardrails,context);
  // Production intentionally keeps app and gatherJob inside this closure.
  vm.runInContext(`(function(){
    const app={jobs:${existing?'[job]':'[]'}};
    function gatherJob(id){if(id!==job.id)throw Error('Wrong draft id');return {...draft};}
    function confirmServiceBookStampedBeforeComplete(){return ${stamped};}
    function fleetPlannerJobCategories(){return {service:${combinedMot},mot:${combinedMot}};}
    async function completeNmukJobAndNotify(id,notify){capture(id,notify,document.getElementById('job_status').value);return true;}
    function openJobModal(id,preset){const j=id?app.jobs.find(row=>row.id===id):preset;${bindings}}
    window.openJobModal=function(id,preset){return openJobModal(id,preset);};
  })();`,context);
  listeners.forEach(fn=>fn());
  context.openJobModal(existing?job.id:null,job);
  assert.equal(context.app,undefined);
  assert.equal(context.gatherJob,undefined);
  return {context,elements,calls,alerts,draft,job};
}

for(const existing of [false,true])for(const account of ['NMUK','Staff','CONTRACTOR']){
  test(`${existing?'existing':'new'} ${account} job completes through its private scope`,async()=>{
    const t=setup({existing,account});
    await t.elements.markComplete.onclick();
    assert.deepEqual(t.calls,[[t.job.id,false,'completed']]);
    assert.deepEqual(t.alerts,[]);
  });
}

test('Complete & email preserves its explicit notification choice',async()=>{
  const t=setup();await t.elements.markCompleteEmail.onclick();
  assert.deepEqual(t.calls,[[t.job.id,true,'completed']]);
});

test('towbar reminder reads the current unsaved description exactly once',async()=>{
  const t=setup();t.draft.work_required='Remove towbar';
  await t.elements.markComplete.onclick();
  assert.deepEqual(t.alerts,['Have you wrote the name on the towbar?']);
  assert.equal(t.calls.length,1);
});

test('service-book cancellation stops completion and combined MOT retains its answer',async()=>{
  const cancelled=setup({stamped:false});await cancelled.elements.markComplete.onclick();
  assert.equal(cancelled.calls.length,0);assert.equal(cancelled.elements.job_status.value,'booked');
  const mot=setup({combinedMot:true});await mot.elements.markComplete.onclick();
  assert.equal(mot.context.__vectaMotCompletionDecision[mot.job.id],false);
  assert.equal(mot.calls.length,1);
});
