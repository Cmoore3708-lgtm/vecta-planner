import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const start = html.indexOf('async function vectaCheckInvoiceActionAgainstCloud(id){');
const end = html.indexOf('function openJobModal(id,preset){', start);
assert.ok(start > 0 && end > start);

function setup(job, invoice) {
  const calls = [];
  const context = {
    navigator: { onLine: true },
    remoteClient: { from(table) { return {
      select() { return this; }, eq() { return this; }, limit() { return this; },
      then(resolve) { resolve({ data: table === 'jobs' ? [job] : invoice ? [invoice] : [], error: null }); }
    }; } },
    app: { jobs: [{ id: job.id, status: 'booked' }], invoices: [] },
    jobCompletionEvidence: row => row.status === 'completed',
    fromRemote: row => row,
    vectaAdoptRemoteJob(row) { calls.push('adopt'); context.app.jobs[0] = row; },
    vectaInvoiceIsActive: () => true,
    saveLocal() { calls.push('save'); }, closeModals() { calls.push('close'); },
    alert(message) { calls.push(message); }, openInvoice(id) { calls.push(`invoice:${id}`); },
    render() { calls.push('render'); }, console
  };
  vm.runInNewContext(html.slice(start, end), context);
  return { context, calls };
}

test('a stale card opens its already saved invoice without a status write', async () => {
  const { context, calls } = setup({ id: 'job-1', status: 'completed', archived: true }, { id: 'invoice-1', job_id: 'job-1', invoice_number: 'VECTA-78760', status: 'saved' });
  assert.equal(await context.vectaCheckInvoiceActionAgainstCloud('job-1'), false);
  assert.equal(context.app.jobs[0].status, 'completed');
  assert.deepEqual(calls.filter(x => x.startsWith('invoice:')), ['invoice:invoice-1']);
});

test('an active job can proceed after the cloud check', async () => {
  const { context, calls } = setup({ id: 'job-2', status: 'booked' });
  assert.equal(await context.vectaCheckInvoiceActionAgainstCloud('job-2'), true);
  assert.deepEqual(calls, []);
});
