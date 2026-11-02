import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function setup(invoices){
 const job={id:'body',registration:'BODYPLAN',amount_quoted:100};let opened,warning='';
 const c={remoteClient:{},navigator:{onLine:true},app:{invoices:[]},vectaFetchAllRemoteRows:async table=>table==='invoices'?invoices:[job],fromRemote:x=>x,fleetNormaliseCustomer:x=>x,vectaJobIsDeletedForLists:()=>false,vectaFleetDuplicatePairs:()=>[],closeModals(){},openInvoice:id=>opened=id,alert:message=>warning=message};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('async function vectaCheckFleetBilling('),html.indexOf('function fleetEomJobs(')),c);
 vm.runInContext(html.slice(html.indexOf('async function fleetEomConfirmFinalise('),html.indexOf('function fleetEomCustomerTotal(')),c);
 return {c,job,opened:()=>opened,warning:()=>warning};
}
test('approving the same NMUK month opens the existing cloud invoice without rebilling its jobs',async()=>{
 const inv={id:'existing',invoice_number:'VECTA-78801',fleet_customer:'NMUK',fleet_month:'2026-10',fleet_job_ids:['body']},s=setup([inv]);
 assert.equal(await s.c.fleetEomConfirmFinalise('NMUK','2026-10',[{job:s.job}]),false);
 assert.equal(s.opened(),'existing');assert.equal(s.c.app.invoices.length,1);assert.equal(s.warning(),'');
});
test('an unrelated invoice still blocks double billing and reports a handled approval message',async()=>{
 const s=setup([{id:'other',invoice_number:'VECTA-78801',job_id:'body'}]);
 assert.equal(await s.c.fleetEomConfirmFinalise('NMUK','2026-10',[{job:s.job}]),false);
 assert.match(s.warning(),/BODYPLAN.*already linked to invoice VECTA-78801/);
 assert.equal(s.opened(),undefined);assert.equal(s.c.app.invoices.length,0);
});
test('void invoices do not block approval and missing connection is handled',async()=>{
 const s=setup([{id:'void',status:'void',fleet_customer:'NMUK',fleet_month:'2026-10',fleet_job_ids:['body']}]);
 assert.equal(await s.c.vectaCheckFleetBilling('NMUK','2026-10',[{job:s.job}]),true);
 s.c.remoteClient=null;assert.equal(await s.c.fleetEomConfirmFinalise('NMUK','2026-10',[]),false);assert.match(s.warning(),/Reconnect/);
});
