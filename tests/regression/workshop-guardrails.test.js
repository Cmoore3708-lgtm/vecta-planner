import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
  assert.match(html,/grid-template-columns:125px 76px minmax\(105px,1fr\) 88px 68px 24px 58px 54px!important/, 'Work due, booking type, booked tick, booked date and Email sent must have compact dedicated columns');
  assert.match(html,/\.fleetBookedDateLink\{[^}]*font-size:9px/, 'booked links must use compact green text');
  assert.match(html,/document\.querySelectorAll\('\[data-fleet-booked-job\]'\)[\s\S]*?job&&job\.booking_date\|\|link\.dataset\.fleetBookedDate[\s\S]*?selectedDate=new Date\(date\+'T00:00:00'\);view='planner';render\(\)/);
  assert.doesNotMatch(html,/document\.querySelectorAll\('\[data-fleet-booked-job\]'\)[\s\S]*?openJobModal\(id\)/);
  assert.match(html,/function fleetEmailSentDisplayDate\(record\)[\s\S]*?toLocaleDateString\('en-GB',\{day:'2-digit',month:'2-digit'\}\)/, 'email audit dates must omit the year');
  assert.match(html,/data-fleet-email-registration=/, 'vehicle email links must identify their Fleet registration');
  assert.match(html,/document\.querySelectorAll\('\.fleetReminderEmailLink'\)[\s\S]*?link\.dataset\.fleetEmailRegistration=normReg\(v\.registration/, 'the drawer Email button must inherit the active registration');
  assert.match(html,/async function fleetMarkEmailSentForVehicle\(v\)[\s\S]*?if\(remoteClient\)await persistFleetCloudSnapshot\(\)/, 'email audit must reach cloud storage before Outlook opens');
  assert.match(html,/async function fleetOpenTrackedEmail\(link,ev\)[\s\S]*?await fleetMarkEmailSentForVehicle\(v\);[\s\S]*?render\(\);[\s\S]*?window\.location\.href=mailto/, 'email click must save and refresh before opening Outlook');
  assert.match(html,/document\.addEventListener\('click',[\s\S]*?closest\('\.contactEmailLink,\.fleetReminderEmailLink'\)[\s\S]*?fleetOpenTrackedEmail\(link,ev\)[\s\S]*?,true\)/, 'dynamically opened vehicle email links must be captured');
  assert.match(html,/<span>Booking type<\/span><span>✓<\/span><span>Booked<\/span><span>Email sent<\/span>/, 'the due list headers must keep the booked tick in its own column');
  assert.match(html,/fleetWorkDueGroupCell\(group\.items\)\+fleetBookingTypeGroupCell\(group\.items\)\+fleetBookedTickGroupCell\(group\.items\)\+fleetBookedGroupCell\(group\.items,v\)\+fleetEmailSentCell\(group\)/, 'Email sent must remain the far-right cell');
  assert.match(html,/function fleetBookedTickGroupCell\(items\)[\s\S]*?fleetBookedTick\(item\.bookedJob\)/, 'the red booked tick must be rendered by its own dedicated column');
  assert.match(html,/\.fleetRow\.due30Columns\{padding-top:7px;padding-bottom:7px\}/, 'single-work Fleet rows must remain compact');
  assert.match(html,/\.fleetEmailSentCheck input\{width:16px!important;height:16px!important\}/, 'the far-right email checkbox must remain compact');
  assert.match(html,/\.fleetWorkDueGroupCell\{align-items:flex-end\}/);
});

test('Fleet email clicks finish the audit save before refreshing and opening Outlook',async()=>{
  const source=html.match(/async function fleetMarkEmailSentForVehicle\(v\)[\s\S]*?(?=function fleetEmailSentDisplayDate)/)?.[0];
  assert.ok(source,'Fleet email audit functions must remain available');
  const actions=[],vehicle={id:'dc-kaizen',registration:'DC KAIZEN'};
  const context={
    fleetEmailSent:{},
    fleetEmailDueGroupForVehicle:()=>({vehicle,items:[]}),
    fleetEmailCycleKey:()=> 'dc-kaizen|service',
    localStorage:{setItem(){actions.push('local')}},
    remoteClient:{},
    persistFleetCloudSnapshot:async()=>{actions.push('cloud-start');await Promise.resolve();actions.push('cloud-finished');return true},
    normReg:value=>String(value||'').replace(/\s+/g,''),
    fleetVehicleForRegistration:()=>vehicle,
    fleetVehicles:[vehicle],
    activeFleetVehicleId:'dc-kaizen',
    render:()=>actions.push('render'),
    document:{addEventListener(){actions.push('delegated')}},
    window:{location:{set href(value){actions.push('open:'+value)}}}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const link={dataset:{fleetEmailRegistration:'DC KAIZEN'},getAttribute:()=> 'mailto:test@example.com',closest:()=>null};
  const event={preventDefault(){actions.push('prevent')},stopPropagation(){actions.push('stop')}};
  await context.fleetOpenTrackedEmail(link,event);
  assert.ok(actions.indexOf('cloud-finished')<actions.indexOf('render'));
  assert.ok(actions.indexOf('render')<actions.indexOf('open:mailto:test@example.com'));
  assert.equal(context.fleetEmailSent['dc-kaizen|service'].sent,true);
});

test('Fleet email due-group creation declares its items collection before use',()=>{
  assert.match(html,/function fleetEmailDueGroupForVehicle\(v\)[\s\S]*?var limit=new Date\(today\),items=\[\];limit\.setDate/, 'email clicks must not throw items is not defined');
  assert.doesNotMatch(html,/limit\.setDate\(limit\.getDate\(\)\+30\),items=\[\]/, 'items must not be assigned through an undeclared comma expression');
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
