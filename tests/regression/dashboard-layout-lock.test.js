import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {captureBoth,checkLayout} from '../../scripts/dashboard-layout-lock.mjs';
const html=fs.readFileSync('index.html','utf8');
const readAsset=url=>fs.readFileSync(path.join('public',url),'utf8');
test('approved Main and mechanics desktop/phone dashboard layout matches the locked baseline',()=>{assert.equal(checkLayout(captureBoth()),true);});
test('accidental mobile card markup and desktop customer removal both fail the layout lock',()=>{
 for(const [before,after] of [['class="mobileJob jobTypeCoded','class="mobileJob accidentalRedesign jobTypeCoded'],['class="plannerJobCustomer"','class="removedCustomer"']])assert.throws(()=>checkLayout(captureBoth({html:html.replace(before,after)})),/DASHBOARD LAYOUT LOCK/);
});
test('late phone and desktop CSS overrides cannot silently change approved cards',()=>{
 for(const css of ['.mobilePlanner .mobileJob{padding:99px!important}', '#content .plannerJobCustomer{display:none!important}']){
  assert.throws(()=>checkLayout(captureBoth({readAsset:url=>readAsset(url)+(url==='/js/haynes-job-tools.css'?css:'')})),/DASHBOARD LAYOUT LOCK/);
 }
});
test('a new inline dashboard override is detected even outside the usual stylesheet',()=>{
 assert.throws(()=>checkLayout(captureBoth({html:html.replace('</head>','<style>.mobileJob{font-size:1px!important}</style></head>')})),/DASHBOARD LAYOUT LOCK/);
});
test('unrelated job editor styles remain editable without approving a dashboard redesign',()=>{
 assert.equal(checkLayout(captureBoth({readAsset:url=>readAsset(url)+(url==='/js/job-card-compact.css'?'\n#jobModal .jobContactSection{border-radius:9px}':'')})),true);
});
test('production builds enforce layout locks both before and after mechanics generation',()=>{
 const {scripts}=JSON.parse(fs.readFileSync('package.json','utf8'));
 assert.match(scripts.build,/^node scripts\/dashboard-layout-lock\.mjs && /);
 assert.match(scripts.build,/&& node scripts\/dashboard-layout-lock\.mjs --built$/);
});
