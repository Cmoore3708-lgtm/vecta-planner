import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync('index.html','utf8');
const dateFunctions=html.split('\n').filter(line=>/^function (serviceSheetDate|serviceSheetDateIso|serviceSheetDateInput|updateServiceSheetDate)\(/.test(line)).join('\n');
const controls=html.slice(html.indexOf('function maintenanceDateInput('),html.indexOf('function openVehicleRecordBase('));
function fixture(value='2027-07-16',disabled=false){
  const c={esc:value=>String(value??'').replaceAll('"','&quot;')};
  vm.createContext(c);vm.runInContext(dateFunctions+'\n'+controls,c);
  const {document}=parseHTML('<html><body>'+c.maintenanceDateInput(value,'data-unified-plan-date="service"','Service due date',disabled)+'</body></html>');
  const display=document.querySelector('.ssDueDateDisplay'),input=document.querySelector('.ssDueDateInput');
  display.setCustomValidity=message=>{display.error=message};
  display.reportValidity=()=>{display.reported=true};display.focus=()=>{};
  return {c,document,display,input};
}
test('maintenance dates display day first and keep ISO values for saving',()=>{
  for(const [iso,uk] of [['2027-07-16','16/07/2027'],['2026-11-16','16/11/2026'],['2027-01-02','02/01/2027'],['','']]){
    const {c,display,input}=fixture(iso);
    assert.equal(display.type,'text');assert.equal(display.value,uk);assert.equal(input.value,iso);
    display.value='03/04/2027';assert.equal(c.validateMaintenanceDate(input),true);assert.equal(input.value,'2027-04-03');
    input.value='2028-02-29';c.syncMaintenanceDateDisplay(input);assert.equal(display.value,'29/02/2028');
  }
});
test('invalid typed dates never overwrite a saved date; blank clears it',()=>{
  const {c,display,input}=fixture();
  for(const value of ['07/16/2027','31/02/2027','29/02/2027','1/2/27']){
    display.value=value;assert.equal(c.validateMaintenanceDate(input),false);
    assert.equal(input.value,'2027-07-16');assert.equal(display.reported,true);assert.match(display.error,/DD\/MM\/YYYY/);
  }
  display.value='';assert.equal(c.validateMaintenanceDate(input),true);assert.equal(input.value,'');
});
test('government-controlled dates remain disabled and cannot be typed over',()=>{
  const {c,display,input}=fixture('2027-07-16',true);
  assert.equal(display.disabled,true);assert.equal(input.disabled,true);
  display.value='03/04/2027';assert.equal(c.validateMaintenanceDate(input),true);
  assert.equal(input.value,'2027-07-16');assert.equal(display.value,'16/07/2027');
});
test('row and full-record save reject invalid dates before changing any plan',()=>{
  const start=html.indexOf('/* Record manual due-date intent');
  const source=html.slice(start,html.indexOf('/* End-of-month month selector repair.',start));
  for(const bulk of [false,true]){
    const {c,document,display}=fixture();
    const button=document.createElement('button');
    if(bulk)button.id='recordSaveVehicle';else button.setAttribute('data-unified-save-plan','service');
    document.body.appendChild(button);
    const plan={id:'service',currentDueDate:'2027-07-16'};
    Object.assign(c,{document,window:{},fleetPlans:[plan]});
    let listener;document.addEventListener=(event,handler)=>{listener=handler};
    vm.runInContext(source,c);display.value='31/02/2027';
    let stopped=false;listener({target:button,preventDefault(){},stopImmediatePropagation(){stopped=true}});
    assert.equal(stopped,true);assert.equal(plan.currentDueDate,'2027-07-16');assert.equal(plan.manualDueDate,undefined);
    display.value='03/04/2027';listener({target:button});
    assert.equal(plan.currentDueDate,'2027-04-03');assert.equal(plan.targetMonth,4);assert.equal(plan.manualDueDate,true);
  }
});
