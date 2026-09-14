import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('completed and deleted tasks have durable state independent of the task row', () => {
  assert.match(html, /var TASK_STATE_KEY='vecta_task_state_v50'/);
  assert.match(html, /function setTaskStateOverride\(t,state\)[\s\S]*?writeIndependentTaskState\(store\)/);
  assert.match(html, /function applyTaskStateOverrides\(\)[\s\S]*?o&&o\.state==='deleted'[\s\S]*?o&&o\.state==='done'/);
  assert.match(html, /async function persistTaskStateOverrides\(\)[\s\S]*?task_state_overrides_v50/);
});

test('cloud task downloads cannot resurrect locally completed or deleted work', () => {
  assert.match(html, /function vectaReconcileTasksFromCloud\(remoteRows\)[\s\S]*?applyTaskStateOverrides\(\)/);
  assert.match(html, /taskOverrideFor\(t\)/);
  assert.match(html, /mergeTaskStateMaps\(hydrateIndependentTaskState\(\),rr\.data\[0\]\.value\)/);
});

test('task allocation preserves a linked mini-job and return removes that link', () => {
  assert.match(html, /function createMiniTaskFromDrop\(t,tech,time\)[\s\S]*?source:'task:'\+t\.id[\s\S]*?m\.mini_job_id=j\.id/);
  assert.match(html, /function syncTaskFromMiniJob\(j\)[\s\S]*?m\.allocated=true[\s\S]*?if\(j\.status==='completed'\)\{t\.done=true/);
  assert.match(html, /function bindTaskReturnDrop\(panel\)[\s\S]*?m\.allocated=false[\s\S]*?m\.mini_job_id=''[\s\S]*?app\.jobs=app\.jobs\.filter/);
});

test('task rows and task-linked planner jobs are excluded from revenue', () => {
  assert.match(html, /function financeValidJob\(j\)\{[^}]*j\.card_type==='mini_task'/);
  assert.match(html, /function contractorAllFinanceJobs\(\)[\s\S]*?j\.card_type==='mini_task'/);
  assert.match(html, /function staffAllFinanceJobs\(\)[\s\S]*?j\.card_type==='mini_task'/);
  assert.match(html, /function nmukAllFinanceJobs\(\)[\s\S]*?j\.card_type==='mini_task'/);
});
