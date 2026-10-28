import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync('index.html','utf8');
const code=html.slice(html.indexOf('function serviceSheetDate(value)'),html.indexOf('function serviceSheetDueData('))+html.slice(html.indexOf('function serviceSheetDateIso('),html.indexOf('function serviceSheetSummaryHtml('));
function context(){const c={esc:v=>String(v??'').replaceAll('"','&quot;')};vm.createContext(c);vm.runInContext(code,c);return c;}
test('each service sheet due date can be typed in UK order and retains an ISO storage value',()=>{
 const c=context();
 for(const field of ['mot','tax','service']){
  const {document}=parseHTML('<html><body>'+c.serviceSheetDateInput('2026-05-09','Due date',field)+'</body></html>');
  const input=document.querySelector('input.ssDueDateDisplay'),stored=document.querySelector('.ssDueDateInput');
  assert.equal(input.type,'text');assert.equal(input.value,'09/05/2026');input.setCustomValidity=message=>{input.error=message};input.value='02/01/2027';assert.equal(c.updateServiceSheetDate(input),true);assert.equal(stored.value,'2027-01-02');assert.equal(stored.getAttribute('value'),'2027-01-02');assert.equal(input.error,'');
 }
});
test('invalid dates cannot overwrite the stored date or pass save validation',()=>{
 const c=context();let stored='2026-05-09',reported=false;const field={value:'31/02/2027',setCustomValidity(message){this.error=message},nextElementSibling:{set value(v){stored=v},setAttribute(){}},reportValidity(){reported=true},focus(){}};
 assert.equal(c.validateServiceSheetDates({querySelectorAll:()=>[field]}),false);assert.equal(stored,'2026-05-09');assert.equal(reported,true);assert.match(field.error,/DD\/MM\/YYYY/);
 assert.equal(c.serviceSheetDateIso('29/02/2028'),'2028-02-29');assert.equal(c.serviceSheetDateIso('29/02/2027'),null);assert.equal(c.serviceSheetDateIso(''),'');
});
