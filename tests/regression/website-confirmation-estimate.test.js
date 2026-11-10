import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {confirmationContent} from '../../lib/portal-email.js';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function section(start,end){
  const from=html.indexOf(start),to=html.indexOf(end,from);
  assert.ok(from>=0&&to>from);
  return html.slice(from,to);
}
const source=section('var WEBSITE_CONFIRMATION_MARKER=','function websiteConfirmationWorkText(')
  +section('async function openWebsiteBookingConfirmationEmail(','function isUnresolvedWebsiteService(')
  +section('async function saveJob(','function prepareLinkedCustomerVehicleLocal(');
const base={id:'11111111-1111-4111-8111-111111111111',status:'provisional',source:'website booking',customer_account:'Staff',customer_email:'customer@example.test',customer_name:'Test Customer',customer_note:'',registration:'AB12CDE',booking_date:'2026-11-12',technician:'Alfie',work_required:'Check brakes',amount_quoted:null,vat_mode:'inc_vat'};
function setup(changes={}){
  const saved=[],drafts=[],alerts=[],job={...base,...changes};
  const c={console,app:{jobs:[job]},document:{getElementById:()=>null},
    gatherJob:()=>({...job,status:'booked'}),privatePricingItemsFromNote:()=>[],
    vectaConfirmDuplicateBooking:async()=>true,isUuid:()=>true,
    isWebsiteBookingJob:()=>true,isUnresolvedWebsiteService:()=>false,
    plannerJobTimeLocked:()=>false,isVehicleTaxJob:()=>false,shouldAutoAllocateJobSlot:()=>false,
    prepareLinkedCustomerVehicleLocal:()=>null,syncTaskFromMiniJob(){},
    plannerTechnicianLane:x=>x,plannerCompactLane:()=>[],ensureContractorSavedFromJob(){},
    invalidateFinanceDashboardCache(){},saveLocal(){},reconcileWebsiteProvisionalInbox(){},
    closeModals(){},render(){},alert:message=>alerts.push(message),
    syncSavedJobBundleInBackground:async(row,linked,previous,options)=>{saved.push({row,options});return true;},
    niceDate:()=> '12/11/2026',websiteConfirmationWorkText:j=>j.work_required,normReg:x=>x,
    vectaProgressRequest:async()=>({url:'https://www.vectamotors.co.uk/track?token=test'}),
    appendVectaEmailSignature:body=>body,
    VectaPortalWorkshop:{confirmation:async job=>drafts.push(confirmationContent(job,'https://www.vectamotors.co.uk/track#test'))}};
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  return {c,saved,drafts,alerts};
}

test('website booking without an estimate saves and opens a formatted confirmation showing To be confirmed',async()=>{
  const {c,saved,drafts,alerts}=setup();
  const ok=await c.saveJob(base.id,j=>c.openWebsiteBookingConfirmationEmail(j),{prepareWebsiteConfirmation:true});
  assert.equal(ok,true);
  assert.deepEqual(alerts,[]);
  assert.equal(saved.length,1);
  assert.equal(saved[0].options.requireCloud,true);
  assert.equal(saved[0].row.status,'booked');
  assert.equal(saved[0].row.amount_quoted,null);
  assert.equal(drafts.length,1);
  assert.match(drafts[0].text,/Estimated cost: To be confirmed\n/);
  assert.doesNotMatch(drafts[0].text,/£0\.00|NaN/);
});

test('empty or invalid estimates display unknown without a currency or VAT suffix',()=>{
  const {c}=setup();
  for(const amount of [null,undefined,'','   ','unknown',NaN,Infinity]){
    for(const mode of ['inc_vat','ex_vat','no_vat']){
      assert.equal(c.websiteConfirmationCostText({amount_quoted:amount,vat_mode:mode}),'unknown');
    }
  }
});

test('entered estimates retain their amount and VAT wording, including an explicit zero',async()=>{
  for(const [mode,suffix] of [['inc_vat',' including VAT'],['ex_vat',' + VAT'],['no_vat',' (no VAT)'],['',' including VAT']]){
    for(const amount of [0,120,'120.50']){
      const {c,drafts}=setup();
      await c.openWebsiteBookingConfirmationEmail({...base,amount_quoted:amount,vat_mode:mode});
      assert.ok(drafts[0].text.includes('Estimated cost: £'+Number(amount).toFixed(2)+suffix+'\n'));
    }
  }
});

test('unknown estimate does not bypass required email, date or successful cloud confirmation',async()=>{
  for(const changes of [{customer_email:''},{booking_date:''}]){
    const {c,saved,drafts,alerts}=setup(changes);
    assert.notEqual(await c.saveJob(base.id,j=>c.openWebsiteBookingConfirmationEmail(j),{prepareWebsiteConfirmation:true}),true);
    assert.equal(saved.length,0);assert.equal(drafts.length,0);assert.equal(alerts.length,1);
  }
  const {c,drafts,alerts}=setup();
  c.syncSavedJobBundleInBackground=async()=>false;
  assert.equal(await c.saveJob(base.id,j=>c.openWebsiteBookingConfirmationEmail(j),{prepareWebsiteConfirmation:true}),false);
  assert.equal(drafts.length,0);assert.match(alerts[0],/NOT been confirmed/);
});
