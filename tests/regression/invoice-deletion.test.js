import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const context=vm.createContext({});
vm.runInContext(readFileSync(resolve('public/js/vecta-invoice-rules.js'),'utf8'),context);
const rules=context.VectaInvoiceRules;
const day=24*60*60*1000;
const now=Date.parse('2026-09-09T12:00:00Z');

test('only void invoices are excluded from active financial records',()=>{
  assert.equal(rules.isActive({status:'saved'}),true);
  assert.equal(rules.isActive({status:'draft'}),true);
  assert.equal(rules.isActive({status:' VOID '}),false);
});

test('cancelled invoice can be restored for 30 days',()=>{
  assert.equal(rules.canRestore({status:'void',updated_at:new Date(now-29*day).toISOString()},now),true);
  assert.equal(rules.canRestore({status:'void',updated_at:new Date(now-30*day).toISOString()},now),false);
});

test('missing cancellation timestamp fails closed',()=>{
  assert.equal(rules.canRestore({status:'void'},now),false);
});

test('production invoice cancellation path contains no database delete',()=>{
  const source=readFileSync(resolve('index.html'),'utf8');
  const start=source.indexOf('async function deleteInvoiceCompletely');
  const end=source.indexOf('async function restoreVoidInvoice',start);
  const cancellation=source.slice(start,end);
  assert.ok(cancellation.includes("inv.status='void'"));
  assert.equal(cancellation.includes("deleteRemote('invoices'"),false);
});

test('customer and vehicle collections are not mutated by invoice cancellation',()=>{
  const source=readFileSync(resolve('index.html'),'utf8');
  const start=source.indexOf('async function deleteInvoiceCompletely');
  const end=source.indexOf('async function restoreVoidInvoice',start);
  const cancellation=source.slice(start,end);
  assert.equal(cancellation.includes('app.customers='),false);
  assert.equal(cancellation.includes('app.vehicles='),false);
});

test('void invoices are excluded from money totals and duplicate-invoice checks',()=>{
  const source=readFileSync(resolve('index.html'),'utf8');
  assert.match(source,/function invoicePaymentSummaryHtml\(\).*vectaActiveInvoices\(\)/);
  assert.match(source,/function financeSavedInvoiceForJob\(j\).*vectaActiveInvoices\(\)/);
  assert.match(source,/function savedInvoiceForJobId\(jobId,excludeInvoiceId\).*vectaActiveInvoices\(\)/s);
  assert.match(source,/function fleetEomInvoice\(name,month,rows\).*existing=vectaActiveInvoices\(\)/);
});

test('cancelled invoice retains its number and full invoice row',()=>{
  const source=readFileSync(resolve('index.html'),'utf8');
  const start=source.indexOf('async function deleteInvoiceCompletely');
  const end=source.indexOf('async function restoreVoidInvoice',start);
  const cancellation=source.slice(start,end);
  assert.equal(cancellation.includes('invoice_number='),false);
  assert.equal(cancellation.includes('app.invoices='),false);
});

test('cancelling an invoice never returns its job to ready to invoice',()=>{
  const source=readFileSync(resolve('index.html'),'utf8');
  const start=source.indexOf('async function deleteInvoiceCompletely');
  const end=source.indexOf('async function restoreVoidInvoice',start);
  const cancellation=source.slice(start,end);
  assert.equal(cancellation.includes("linkedJob.status='ready_to_invoice'"),false);
  assert.ok(cancellation.includes("linkedJob.status='completed';linkedJob.archived=true"));
});
