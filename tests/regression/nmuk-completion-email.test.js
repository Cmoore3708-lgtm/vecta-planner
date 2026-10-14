import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(){
  const {document}=parseHTML('<html><body><div id="jobModal"></div></body></html>');
  const events=[],job={id:'j',status:'booked',customer_account:'NMUK',nmuk_vehicle_type:'Internal',registration:'MTC 2'},draft={...job,status:'completed'};
  const tab={closed:false,document:{body:{}},location:{replace:url=>events.push(['email',url])},close(){events.push(['close']);this.closed=true;}};
  const ctx={document,app:{jobs:[job]},nmukCompletionSaves:{},isVehicleTaxJob:j=>j.job_type==='Vehicle Tax',fleetVehicleForRegistration:reg=>({contactEmail:'owner@example.com'}),fleetInvoiceFormatRegistration:reg=>reg,emailAddressList:value=>String(value||'').split(/[;,]+/).map(s=>s.trim()).filter(s=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),appendVectaEmailSignature:s=>s+'\n\nVECTA',gatherJob:()=>draft,window:{open:()=>{events.push(['open']);return tab;}},closeInvoiceMessageWindow:t=>{if(t&&!t.closed)t.close();},esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),closeModals:()=>{},alert:s=>events.push(['alert',s])};
  ctx.saveJob=async(id,confirmed)=>{events.push(['save']);confirmed(draft);return true;};
  vm.createContext(ctx);
  for(const name of ['nmukCompletionEmail','completeNmukJobAndNotify']){
    const start=html.indexOf((name==='completeNmukJobAndNotify'?'async ':'')+'function '+name+'('),end=html.indexOf('\n}',start)+2;
    vm.runInContext(html.slice(start,end),ctx);
  }
  return {ctx,events,tab,job,draft};
}
test('NMUK completion uses vehicle contact and exact collection message without invoice or price',()=>{
  const {ctx,draft}=setup(),notice=ctx.nmukCompletionEmail(draft),url=new URL(notice.email);
  assert.equal(url.pathname,'owner%40example.com');
  assert.equal(url.searchParams.get('body'),'Your vehicle (MTC 2) is complete and ready to pick up from our workshop.\n\nVECTA');
  for(const patch of [{customer_account:'Staff'},{customer_account:'CONTRACTOR'},{nmuk_vehicle_type:'MVOS'},{nmuk_vehicle_type:'Various'},{no_vehicle:true},{job_type:'Vehicle Tax'}])assert.equal(ctx.nmukCompletionEmail({...draft,...patch}),null);
  assert.ok(ctx.nmukCompletionEmail({...draft,nmuk_vehicle_type:'Pool'}));
  ctx.fleetVehicleForRegistration=()=>null;assert.equal(ctx.nmukCompletionEmail(draft).email,'');
});
test('reserve on click; open only after confirmed save; provide manual email fallback',async()=>{
  const {ctx,events}=setup();assert.equal(await ctx.completeNmukJobAndNotify('j'),true);
  assert.deepEqual(events.map(e=>e[0]),['open','save','email']);
  assert.ok(ctx.document.querySelector('a[href^="mailto:"]'));
});
test('failed or queued save never opens completion email and closes reserved tab',async()=>{
  for(const result of [false,true]){
    const {ctx,events}=setup();ctx.saveJob=async()=>result;
    await ctx.completeNmukJobAndNotify('j');assert.deepEqual(events.map(e=>e[0]),['open','close']);assert.equal(ctx.document.querySelector('a'),null);
  }
  assert.match(html,/if\(savedResult===true&&typeof onConfirmed==='function'\)onConfirmed\(j\)/);
});
test('already complete jobs do not notify again; missing owner never falls back to NMUK billing',async()=>{
  const {ctx,job,events}=setup();job.status='completed';await ctx.completeNmukJobAndNotify('j');assert.deepEqual(events.map(e=>e[0]),['save']);
  job.status='booked';events.length=0;ctx.fleetVehicleForRegistration=()=>({contactEmail:''});await ctx.completeNmukJobAndNotify('j');assert.deepEqual(events.map(e=>e[0]),['save','alert']);
});
test('blocked popup still offers email; double clicks cannot save or notify twice',async()=>{
  const {ctx,events,draft}=setup();ctx.window.open=()=>null;
  let finish;ctx.saveJob=(id,confirmed)=>new Promise(resolve=>{finish=()=>{confirmed(draft);resolve(true);};});
  const first=ctx.completeNmukJobAndNotify('j');assert.equal(await ctx.completeNmukJobAndNotify('j'),false);finish();await first;
  assert.ok(ctx.document.querySelector('a[href^="mailto:"]'));assert.equal(events.length,0);
});
test('retry after a rejected completion uses the editor baseline rather than unsaved local state',async()=>{
  const {ctx,job,events}=setup();ctx.window.__vectaJobEditorBaseline={id:'j',job:{...job}};job.status='completed';job.archived=true;
  await ctx.completeNmukJobAndNotify('j');assert.deepEqual(events.map(e=>e[0]),['open','save','email']);
});
