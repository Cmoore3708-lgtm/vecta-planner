import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { validShareToken,validShare,downloadableInvoice,invoicePdf } from '../../lib/invoice-download.js';
import { createDownloadHandler } from '../../api/invoice-download.js';
const token='11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222';
const inv={id:'33333333-3333-4333-8333-333333333333',status:'saved',invoice_number:'VECTA-12345',customer_name:'Alex Example',registration:'AB12 CDE',vehicle:'Example vehicle',invoice_date:'2026-10-01',lines:[{description:'Replace front brake pads',amount:100,vat_mode:'ex_vat'}],subtotal:100,vat:20,total:120};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},send(body){this.body=body;return this}}}
function fetchRows(rows){return async()=>({ok:true,json:async()=>rows.shift()})}
test('invoice links require a random token and an unexpired grant',()=>{assert.equal(validShareToken(token),true);for(const t of ['',inv.id,'../main',token+'x'])assert.equal(validShareToken(t),false);assert.ok(validShare({invoice_id:inv.id,expires_at:'2099-01-01'}));assert.equal(validShare({invoice_id:inv.id,expires_at:'2000-01-01'}),false);assert.equal(downloadableInvoice({...inv,status:'draft'}),false);assert.equal(downloadableInvoice({...inv,status:'deleted'}),false)});
test('download returns only the granted saved invoice as a PDF attachment',async()=>{
 const original=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';
 try{const res=response();await createDownloadHandler(fetchRows([[{value:{invoice_id:inv.id,expires_at:'2099-01-01'}}],[inv],[{value:{}}]]),async i=>{assert.equal(i.id,inv.id);return Buffer.from('%PDF-test')})({method:'GET',query:{token}},res);assert.equal(res.code,200);assert.equal(res.headers['Content-Type'],'application/pdf');assert.match(res.headers['Content-Disposition'],/attachment; filename="VECTA-12345.pdf"/);assert.equal(res.headers['Cache-Control'],'private, no-store');}finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}
});
test('bad, missing and expired links never render or expose an invoice',async()=>{const original=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';try{for(const query of [{}, {token:'bad'}, {token}]){const res=response();await createDownloadHandler(fetchRows([[]]),()=>{throw Error('Must not render')})({method:'GET',query},res);assert.equal(res.code,404)}}finally{if(original===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=original;}});
test('PDF is valid and paginates long invoices',async()=>{const bytes=await invoicePdf(inv);assert.match(bytes.toString('ascii',0,8),/%PDF/);assert.equal((await PDFDocument.load(bytes)).getPageCount(),1);const many={...inv,lines:Array.from({length:100},()=>({...inv.lines[0],description:'Long item '.repeat(20)}))};assert.ok((await PDFDocument.load(await invoicePdf(many))).getPageCount()>1)});
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
test('Staff messages wait for confirmed invoice save and read the saved total',()=>{assert.match(html,/function openJobCompletionContact[\s\S]*?customer_account[\s\S]*?STAFF[\s\S]*?return false/);assert.match(html,/showStaffInvoiceSendPrompt\(inv\)/);assert.match(html,/invoiceTotal:saved.total/);assert.match(html,/Download your invoice:/);assert.match(html,/Save the invoice first/);assert.match(html,/crypto.randomUUID\(\)\+'\.'\+crypto.randomUUID\(\)/)});
