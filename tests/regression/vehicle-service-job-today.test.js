import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const handler = html.split('\n').find(line => line.includes("modal.querySelectorAll('[data-vehicle-due-action]')"));

function click(action, serviceDate, today = '2026-11-03') {
  const link = { dataset: { vehicleDueAction: action } };
  let preset;
  vm.runInNewContext(handler, {
    modal: { querySelectorAll: () => [link] },
    serviceType: 'On-Site Service', serviceDate,
    due: { motDue: '2026-12-01' }, v: {}, fv: null,
    reg: 'AXLEENG', vehicle: 'Qashqai', customer: {}, fleetCustomer: 'NMUK',
    closeModals() {}, todayIso: () => today,
    openJobModal: (_id, value) => { preset = value; }
  });
  link.onclick();
  return preset;
}

test('service link uses the click date for overdue, future and missing due dates', () => {
  for (const due of ['2026-11-01', '2026-12-01', '']) {
    const job = click('service', due);
    assert.equal(job.booking_date, '2026-11-03');
    assert.equal(job.job_type, 'On-Site Service');
    assert.equal(job.registration, 'AXLEENG');
  }
  assert.equal(click('service', '2026-11-01', '2026-11-04').booking_date, '2026-11-04');
});

test('MOT link retains its existing date behaviour', () => {
  assert.equal(click('mot', '2026-11-01').booking_date, '2026-12-01');
});
