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
 assert.match(css,/@page\{size:A4 portrait;margin:0\}/);
 assert.match(css,/width:210mm!important/);assert.match(css,/zoom:1!important/);assert.match(css,/padding:10mm!important/);
 assert.match(css,/background:#fff!important/);assert.doesNotMatch(css,/planner|servicePreviewing|@media all/);
});

test('workshop invoices print their rendered content in an isolated document, without dashboard styles',async()=>{
 const {document}=parseHTML('<html><body><div id="printSheet"><div class="invoicePrintPage"><div class="printTotals">£35.00</div></div></div></body></html>');
 let printed=0,frame;const timers=[];const after={};
 const contentWindow={document:{images:[],fonts:{ready:Promise.resolve()},querySelector:()=>({invoice:true})},requestAnimationFrame:fn=>fn(),addEventListener:(name,fn)=>after[name]=fn,focus(){},print(){printed++;}};
 const append=document.body.appendChild.bind(document.body);
 document.body.appendChild=node=>{frame=node;Object.defineProperty(node,'contentWindow',{value:contentWindow});append(node);queueMicrotask(()=>node.onload());return node;};
 const root={VectaInvoicePdf:{async save(element){assert.equal(element.invoice,true);printed++;}},document,location:{origin:'https://workshop.example'},setTimeout:fn=>{timers.push(fn);return 1;}};
 vm.runInNewContext(readFileSync('public/js/vecta-invoice-print.js','utf8'),root);
 await root.VectaInvoicePrint.print(document.querySelector('#printSheet'));
 assert.equal(printed,1);assert.match(frame.srcdoc,/vecta-customer-invoice.css\?v=/);assert.match(frame.srcdoc,/£35.00/);assert.doesNotMatch(frame.srcdoc,/index.html|haynes-job-tools.css/);
 assert.match(frame.style.cssText,/left:-10000px/);assert.equal(document.querySelector('iframe'),null);assert.equal(after.afterprint,undefined,'browser print must not add URL/date/page stamps');
 const app=readFileSync('index.html','utf8');assert.match(app,/root.querySelector\('\.invoicePrintPage'\).*window.VectaInvoicePrint.print\(root\)/);
});
