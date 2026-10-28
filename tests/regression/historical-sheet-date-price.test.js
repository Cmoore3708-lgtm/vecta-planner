import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mechanicVariant} from '../../scripts/mechanic-variant.mjs';
const main=fs.readFileSync('index.html','utf8');
for(const [name,html] of [['Main',main],['mechanics',mechanicVariant(main)]]){
 test(name+' preserves a recorded job total instead of applying current template prices',()=>{
  const code=html.slice(html.indexOf('function privatePricingSectionHtml('),html.indexOf('function gatherPrivatePricingItems('));
  const context={privatePricingItemsFromNote:()=>[],privatePricingPresetItemsForTypes:()=>[{description:'MOT',price:55}],jobTypeLabel:()=> 'MOT',servicePricingAdvisorHtml:()=>'',privatePricingRowHtml:row=>JSON.stringify(row),esc:String};
  vm.runInNewContext(code,context);
  for(const total of [390,0]){const result=context.privatePricingSectionHtml({amount_quoted:total,work_required:'Historical work',job_type:'MOT'});assert.ok(result.includes('"price":'+total));assert.ok(result.includes('value="'+total+'"'));assert.ok(!result.includes('"price":55'));}
  assert.ok(context.privatePricingSectionHtml({job_type:'MOT'}).includes('"price":55'));
 });
 test(name+' generates historical paperwork with May date and editable mileage without changing the job',async()=>{
  const window={};vm.runInNewContext(html.match(/window\.CONTRACTOR_2026_JOBS=([^;]+);/)[0],{window});
  const job=window.CONTRACTOR_2026_JOBS.find(j=>j.id==='contractor-2026-row-228'),before=JSON.stringify(job),sheet={innerHTML:''};let opened=0;
  const context={window,app:{jobs:[]},document:{getElementById:()=>sheet},paperworkKindForJob:()=> 'service',normReg:r=>r.replace(/ /g,''),fetchDvsaVehicle:async()=>({}),vectaWithTimeout:p=>p,applyDvsaToJob:j=>{j.mileage=999999},openLatestServiceSheet:async()=>false,esc:v=>String(v??''),serviceSheetSummaryHtml:()=>'',serviceSectionTitle:()=>'',paperworkTitle:()=> 'Service Sheet',emailLinkHtml:()=>'',confirmedJobMileage:j=>j.mileage||'',jobTypeLabel:()=> 'Major Service',jobTypeInlineStyle:()=>'',dvsaAdvisoryArray:()=>[],selectedIso:()=> '2026-10-28',openServicePreview:()=>opened++,console};
  vm.runInNewContext(html.slice(html.indexOf('async function printService('),html.indexOf('function vehicleTaxInvoiceTitle(')),context);
  await context.printService(job.id,{booking_date:'2026-10-28'});
  assert.ok(sheet.innerHTML.includes('<b>Date:</b><span>19/05/2026</span>'));assert.ok(sheet.innerHTML.includes('data-service-date="2026-05-19"'));
  assert.ok(sheet.innerHTML.includes('aria-label="Mileage at this service"'));assert.ok(!sheet.innerHTML.includes('999999'));assert.equal(opened,1);
  await context.printService(job.id,{mileage:55118});assert.ok(sheet.innerHTML.includes('>55118</span>'));assert.equal(JSON.stringify(job),before);
  assert.ok(html.includes('var showService=!!id&&(isSafety'));
 });
}
