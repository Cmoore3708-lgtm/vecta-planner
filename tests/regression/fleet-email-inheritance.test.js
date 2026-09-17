import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('contractor email is resolved centrally and used by the missing-email view',()=>{
  assert.match(html,/function fleetContractorContactEmail\(name\)/);
  assert.match(html,/function fleetEffectiveContactEmail\(v\)/);
  assert.match(html,/app&&app\.customers/);
  assert.match(html,/missing=all\.filter\(function\(v\)\{return !fleetEffectiveContactEmail\(v\)\}\)\.length/);
  assert.match(html,/fleetListMode==='missing'&&!fleetEffectiveContactEmail\(v\)/);
});

test('known deleted NMUK emails are removed and contractor emails are propagated',()=>{
  for(const reg of ['BODYHC','CASTENG','MTC2','FLV1'])assert.match(html,new RegExp(`${reg}:'`));
  assert.match(html,/v\.fleetGroup==='Nissan Internal'&&old/);
  assert.match(html,/v\.fleetGroup==='Contractor Fleet'&&fleetNormaliseCustomer\(v\.customer\)===name/);
  assert.match(html,/if\(!await persistFleetCloudSnapshot\(\)\)throw new Error\('Fleet email repair was not confirmed by cloud storage\.'\)/);
});

test('saving a contractor profile copies its email to every vehicle, including clearing it',()=>{
  assert.match(html,/if\(name!=='NMUK'\)\{fleetVehicles\.forEach\(function\(v\)\{if\(v\.fleetGroup==='Contractor Fleet'&&fleetNormaliseCustomer\(v\.customer\)===name\)v\.contactEmail=profile\.contactEmail\}\)\}/);
});
