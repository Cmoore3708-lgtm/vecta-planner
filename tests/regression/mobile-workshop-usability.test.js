import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('phone planner renders the saved MOT appointment time',()=>{
  assert.match(html,/function mobileMotAppointmentHtml\(j\)[\s\S]*?motTimeFromJob\(j\)[\s\S]*?hasMotJobType\(j\)[\s\S]*?>MOT /);
  assert.match(html,/function mobileJobCardHtml\(j,groupName\)[\s\S]*?jobTypeChip\(j\)\+mobileMotAppointmentHtml\(j\)/);
});

test('shared office and mechanic paperwork save requires positive numeric mileage',()=>{
  assert.match(html,/function requireServiceSheetMileage\(sheet\)[\s\S]*?querySelector\('\.ssMileageEntry'\)[\s\S]*?!\/\^\\d\+\$\/[\s\S]*?Number\(digits\)<=0/);
  assert.match(html,/async function saveServiceSheet\(\)[\s\S]*?requireServiceSheetMileage\(sheet\)[\s\S]*?if\(!sheetMileage\)return false/);
  assert.match(html,/Shared by Workshop Pro and the dedicated Mechanic Dashboard deployment/);
});

test('phone invoices are one compact screen-width row without desktop overflow',()=>{
  assert.match(html,/@media\(max-width:760px\)[\s\S]*?\.invoiceArchiveTable\{width:100%!important;min-width:0!important\}/);
  assert.match(html,/\.invoiceArchiveRow\{display:grid!important;grid-template-columns:40px 46px minmax\(24px,1fr\) 41px 44px 65px!important/);
  assert.match(html,/invoiceArchiveNumberMobile/);
  assert.match(html,/invoiceArchiveReferenceMobile/);
  assert.match(html,/invoiceArchiveDateMobile/);
});

test('phone job type chooser exposes every permanent built-in type',()=>{
  const expected=['Major Service','Full Service','Interim Service','EV Interim Service','6 Month Safety Check','On-Site Service','MOT','Pre MOT check','Brakes','Diagnostics','Blocked DPF','Clutch','Timing','Tyres','Puncture repair','Tow Bar Fit','Tow Bar Removal','Site Visit','Wash & hover','Driving duties','Clean Workshop','General'];
  assert.equal(expected.length,22);
  for(const name of expected){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(html,new RegExp(`(?:['"]${escaped}['"]|\\b${escaped}:\\{)`));
  }
  assert.match(html,/templateSource=Object\.assign\(\{\},templates,app\.settings\.jobTemplates\|\|\{\}\)/);
  assert.match(html,/\.jobModalCard \.templateBtns\.multiSelect\{display:grid!important;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(html,/max-height:none!important;overflow:visible!important/);
});

test('invoice bank details print larger and stay on one line',()=>{
  assert.match(html,/\.invoicePrintPage \.printPayment>div\{font-size:12px!important;[\s\S]*?white-space:nowrap!important\}/);
});
