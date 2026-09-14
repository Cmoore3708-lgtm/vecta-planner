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
