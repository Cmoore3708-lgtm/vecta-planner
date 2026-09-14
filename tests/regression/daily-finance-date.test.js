import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');

test('planner daily financial total follows the selected calendar date', () => {
  assert.match(html, /function financeDailyReferenceDate\(\)\{return view==='planner'\?selectedIso\(\):todayIso\(\)\}/);
  assert.match(html, /function invoiceFinancialSummary\(\)\{var today=financeDailyReferenceDate\(\)/);
  assert.match(html, /function invoiceFinanceJobs\(period\)\{var today=financeDailyReferenceDate\(\)/);
  assert.match(html, /function invoiceFinancePeriodMeta\(period\)\{var today=financeDailyReferenceDate\(\)/);
  assert.doesNotMatch(html, /title="Open today’s financial breakdown"/);
});

test('changing the planner date selects a different set of financial jobs', () => {
  const referenceDate = html.match(/function financeDailyReferenceDate\(\)\{[^\n]+/)[0];
  const financeJobs = html.match(/function invoiceFinanceJobs\(period\)\{[^\n]+/)[0];
  const context = {
    view: 'planner',
    selected: '2026-09-14',
    todayIso() { return '2026-09-14'; },
    iso(date) { return date.toISOString().slice(0, 10); },
    financeAllJobs() {
      return [
        { id: 'monday', dailyDate: '2026-09-14' },
        { id: 'tuesday', dailyDate: '2026-09-15' }
      ];
    },
    financeIsUnallocated() { return false; },
    financeDateForDailyView(job) { return job.dailyDate; }
  };
  context.selectedIso = () => context.selected;
  vm.createContext(context);
  vm.runInContext(`${referenceDate}\n${financeJobs}`, context);
  assert.deepEqual(Array.from(context.invoiceFinanceJobs('today'), job => job.id), ['monday']);
  context.selected = '2026-09-15';
  assert.deepEqual(Array.from(context.invoiceFinanceJobs('today'), job => job.id), ['tuesday']);
});
