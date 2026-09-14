import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('js/vecta-app.js', 'utf8');
const css = fs.readFileSync('app.css', 'utf8');

test('invoice archive emits dedicated compact phone values', () => {
  assert.match(source, /function invoiceArchiveMobileNumber\(/);
  assert.match(source, /function invoiceArchiveMobileDate\(/);
  assert.match(source, /invoiceArchiveNumberMobile/);
  assert.match(source, /invoiceArchiveReferenceMobile/);
  assert.match(source, /invoiceArchiveDateMobile/);
});

test('phone invoice archive stays within one viewport-width row', () => {
  assert.match(css, /\.invoiceArchiveRow\{display:grid!important;grid-template-columns:40px 46px minmax\(24px,1fr\) 41px 44px 65px!important/);
  assert.match(css, /\.invoiceArchiveResults\{overflow:hidden!important/);
  assert.match(css, /\.invoiceArchiveHead\{display:none!important/);
});

test('desktop invoice values remain available outside the phone layout', () => {
  assert.match(css, /\.invoiceArchiveNumberMobile,\.invoiceArchiveReferenceMobile,\.invoiceArchiveDateMobile\{display:none\}/);
  assert.match(source, /invoiceArchiveNumberFull/);
  assert.match(source, /invoiceArchiveReferenceFull/);
  assert.match(source, /invoiceArchiveDateFull/);
});

test('phone planner shows a saved MOT appointment time', () => {
  assert.match(source, /function mobileMotAppointmentHtml\(j\)/);
  assert.match(source, /hasMotJobType\(j\)&&time/);
  assert.match(source, /jobTypeChip\(j\)\+'<\/div>'\+mobileMotAppointmentHtml\(j\)/);
  assert.match(css, /\.mobileMotAppointmentRow\{display:flex;justify-content:flex-end/);
  assert.match(css, /\.mobileMotAppointment\{/);
});
