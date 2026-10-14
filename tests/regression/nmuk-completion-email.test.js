import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(){
 const {document}=parseHTML('<html><body><div id="jobModal"></div></body></html>');
 const events=[],job={id:'j',status:'booked',customer_account:'NMUK',nmuk_vehicle_type:'Internal',registration:'MTC 2'},draft={...job,status:'completed'};
 const ctx={document,app:{jobs:[job]},nmukCompletionSaves:{},isVehicleTaxJob:j=>j.job_type==='Vehicle Tax',fleetVehicleForRegistration:()=>({contactEmail:'owner@example.com',model:'Nissan NV200'}),fleetInvoiceFormatRegistration:s=>s,emailAddressList:s=>s?[s]:[],gatherJob:()=>draft,window:{open:()=>{throw Error('Must not open Outlook');}},esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),closeModals:()=>document.getElementById('jobModal').classList.remove('open')};
 vm.createContext(ctx);
 for(const name of ['emailFirstNameFromAddress','nmukCompletionSignatureText','nmukCompletionEmail','completeNmukJobAndNotify','openNmukCompletionDraft']){
  const start=html.indexOf((['completeNmukJobAndNotify','openNmukCompletionDraft'].includes(name)?'async ':'')+'function '+name+'('),end=html.indexOf('\n}',start)+2;vm.runInContext(html.slice(start,end),ctx);
 }
 ctx.openNmukCompletionDraftReal=ctx.openNmukCompletionDraft;
 ctx.openNmukCompletionDraft=async id=>{events.push(['draft',id]);};
 ctx.saveJob=async(id,onConfirmed)=>{events.push(['save']);await onConfirmed(draft);return true;};
 return {ctx,events,job,draft};
}
test('completion opens review only after confirmed save and never opens an email app',async()=>{
 const {ctx,events}=setup();await ctx.completeNmukJobAndNotify('j');assert.deepEqual(events.map(e=>e[0]),['save','draft']);
 assert.match(html,/if\(savedResult===true&&typeof onConfirmed==='function'\)await onConfirmed\(j\)/);
});
test('failed or queued saves and already completed jobs never open the draft',async()=>{
 const {ctx,events,job}=setup();ctx.saveJob=async()=>false;await ctx.completeNmukJobAndNotify('j');assert.equal(events.length,0);
 ctx.saveJob=async()=>true;await ctx.completeNmukJobAndNotify('j');assert.equal(events.length,0);
 job.status='completed';ctx.saveJob=async(id,fn)=>{await fn({...job});return true;};await ctx.completeNmukJobAndNotify('j');assert.equal(events.length,0);
});
test('double clicks save once; rejected-save retries use the editor baseline',async()=>{
 const {ctx,job,draft,events}=setup();ctx.window.__vectaJobEditorBaseline={id:'j',job:{...job}};job.status='completed';job.archived=true;
 let finish;ctx.saveJob=(id,fn)=>new Promise(resolve=>{finish=async()=>{await fn(draft);resolve(true);};});
 const first=ctx.completeNmukJobAndNotify('j');assert.equal(await ctx.completeNmukJobAndNotify('j'),false);await finish();await first;assert.equal(events.length,1);
});
test('review displays fixed From and signature; send is an explicit separate click and failed sends require status check',async()=>{
 const {ctx}=setup(),calls=[];
 ctx.nmukCompletionRequest=async payload=>{calls.push(payload);if(payload.action==='send')throw Error('Result uncertain');return {from:'chris@nissan-fleet.co.uk',to:['owner@example.com'],subject:'MTC 2',body:'Hi Owner.\n\nYour Nissan NV200 is complete.',signature_html:'<strong style="color:red">VECTA</strong>',token:'signed',ready:true,status:'draft'};};
 await ctx.openNmukCompletionDraftReal('j');assert.equal(calls.length,1);assert.match(ctx.document.getElementById('jobModal').textContent,/chris@nissan-fleet.co.uk/);assert.ok(ctx.document.querySelector('#completionEmailSignature strong'));
 const send=ctx.document.getElementById('sendCompletionEmail');await send.onclick();assert.equal(calls.length,2);assert.equal(calls[1].action,'send');assert.equal(calls[1].from,undefined);assert.equal(send.disabled,true);assert.equal(ctx.document.getElementById('completionEmailResult').textContent,'Result uncertain');
});
test('missing sender setup, pending and already sent drafts cannot send',async()=>{
 for(const status of ['draft','pending','sent']){
  const {ctx}=setup();ctx.nmukCompletionRequest=async()=>({from:'chris@nissan-fleet.co.uk',to:['owner@example.com'],subject:'Ready',body:'Hi Owner.',signature_html:'VECTA',ready:false,status,setup_error:'Sender verification required'});
  await ctx.openNmukCompletionDraftReal('j');assert.equal(ctx.document.getElementById('sendCompletionEmail').disabled,true);
 }
});
