import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('phone Fleet due list uses a screen-width compact grid',()=>{
  assert.match(html,/@media\(max-width:700px\)[\s\S]*?\.fleetTableHead\.due30Columns\{display:none\}/);
  assert.match(html,/\.fleetRow\.due30Columns\{box-sizing:border-box;grid-template-columns:minmax\(0,1fr\) 94px!important;grid-template-rows:28px auto auto;[\s\S]*?width:100%;max-width:100%/);
  assert.match(html,/\.fleetRow\.due30Columns>:nth-child\(2\)\{grid-column:1;grid-row:2;[\s\S]*?padding-left:2px\}/);
  assert.match(html,/\.fleetRow\.due30Columns>:nth-child\(3\)\{grid-column:1;grid-row:3;/);
  assert.doesNotMatch(html,/@media\(max-width:700px\)\{\.fleetTableHead\.due30Columns,\.fleetRow\.due30Columns\{grid-template-columns:96px minmax\(100px,1fr\) minmax\(90px,\.8fr\) 80px 168px!important\}\}/);
});

test('Alfie is unavailable from 14:30 every Friday',()=>{
  assert.match(html,/function recurringTimeOffForDay\(mechanic,date\)[\s\S]*?toLowerCase\(\)==='alfie'[\s\S]*?getDay\(\)===5[\s\S]*?start_time:'14:30'[\s\S]*?end_time:'17:00'/);
  assert.match(html,/return saved\.concat\(recurringTimeOffForDay\(mechanic,date\)\)/);
  assert.match(html,/\.timeOffBlock\{[\s\S]*?background:repeating-linear-gradient\(135deg,rgba\(185,28,28/);
});

test('towbar removal completion displays the requested reminder in both workflows',()=>{
  assert.match(html,/function towbarRemovalJob\(job\)[\s\S]*?tow\[\\s-\]\*bar[\s\S]*?remov/);
  assert.match(html,/alert\('Have you wrote the name on the towbar\?'\)/);
  assert.match(html,/complete\.onclick=function\(\)[\s\S]*?showTowbarRemovalReminder\(current\)[\s\S]*?current\.status=WORK_COMPLETE/);
  assert.match(html,/button\.onclick=function\(event\)[\s\S]*?showTowbarRemovalReminder\(draft\)[\s\S]*?previousClick/);
  assert.match(html,/function updateJobQuick\(j\)\{if\(\(j\.status==='completed'\|\|j\.status==='work_complete'\)&&typeof showTowbarRemovalReminder/);
});
