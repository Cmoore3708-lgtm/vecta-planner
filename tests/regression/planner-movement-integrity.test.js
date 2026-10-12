import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('lane compaction keeps every job and produces a non-overlapping schedule', () => {
  const jobs = [
    { id: 'a', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '08:00', estimated_hours: 1 },
    { id: 'b', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '08:30', estimated_hours: 0.5 },
    { id: 'c', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '09:00', estimated_hours: 1.5 },
  ];
  const context = {
    jobs,
    plannerLaneActiveJobs: () => jobs,
    clockMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; },
    normaliseClock: value => value,
    timeFromMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; },
    roundPlannerMinutesUp: value => Math.ceil(value / 15) * 15,
    plannerSafeStackStart: (_job, cursor) => cursor,
    Number,
    Date,
  };
  vm.runInNewContext(`${namedFunctionSource('plannerCompactLane')}; changed = plannerCompactLane('2026-09-14', 'Alfie');`, context);
  assert.deepEqual(jobs.map(j => j.id), ['a', 'b', 'c']);
  assert.deepEqual(jobs.map(j => j.drop_time), ['08:00', '09:00', '09:30']);
  assert.deepEqual(jobs.map(j => j.estimated_hours), [1, 0.5, 1.5]);
  assert.deepEqual(Array.from(context.changed, j => j.id), ['b', 'c']);
});

test('planner moves save locally first and then verify every cloud write', () => {
  const bindLane = namedFunctionSource('bindLane');
  const persist = namedFunctionSource('persistPlannerJobs');
  assert.match(bindLane, /saveLocal\(\)[\s\S]*?persistPlannerJobsInBackground\(changed,'Planner job move'\)/);
  assert.match(persist, /await upsertRemote\('jobs',j,\{silent:true\}\)[\s\S]*?await vectaVerifyPlannerJobSaved\(j\)/);
  assert.match(namedFunctionSource('vectaVerifyPlannerJobSaved'), /for\(var attempt=0;attempt<3;attempt\+\+\)/);
});

test('unallocated jobs are explicit and tasks cannot leak into that list', () => {
  const source = namedFunctionSource('bindUnallocatedDrop');
  assert.match(source, /card_type==='mini_task'/);
  assert.match(source, /j\.technician='Unallocated'/);
  assert.match(source, /j\.booking_date=null/);
  assert.match(source, /persistPlannerJobsInBackground\(changed,'Move to Unallocated'\)/);
});

test('legacy technician names collide in the same visible Other lane', () => {
  const plannerRules = fs.readFileSync(new URL('../../public/js/vecta-planner-rules.js', import.meta.url), 'utf8');
  const jobs = [
    { id: 'legacy', booking_date: '2026-09-14', technician: 'Jordan', drop_time: '09:00', estimated_hours: 1, status: 'booked' },
  ];
  const context = {
    app: { settings: { mechanics: ['Alfie', 'Other', 'Anyone'] }, jobs },
    window: {},
    globalThis: {},
    isJobInvoiced: () => false,
    clockMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; },
    roundPlannerMinutesUp: value => Math.ceil(Number(value || 0) / 15) * 15,
    timeFromMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; },
    normaliseClock: value => value,
    Number,
    String,
    Math,
  };
  context.window.window = context.window;
  vm.runInNewContext(plannerRules, context.window);
  vm.runInNewContext([
    namedFunctionSource('plannerLaneMechanics'),
    namedFunctionSource('plannerTechnicianName'),
    namedFunctionSource('plannerTechnicianLane'),
    namedFunctionSource('mechanicBookingIntervals'),
    "intervals=mechanicBookingIntervals('2026-09-14','Other','new')",
  ].join(';'), context);
  assert.deepEqual(Array.from(context.intervals, row => [row.id, row.start, row.end]), [['legacy', 540, 600]]);
  assert.match(namedFunctionSource('findNextMechanicSlot'), /mechanicBookingIntervals\(date,job\.technician,excludeId\)/);
});

test('every job ingress path repairs overlaps before rendering', () => {
  assert.match(namedFunctionSource('saveJob'), /plannerCompactLane\(j\.booking_date,plannerTechnicianLane\(j\.technician\)\)[\s\S]*?render\(\)/);
  assert.match(namedFunctionSource('scheduleCloudRefresh'), /table==='jobs'[\s\S]*?repairExistingPlannerOverlaps\(\{persistRemote:true\}\)[\s\S]*?render\(\)/);
  assert.match(namedFunctionSource('refreshPlannerCoreFromCloudAndRender'), /repairExistingPlannerOverlaps\(\{persistRemote:true\}\)[\s\S]*?render\(\)/);
});

test('startup cleanup cannot overwrite a newer mechanic with a cached unallocated copy',()=>{
 const stale={id:'adam-mot',registration:'ADAM',technician:'Unallocated',booking_date:'2026-10-23',status:'booked',updated_at:'2026-10-09T14:00:00Z'};
 const original=JSON.stringify(stale);let writes=0;
 const ctx={app:{jobs:[stale]},remoteClient:{},isUnallocatedJob:()=>true,isJobInvoiced:()=>false,saveLocal:()=>{writes++},upsertRemote:()=>{writes++;return Promise.resolve([])}};
 vm.runInNewContext(namedFunctionSource('clearUnallocatedBookingDate')+';'+namedFunctionSource('normaliseUnallocatedBookingDates')+';result=normaliseUnallocatedBookingDates()',ctx);
 assert.equal(ctx.result,0);assert.equal(writes,0);assert.equal(JSON.stringify(stale),original);
});

