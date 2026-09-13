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
