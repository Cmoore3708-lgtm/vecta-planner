import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const context={esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('function vehicleTaxInvoiceTitle('),html.indexOf('function printInvoice(inv)')),context);
test('saved NMUK tax invoice without source keeps its billing month in both headings',()=>{
 const inv={invoice_number:'78764',registration:'NMUK TAX',vehicle:'Vehicle Tax — September 2026',invoice_date:'2026-10-01'};
 assert.equal(context.vehicleTaxInvoiceTitle(inv),'Vehicle tax September 2026');
 assert.match(context.vehicleTaxInvoiceHeading(inv),/>Vehicle tax September 2026<\/div>/);
});
test('explicit tax billing month wins over invoice creation date',()=>{
 assert.equal(context.vehicleTaxInvoiceTitle({source:'vehicle_tax_eom',eom_month:'2026-09',invoice_date:'2026-10-01'}),'Vehicle tax September 2026');
});
test('saved dated tax lines recover the month when metadata and vehicle title are absent',()=>{
 assert.equal(context.vehicleTaxInvoiceTitle({registration:'NMUK TAX',invoice_date:'2026-10-01',lines:[{description:'Vehicle tax — AB12 CDE — Fri, 11 Sept 2026'}]}),'Vehicle tax September 2026');
});
test('ordinary workshop invoices do not acquire a tax heading',()=>{
 assert.equal(context.vehicleTaxInvoiceHeading({registration:'AB12 CDE',vehicle:'Nissan',invoice_date:'2026-09-01'}),'');
});
test('invoice screen and print output share the same heading helper',()=>{
 assert.ok(html.includes('<h2>INVOICE</h2>\'+vehicleTaxInvoiceHeading(inv)+\''));
 assert.ok(html.includes('<div class="printTitle">INVOICE\'+vehicleTaxInvoiceHeading(inv)+\''));
});
