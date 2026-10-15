import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync('index.html','utf8');
function setup(){const ctx=vm.createContext({app:{invoices:[
 {id:'new',invoice_number:'102',invoice_date:'2026-10-15',total:120},
 {id:'old',invoice_number:'101',invoice_date:'2026-09-01',total:80},
 {id:'paid',invoice_number:'100',invoice_date:'2026-08-01',payment_method:'card',total:90},
 {id:'draft',invoice_number:'99',status:'draft',total:1000},
 {id:'void',invoice_number:'98',status:'void',total:2000}
]},window:{},invoiceArchiveOutstandingOnly:true,invoiceArchiveSearchText:inv=>inv.id,money:v=>v.toFixed(2)});
 vm.runInContext(fs.readFileSync('public/js/vecta-invoice-rules.js','utf8'),ctx);
 for(const name of ['vectaInvoiceIsActive','vectaActiveInvoices','invoiceNumericPart','invoiceIsOutstanding','invoiceArchiveList','invoicePaymentSummaryHtml']){let start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);vm.runInContext(html.slice(start,end),ctx)}return ctx;}
test('unpaid list is oldest first, searchable and changes when payment is recorded',()=>{const ctx=setup();assert.deepEqual(Array.from(ctx.invoiceArchiveList('').map(x=>x.id)),['old','new']);assert.equal(ctx.invoiceArchiveList('new').length,1);ctx.app.invoices[1].payment_method='bacs';assert.deepEqual(Array.from(ctx.invoiceArchiveList('').map(x=>x.id)),['new']);assert.match(ctx.invoicePaymentSummaryHtml(),/120.00/);ctx.invoiceArchiveOutstandingOnly=false;assert.equal(ctx.invoiceArchiveList('').length,4)});
