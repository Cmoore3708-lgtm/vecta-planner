import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';

test('EV paperwork retains charge and diagnostic findings across a saved-sheet round trip',()=>{
  const scope={};
  runInNewContext(readFileSync(new URL('../../public/js/vecta-ev-service.js',import.meta.url),'utf8'),scope);
  const {document}=parseHTML('<html><body><div class="servicePrint" data-sheet-type="service"><div class="ssDocumentTitle"></div><div class="ssPreHead">Oil level</div><div class="ssPreBody"><div class="dipWrap"></div></div><div class="ssSection"><div class="ssTitle">Oil &amp; Fluids</div><div class="ssFluidsHorizontal"></div></div><table class="ssOps"></table><table class="ssHealthChecks"></table></div></body></html>');
  let sheet=document.querySelector('.servicePrint');
  for(const name of ['Oil Specification','Quantity','Brake Fluid','Coolant','Screenwash'])sheet.querySelector('.ssFluidsHorizontal').insertAdjacentHTML('beforeend','<div class="ssFluidInline"><b>'+name+'</b></div>');
  for(const name of ['Interim service','Air filter','Pollen filter','Fuel filter','Spark plugs','Coolant level','Power steering fluid'])sheet.querySelector('.ssOps').insertAdjacentHTML('beforeend','<tr><td>'+name+'</td></tr>');
  for(const name of ['Exhaust System','Drive Belts','Brakes'])sheet.querySelector('.ssHealthChecks').insertAdjacentHTML('beforeend','<tr><td>'+name+'</td></tr>');
  for(const fuel_type of ['PETROL','DIESEL','HYBRID ELECTRIC']){scope.applyElectricServiceSheet(sheet,{fuel_type});assert.ok(sheet.querySelector('.dipWrap'));}
  scope.applyElectricServiceSheet(sheet,{fuel_type:'ELECTRIC'});
  assert.deepEqual([...sheet.querySelectorAll('.ssOps td,.ssHealthChecks td')].map(e=>e.textContent),['Pollen filter','Brakes']);
  assert.deepEqual([...sheet.querySelectorAll('.ssFluidInline b')].map(e=>e.textContent),['Brake Fluid','Screenwash']);
  assert.equal(sheet.querySelector('output').textContent,'Unrecorded');
  sheet.querySelector('.ssScanNotes').textContent='P0123 stored';
  sheet.querySelector('button').setAttribute('aria-checked','true');
  for(const value of ['0','64','100']){
    const input=sheet.querySelector('.ssBattery input');input.value=value;scope.updateServiceBattery(input);
    document.body.innerHTML=sheet.outerHTML;sheet=document.querySelector('.servicePrint');scope.applyElectricServiceSheet(sheet,{});
    assert.equal(sheet.querySelector('input').getAttribute('value'),value);
    assert.equal(sheet.querySelector('output').textContent,value+'%');
    assert.equal(sheet.querySelectorAll('.ssDiagnostic').length,1);
    assert.equal(sheet.querySelector('.ssScanNotes').textContent,'P0123 stored');
    assert.equal(sheet.querySelector('button').getAttribute('aria-checked'),'true');
  }
  scope.switchServiceSheet(sheet,{fuel_type:'ELECTRIC'},'standard');
  assert.ok(sheet.querySelector('.dipWrap'));
  assert.equal(sheet.querySelector('.ssCharge'),null);
  assert.equal(sheet.querySelector('.ssOps tr td').textContent,'Interim service');
  assert.equal(sheet.querySelectorAll('.ssFluidInline').length,5);
  scope.applyElectricServiceSheet(sheet,{fuel_type:'ELECTRIC'});
  assert.equal(sheet.querySelector('.ssCharge'),null);
  scope.switchServiceSheet(sheet,{fuel_type:'ELECTRIC'},'auto');
  assert.equal(sheet.querySelector('output').textContent,'100%');
  assert.equal(sheet.querySelector('.ssScanNotes').textContent,'P0123 stored');
});
