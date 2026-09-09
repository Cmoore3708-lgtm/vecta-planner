import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source=readFileSync(resolve('index.html'),'utf8');

function functionSource(name,nextName){
  const start=source.indexOf(`async function ${name}`);
  const end=source.indexOf(nextName,start);
  assert.ok(start>=0,`${name} must exist`);
  assert.ok(end>start,`${name} boundary must exist`);
  return source.slice(start,end);
}

test('fleet vehicle removal is archival and contains no permanent record deletes',()=>{
  const body=functionSource('fleetRemoveVehicleCompletely','function fleetBind');
  assert.ok(body.includes("vehicle.status='Archived'"));
  assert.equal(body.includes('deleteRemote('),false);
  assert.equal(body.includes('app.jobs='),false);
  assert.equal(body.includes('app.invoices='),false);
  assert.equal(body.includes('app.serviceRecords='),false);
  assert.equal(body.includes('app.vehicles='),false);
});

test('archived fleet vehicles are excluded from active fleet lists',()=>{
  const match=source.match(/function fleetEnriched\(\)\{[^\n]+/);
  assert.ok(match);
  assert.ok(match[0].includes("toLowerCase()!=='archived'"));
});

test('website-request deletion cannot delete its accepted job or history',()=>{
  const body=functionSource('deleteWebsiteRequestCompletely','function bindWebsiteRequests');
  assert.equal(body.includes("deleteRemote('jobs'"),false);
  assert.equal(body.includes("deleteRemote('invoices'"),false);
  assert.equal(body.includes("deleteRemote('service_records'"),false);
  assert.equal(body.includes('app.jobs='),false);
  assert.equal(body.includes('app.invoices='),false);
  assert.equal(body.includes('app.serviceRecords='),false);
  assert.ok(body.includes("update({status:'deleted'})"));
});

test('workshop-only vehicle removal is blocked rather than cascaded',()=>{
  const start=source.indexOf("if(e=document.getElementById('recordRemoveVehicle'))");
  const end=source.indexOf("if(e=document.getElementById('recordConfirmFleetTaxed'))",start);
  const body=source.slice(start,end);
  assert.ok(body.includes('protected workshop vehicle record'));
  assert.equal(body.includes('deleteRemote('),false);
  assert.equal(body.includes('app.jobs='),false);
  assert.equal(body.includes('app.invoices='),false);
});

test('destructive vehicle wording is absent from the interface',()=>{
  assert.equal(source.includes('DELETE EVERYTHING held for'),false);
  assert.equal(source.includes('This permanently removes the vehicle and all Workshop Pro records'),false);
});
