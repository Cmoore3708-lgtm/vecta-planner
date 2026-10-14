import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function invoicePaidDate('),html.indexOf('function invoicePaymentKey('));
const ctx=vm.createContext({Intl,Date});vm.runInContext(helpers,ctx);
test('payment date survives JSON cloud round trip and method correction',()=>{
 const inv={payment_method:'',lines:[{description:'Service',amount:100}]};
 const date=ctx.invoicePaymentDateForChange(inv,'card');assert.match(date,/^\d{4}-\d{2}-\d{2}$/);
 ctx.setInvoicePaidDate(inv,date);inv.payment_method='card';
 const cloud=JSON.parse(JSON.stringify(inv));assert.equal(ctx.invoicePaidDate(cloud),date);
 assert.equal(ctx.invoicePaymentDateForChange(cloud,'cash'),date);
 assert.equal(ctx.invoicePaymentDateForChange(cloud,''),'');assert.equal(cloud.lines[0].amount,100);
});
test('historical payments without dates stay unknown',()=>{assert.equal(ctx.invoicePaymentDateForChange({payment_method:'cash',lines:[]},'bacs'),'')});
