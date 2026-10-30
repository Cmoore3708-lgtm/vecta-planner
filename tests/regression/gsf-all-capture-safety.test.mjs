import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogueSelection} from '../../workers/gsf/live-service.mjs';
const rows=JSON.parse(readFileSync(new URL('../fixtures/gsf-all-failure-captures-2026-10-30.json',import.meta.url)));
const kinds={'Air Filter':'air_filter','Oil Filter':'oil_filter','Cabin Filter':'cabin_filter','Fuel Filter':'fuel_filter','Engine Oils (Applied)':'oil'};
test('complete uploaded failure capture is present, not a handful of favourable examples',()=>assert.equal(rows.length,121));
for(const row of rows){
 test(`${row.registration} ${row.category}: real capture and negative safety mutations`,()=>{
  if(!row.capture)return;
  const kind=kinds[row.category];assert.ok(kind);
  const select=capture=>catalogueSelection(capture,kind,row.registration);
  for(const capture of [{...row.capture,selectedRegistration:false},{...row.capture,truncated:true},{...row.capture,registration:'OTHER1'}])assert.throws(()=>select(capture));
  let selected;try{selected=select(row.capture);}catch(error){assert.equal(error.message,'REVIEW_REQUIRED');return;}
  assert.ok(row.capture.visibleText.includes('SKU: '+selected.searchTerm));assert.ok(selected.expectedPricePence>0);
  assert.equal(selected.kind,kind);
  // Remove ALL qualifying inventory/quality, so another valid group cannot hide
  // a deliberately invalid first group. No alternative product is accepted here.
  assert.throws(()=>select({...row.capture,visibleText:row.capture.visibleText.replace(/\bGold\b/g,'Bronze')}));
  assert.throws(()=>select({...row.capture,visibleText:row.capture.visibleText.replace(/\b(Boldon|RDC|NDC)\s+\d+/g,'$1 0')}));
  assert.throws(()=>select({...row.capture,visibleText:row.capture.visibleText.replace(/\bSKU:/g,'Missing product:')}));
 });
}
