import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('phone Fleet due list uses a screen-width compact grid',()=>{
  assert.match(html,/@media\(max-width:700px\)[\s\S]*?\.fleetTableHead\.due30Columns\{display:none\}/);
  assert.match(html,/\.fleetPanel\{max-width:100%;overflow-x:hidden!important\}/);
  assert.match(html,/\.fleetRow\.due30Columns\{box-sizing:border-box;grid-template-columns:minmax\(104px,118px\) minmax\(72px,1fr\) 96px!important;grid-template-rows:28px auto auto;[\s\S]*?width:calc\(100% - 8px\);max-width:calc\(100% - 8px\)/);
  assert.match(html,/\.fleetRow\.due30Columns>:nth-child\(2\)\{grid-column:1;grid-row:2;[\s\S]*?padding-left:2px\}/);
  assert.match(html,/\.fleetRow\.due30Columns>:nth-child\(3\)\{grid-column:2;grid-row:1\/3;[\s\S]*?align-self:center/);
  assert.doesNotMatch(html,/@media\(max-width:700px\)\{\.fleetTableHead\.due30Columns,\.fleetRow\.due30Columns\{grid-template-columns:96px minmax\(100px,1fr\) minmax\(90px,\.8fr\) 80px 168px!important\}\}/);
});

test('Fleet due list links booked dates to planner days and dates email audit ticks',()=>{
  assert.match(html,/class="fleetBookedDateLink" data-fleet-booked-job=/);
  assert.match(html,/data-fleet-booked-date=/);
  assert.match(html,/shortDate=new Date\([\s\S]*?toLocaleDateString\('en-GB',\{day:'2-digit',month:'2-digit'\}\)/, 'booked dates must omit the year');
  assert.match(html,/grid-template-columns:125px 76px minmax\(105px,1fr\) 78px 72px minmax\(201px,226px\)!important/, 'Booked must give its spare width to Work due');
  assert.match(html,/\.fleetBookedDateLink\{[^}]*font-size:9px/, 'booked links must use compact green text');
  assert.match(html,/document\.querySelectorAll\('\[data-fleet-booked-job\]'\)[\s\S]*?job&&job\.booking_date\|\|link\.dataset\.fleetBookedDate[\s\S]*?selectedDate=new Date\(date\+'T00:00:00'\);view='planner';render\(\)/);
  assert.doesNotMatch(html,/document\.querySelectorAll\('\[data-fleet-booked-job\]'\)[\s\S]*?openJobModal\(id\)/);
  assert.match(html,/function fleetEmailSentDisplayDate\(record\)[\s\S]*?niceDate\(raw\)/);
  assert.match(html,/data-fleet-email-registration=/, 'vehicle email links must identify their Fleet registration');
  assert.match(html,/document\.querySelectorAll\('\.fleetReminderEmailLink'\)[\s\S]*?link\.dataset\.fleetEmailRegistration=normReg\(v\.registration/, 'the drawer Email button must inherit the active registration');
  assert.match(html,/\.contactEmailLink,\.fleetReminderEmailLink[\s\S]*?dataset&&link\.dataset\.fleetEmailRegistration[\s\S]*?fleetMarkEmailSentForVehicle\(v\)/);
  assert.match(html,/\.fleetTableHead\.due30Columns>span:nth-child\(6\)\{justify-self:end;text-align:right;padding-right:12px\}/);
  assert.match(html,/\.fleetRow\.due30Columns \.fleetDueItem \.fleetDueText\{margin-left:auto;text-align:right\}/);
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
  assert.match(html,/function updateJobQuick\(j\)\{if\(\(j\.status==='completed'\|\|j\.status==='work_complete'\|\|j\.status==='ready_to_invoice'\)&&typeof showTowbarRemovalReminder/);
  assert.match(html,/readyButton\.onclick=async function\(\)[\s\S]*?savedJob&&savedJob\.status==='ready_to_invoice'[\s\S]*?showTowbarRemovalReminder\(savedJob\)/);
});
