import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function vectaLoadSharedCustomerState(){'),html.indexOf('async function pullRemote(options){'));
function harness(){
 let release;
 const gate=new Promise(resolve=>release=resolve);
 const c={console,performance,app:{settings:{contractors:['WPC'],mechanics:['Other']},jobs:[],jobCustomerMemory:{}},
 vectaWithTimeout:async p=>p,mergeContractorNames:(...lists)=>[...new Set(lists.flat().filter(Boolean))],vectaSettingsSignature:JSON.stringify,
 merge:(a,b)=>Object.assign(a,b),contractorMasterNames:()=>[],
 vectaFetchAllRemoteRows:async table=>table==='jobs'?[{id:'nds',registration:'NDS2',customer_name:'NDS',amount_quoted:150}]:[],
 vectaLoadTerminalJobStatesFromCloud:async()=>{},vectaReconcileJobsFromCloud:rows=>c.app.jobs=rows,vectaApplyTerminalJobStates(){},
 mergeTaskStateMaps:()=>({}),hydrateIndependentTaskState:()=>({}),writeIndependentTaskState(){},vectaReconcileTasksFromCloud(){},applyTaskStateOverrides(){},
 remoteClient:{from(){let id;const q={select(){return q},eq(k,v){id=v;return q},like(){return q},limit(){return q},single(){return q},async then(resolve,reject){try{if(id==='main'){await gate;resolve({data:{value:{contractors:['NDS'],mechanics:['Alfie','Chris','Anyone']}}})}else if(id==='task_state_overrides_v50')resolve({data:[]});else resolve({data:[{id:'jobcustomer:nds',value:{customer_account:'NDS',customer_name:'NDS'},updated_at:'2026-10-20T13:00:00Z'}]})}catch(e){reject(e)}}};return q}}
 };
 vm.runInNewContext(source,c);return {c,release};
}
test('startup waits for shared contractors and customer allocations before exposing live jobs',async()=>{
 const {c,release}=harness();let complete=false;const p=c.vectaPrimeAuthoritativeDashboard().then(()=>complete=true);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);
 release();await p;
 assert(c.app.settings.contractors.includes('NDS'));assert(c.app.settings.contractors.includes('WPC'));
 assert.equal(c.app.jobCustomerMemory.nds.customer_account,'NDS');assert.equal(c.app.jobs[0].amount_quoted,150);
 assert.deepEqual(Array.from(c.app.settings.mechanics),['Alfie','Chris','Anyone']);
});
test('newer unsynced local customer allocation is retained',async()=>{
 const {c,release}=harness();c.app.jobCustomerMemory.nds={customer_account:'NDS',customer_phone:'local phone',updated_at:'2026-10-21T00:00:00Z'};
 release();await c.vectaLoadSharedCustomerState();assert.equal(c.app.jobCustomerMemory.nds.customer_phone,'local phone');
});
test('failed settings read is reported instead of treating startup allocations as ready',async()=>{
 const {c}=harness();c.remoteClient={from(){const q={select(){return q},eq(){return q},like(){return q},limit(){return q},single(){return q},then(resolve){return Promise.resolve({error:new Error('settings unavailable')}).then(resolve)}};return q}};
 await assert.rejects(c.vectaLoadSharedCustomerState(),/settings unavailable/);
});
