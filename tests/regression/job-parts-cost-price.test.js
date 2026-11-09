import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const context={uid:()=> 'part-1'};
vm.createContext(context);
for(const name of ['jobParts','noteWithJobParts'])vm.runInContext(html.split('\n').find(line=>line.startsWith('function '+name+'(')),context);
test('part cost survives saving, reopening and arrival updates',()=>{
 const initial=[{id:'p',description:'Oil filter',quantity:2,cost_price:12.35,ordered:false,arrived:false}];
 let rows=context.jobParts({customer_note:context.noteWithJobParts('Customer instruction',initial)});
 assert.equal(rows[0].cost_price,12.35);
 rows[0].arrived=true;
 rows=context.jobParts({customer_note:context.noteWithJobParts('Customer instruction',rows)});
 assert.equal(rows[0].cost_price,12.35);
 assert.equal(rows[0].arrived,true);
});
test('legacy parts keep an empty cost; zero is preserved',()=>{
 for(const value of [undefined,null,0]){
 const rows=context.jobParts({customer_note:context.noteWithJobParts('',[{description:'Part',cost_price:value}])});
 assert.equal(rows[0].cost_price,value===0?0:null);
 }
});

function partsEditor(parts){
 let id=0;
 const ctx={uid:()=> 'part-'+(++id),esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),jobPartsRangeDisplay:()=>'',select:()=>'',partsStatusFromJob:()=>'',PARTS_STATUS_VALUES:[]};
 vm.createContext(ctx);ctx.window=ctx;vm.runInContext(fs.readFileSync('public/js/vecta-job-pricing.js','utf8'),ctx);
 for(const name of ['jobParts','noteWithJobParts','jobPartDisplayName','jobPartRowHtml','jobPartsEditorHtml','gatherJobPartsEditor','bindJobPartsEditor']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);
  vm.runInContext(html.slice(start,end),ctx);
 }
 const {document}=parseHTML(ctx.jobPartsEditorHtml({customer_note:ctx.noteWithJobParts('Customer note',parts)}));
 ctx.document=document;ctx.bindJobPartsEditor();
 return ctx;
}
test('short supplier names preserve full ordering descriptions and costs on save/reopen',()=>{
 const rows=[
  {id:'gsf-quote-oil_filter',description:'GSF · BritFlow Oil Filter - Spin-on [OF111]',quantity:1,cost_price:6.3},
  {id:'gsf-quote-air_filter',description:'GSF · Supplier Air Filter [AF123] with lengthy catalogue details',quantity:1,cost_price:9.65},
  {id:'gsf-quote-oil',description:'GSF · DriveTec FO Fully Synthetic motor oil 0W-20 - 5L [DT0205FO] · Fill 5.1L; priced 6L · GSF 5L pack',quantity:2,cost_price:43.41},
  {id:'gsf-estimate-cabin_filter',description:'ESTIMATED COST £19.34 ex VAT · Cabin filter · Confirm part before ordering',quantity:1,cost_price:19.34},
  {id:'manual',description:'Air filter housing repair — retain this instruction',quantity:1,cost_price:null}
 ];
 const ctx=partsEditor(rows),doc=ctx.document;
 assert.deepEqual(Array.from(doc.querySelectorAll('[data-part-description]'),x=>x.value),['Oil filter – spin on','Air filter','Engine oil 0W-20 · 5L','Cabin filter (est.)',rows[4].description]);
 const saved=ctx.gatherJobPartsEditor(),reopened=ctx.jobParts({customer_note:ctx.noteWithJobParts('Customer note',saved)});
 rows.forEach((row,i)=>{assert.equal(reopened[i].description,row.description);assert.equal(reopened[i].cost_price,row.cost_price);assert.equal(reopened[i].quantity,row.quantity);});
 assert.equal(doc.querySelector('[data-part-cost-price]').value,'6.30');
 assert.equal(doc.querySelectorAll('[data-part-detail-panel][hidden]').length,rows.length);
});
test('part details retain edit, arrival tracking, zero cost, add and remove controls',()=>{
 const ctx=partsEditor([{id:'gsf-quote-oil_filter',description:'GSF · Oil Filter - Spin-on [OF111]',quantity:1,cost_price:6.3}]),doc=ctx.document;
 const toggle=doc.querySelector('[data-toggle-part-details]'),panel=doc.querySelector('[data-part-detail-panel]');
 toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
 doc.querySelector('[data-part-description]').value='Oil filter — customer supplied';
 doc.querySelector('[data-part-cost-price]').value='0';doc.querySelector('[data-part-quantity]').value='2';
 const arrived=doc.querySelector('[data-part-arrived-edit]');arrived.checked=true;arrived.onchange();
 let saved=ctx.gatherJobPartsEditor();
 assert.equal(saved[0].description,'Oil filter — customer supplied');assert.equal(saved[0].cost_price,0);assert.equal(saved[0].quantity,2);assert.equal(saved[0].ordered,true);assert.equal(saved[0].arrived,true);
 toggle.click();assert.equal(panel.hidden,true);
 doc.getElementById('addJobPart').click();const added=doc.querySelectorAll('[data-job-part]')[1];
 added.querySelector('[data-part-description]').value='Brake pads';
 assert.equal(ctx.gatherJobPartsEditor()[1].description,'Brake pads');
 added.querySelector('[data-remove-job-part]').click();assert.equal(ctx.gatherJobPartsEditor().length,1);
});
