import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=readFileSync('public/js/vecta-customer-invoice.js','utf8');
test('phone preview zoom is removed for both print entry paths and restored after print',()=>{
 const {document}=parseHTML('<html><body><button id="printInvoice"></button><main class="printSheet"></main></body></html>');
 const events={};let mediaChange;
 const window={innerWidth:390,addEventListener:(name,fn)=>events[name]=fn,matchMedia:()=>({addEventListener:(name,fn)=>mediaChange=fn})};
 vm.runInNewContext(source,{window,document,setTimeout});
 const sheet=document.querySelector('.printSheet');assert.ok(Number(sheet.style.zoom)<1);
 events.beforeprint();assert.ok(!sheet.style.zoom);events.resize();assert.ok(!sheet.style.zoom,'print resize must not reapply phone zoom');
 events.afterprint();assert.ok(Number(sheet.style.zoom)<1);
 mediaChange({matches:true});assert.ok(!sheet.style.zoom);mediaChange({matches:false});assert.ok(Number(sheet.style.zoom)<1);
});
test('customer print CSS contains only invoice rules, fixes A4 width and resets backgrounds',()=>{
 const css=readFileSync('public/js/vecta-customer-invoice.css','utf8');
 assert.ok(css.length<12000,'must not inherit a generated dashboard stylesheet');
 assert.match(css,/@page\{size:A4 portrait;margin:10mm\}/);
 assert.match(css,/width:190mm!important/);assert.match(css,/zoom:1!important/);
 assert.match(css,/background:#fff!important/);assert.doesNotMatch(css,/planner|servicePreviewing|@media all/);
});