test('opening an existing job preserves a mechanic absent from the current settings',()=>{
 const open=namedFunctionSource('openJobModal');
 const start=open.indexOf("var mechanics=['Unallocated']"),end=open.indexOf('var ramps=',start);
 assert.ok(start>-1&&end>start);
 for(const technician of ['Jordan','alfie','Alfie']){
  const ctx={id:'existing-job',j:{technician},app:{settings:{mechanics:['Alfie','Other']}}};
  const result={...ctx,esc:v=>String(v),String};vm.runInNewContext(open.slice(start,end)+';'+namedFunctionSource('select')+";markup=select('Technician','technician',j.technician,mechanics)",result);
  assert.match(result.markup,new RegExp('<option value="'+technician+'" selected>'));
 }
});

test('current and future legacy-mechanic bookings do not also appear in Unallocated',()=>{
 const jobs=[
  {id:'future',registration:'H13CKK',technician:'Chris',booking_date:'2026-10-13',status:'booked'},
  {id:'today',registration:'AB12XYZ',technician:'Chris',booking_date:'2026-10-12',status:'booked'},
  {id:'past',registration:'PAST',technician:'Chris',booking_date:'2026-10-09',status:'booked'},
  {id:'no-date',registration:'NODATE',technician:'Chris',booking_date:null,status:'booked'},
  {id:'unallocated',registration:'NONE',technician:'Unallocated',booking_date:null,status:'booked'}
 ];
 const before=JSON.stringify(jobs);
 const ctx={app:{jobs,settings:{mechanics:['Alfie','Other']}},todayIso:()=> '2026-10-12',isVehicleTaxJob:()=>false,isJobInvoiced:()=>false,normReg:v=>String(v||'').replace(/\s/g,'').toUpperCase(),carryOverMeta:()=>null,byTime:()=>0};
 vm.runInNewContext(namedFunctionSource('unallocatedJobs')+';rows=unallocatedJobs()',ctx);
 assert.deepEqual(Array.from(ctx.rows,j=>j.id).sort(),['no-date','past','unallocated']);
 assert.equal(JSON.stringify(jobs),before);
});

test('phone Unallocated uses the shared list without adding assigned multi-day jobs',()=>{
 const allocated={id:'assigned-multi',card_type:'multi_day',technician:'Other',booking_date:'2026-10-13',status:'booked'};
 const unallocated={id:'real-backlog',technician:'Unallocated',status:'booked'};
 const ctx={app:{jobs:[allocated,unallocated],notes:''},window:{},selectedIso:()=> '2026-10-12',quoteJobs:()=>[],unallocatedJobs:()=>[unallocated],byTime:()=>0,esc:v=>String(v||''),mobileJobCardHtml:j=>'<i data-job="'+j.id+'"></i>',plannerTechnicianName:j=>j.technician};
 vm.runInNewContext(namedFunctionSource('mobilePlannerHtml')+";output=mobilePlannerHtml(['Alfie','Other'],[])",ctx);
 assert.match(ctx.output,/data-job="real-backlog"/);assert.doesNotMatch(ctx.output,/assigned-multi/);
 vm.runInNewContext("output=mobilePlannerHtml(['Alfie','Other'],[app.jobs[0]])",ctx);
 assert.equal((ctx.output.match(/assigned-multi/g)||[]).length,1);
});

test('renamed second column receives both Chris and legacy Other bookings',()=>{
 const rules=fs.readFileSync(new URL('../../public/js/vecta-planner-rules.js',import.meta.url),'utf8');const ctx={};vm.runInNewContext(rules,ctx);
 for(const technician of ['Chris','Other','Jordan'])assert.equal(ctx.VectaPlannerRules.technicianName({technician},['Alfie','Chris','Anyone']),'Chris');
 assert.equal(ctx.VectaPlannerRules.technicianName({technician:'Unallocated'},['Alfie','Chris','Anyone']),'Unallocated');
});

test('legacy Other is shown as Chris in the editor after renaming the column',()=>{
 const open=namedFunctionSource('openJobModal'),start=open.indexOf("var mechanics=['Unallocated']"),end=open.indexOf('var ramps=',start);
 const ctx={id:'job',j:{technician:'Other'},app:{settings:{mechanics:['Alfie','Chris','Anyone']}},plannerTechnicianLane:()=> 'Chris',esc:v=>String(v)};
 vm.runInNewContext(open.slice(start,end)+';'+namedFunctionSource('select')+";markup=select('Technician','technician',j.technician,mechanics)",ctx);
 assert.match(ctx.markup,/<option value="Chris" selected>/);assert.doesNotMatch(ctx.markup,/<option value="Other"/);
});

test('unrelated settings saves preserve the shared renamed mechanic list',async()=>{
 let written;const latest={value:{mechanics:['Alfie','Chris','Anyone']}};
 const ctx={app:{settings:{mechanics:['Alfie','Other','Anyone'],businessName:'Vecta Motors'}},vectaMainSettingsLastPersisted:'',console,remoteClient:{from:()=>({select:()=>({eq:()=>({single:async()=>({data:latest})})}),upsert:async row=>{written=row;return {}}})}};
 vm.runInNewContext(namedFunctionSource('vectaSettingsSignature')+';async '+namedFunctionSource('persistMainSettings'),ctx);
 assert.equal(await ctx.persistMainSettings(),true);assert.deepEqual(Array.from(written.value.mechanics),['Alfie','Chris','Anyone']);
 ctx.app.settings.mechanics=['Alfie','Dan','Anyone'];await ctx.persistMainSettings({mechanicsChanged:true});assert.deepEqual(Array.from(written.value.mechanics),['Alfie','Dan','Anyone']);
});
