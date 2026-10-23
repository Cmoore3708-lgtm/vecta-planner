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
 let printed=0,pdfSaved=0,frame;const timers=[];const after={};
 const contentWindow={document:{images:[],fonts:{ready:Promise.resolve()},querySelector:()=>({invoice:true})},requestAnimationFrame:fn=>fn(),addEventListener:(name,fn)=>after[name]=fn,focus(){},print(){printed++;}};
 const append=document.body.appendChild.bind(document.body);
 document.body.appendChild=node=>{frame=node;Object.defineProperty(node,'contentWindow',{value:contentWindow});append(node);queueMicrotask(()=>node.onload());return node;};
 const root={VectaInvoicePdf:{async save(element){assert.equal(element.invoice,true);printed++;pdfSaved++;}},document,location:{origin:'https://workshop.example'},setTimeout:fn=>{timers.push(fn);return 1;}};
 vm.runInNewContext(readFileSync('public/js/vecta-invoice-print.js','utf8'),root);
 await root.VectaInvoicePrint.print(document.querySelector('#printSheet'));
 assert.equal(printed,1);assert.match(frame.srcdoc,/vecta-customer-invoice.css\?v=/);assert.match(frame.srcdoc,/£35.00/);assert.doesNotMatch(frame.srcdoc,/index.html|haynes-job-tools.css/);
 assert.match(frame.style.cssText,/left:-10000px/);assert.equal(document.querySelector('iframe'),null);assert.equal(after.afterprint,undefined,'browser print must not add URL/date/page stamps');
 await root.VectaInvoicePrint.print(document.querySelector('#printSheet'),'print');
 assert.equal(printed,2);assert.equal(pdfSaved,1,'Print must not download another PDF');assert.equal(typeof after.afterprint,'function');after.afterprint();assert.equal(document.querySelector('iframe'),null);
 const app=readFileSync('index.html','utf8');assert.match(app,/root.querySelector\('\.invoicePrintPage'\).*window.VectaInvoicePrint.print\(root,output\|\|'print'\)/);
});

test('work description matches the fitted bank font and badge bottom matches Customer Details even in a zoomed preview',()=>{
 const {document}=parseHTML('<html><body><div class="invoicePrintPage"><div class="invoiceVehicleIdentityRow"><img class="invoiceMakeBadge" style="bottom:8px"></div><div class="printCustomerTop"><b>Customer Details</b></div><div class="printPayment"><div>Bank details</div></div><table class="printTable"><tr><td>Service description</td></tr></table></div></body></html>');
 const line=document.querySelector('.printPayment>div'),row=document.querySelector('.invoiceVehicleIdentityRow'),badge=document.querySelector('.invoiceMakeBadge'),label=document.querySelector('.printCustomerTop>b');
 document.createRange=()=>({selectNodeContents(){},getBoundingClientRect:()=>({width:275})});Object.defineProperty(line,'clientWidth',{value:700});Object.defineProperty(line,'offsetWidth',{value:700});line.getBoundingClientRect=()=>({width:350});Object.defineProperty(row,'offsetHeight',{value:200});
 row.getBoundingClientRect=()=>({height:100});badge.getBoundingClientRect=()=>({bottom:200});label.getBoundingClientRect=()=>({bottom:180});
 document.defaultView.getComputedStyle=e=>({bottom:e.style.bottom});
 const context={document};vm.runInNewContext(readFileSync('public/js/vecta-invoice-print.js','utf8'),context);context.VectaInvoicePrint.fitFooter(document);
 assert.equal(document.querySelector('.invoicePrintPage').style.getPropertyValue('--invoice-work-description-size'),line.style.fontSize);assert.ok(parseFloat(line.style.fontSize)>12);assert.equal(badge.style.bottom,'48px');
 assert.match(readFileSync('public/js/vecta-customer-invoice.css','utf8'),/\.printTable td:first-child\{[^}]*font-size:var\(--invoice-work-description-size,14px\)/);
});
