import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import gen from '@babel/generator';
import traverse from '@babel/traverse';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['invoiceIsStaff','staffInvoiceLineAmount','staffInvoiceLineHtml','invoiceEditorLineValue','invoiceTotals','lineHtml','vehicleTaxInvoiceTitle','vehicleTaxInvoiceHeading','printInvoice'];
const ctx={app:{settings:{vatRate:20},jobs:[{id:'s',customer_account:'Staff'},{id:'n',customer_account:'NMUK'},{id:'c',customer_account:'CONTRACTOR'}]},esc:String,money:v=>'£'+Number(v).toFixed(2),fleetInvoiceCustomerProfile:()=>({}),jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({}),latestServiceMileage:()=>'',invoiceSenderHtml:()=>'',invoicePlate:()=>'',niceDate:String,printWhenImagesReady:()=>{},document:{getElementById:()=>ctx.sheet},sheet:{}};
vm.createContext(ctx);
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 const ast=parse(match[1],{sourceType:'script'});
 (traverse.default||traverse)(ast,{FunctionDeclaration(path){const node=path.node;if(names.includes(node.id.name))vm.runInContext((gen.default||gen)(node).code,ctx);}});
}
test('only explicitly identified Staff invoices use net prices; tax always excluded',()=>{
 assert.equal(ctx.invoiceIsStaff({job_id:'s'}),true);
 for(const inv of [{job_id:'n'},{job_id:'c'},{customer_name:'Staff'},{job_id:'s',fleet_customer:'NMUK'},{job_id:'s',registration:'NMUK TAX'},{job_id:'s',source:'vehicle_tax_eom'},{job_id:'s',vehicle:'Vehicle Tax — October 2026'}])assert.equal(ctx.invoiceIsStaff(inv),false);
});
test('inclusive, exclusive, exempt, negative, zero and configured rates',()=>{
 for(const [amount,mode,expected] of [[120,'inc_vat',100],[100,'ex_vat',100],[55,'no_vat',55],[-120,'inc_vat',-100],[0,'inc_vat',0]])assert.equal(ctx.staffInvoiceLineAmount({amount,vat_mode:mode}),expected);
 ctx.app.settings.vatRate=5;assert.equal(ctx.staffInvoiceLineAmount({amount:105,vat_mode:'inc_vat'}),100);ctx.app.settings.vatRate=20;
});
test('editor preserves original gross amount and mode through rounded display and saves',()=>{
 const rendered=ctx.staffInvoiceLineHtml({amount:100,vat_mode:'inc_vat'});
 assert.match(rendered,/value="83.33"/);assert.doesNotMatch(rendered,/value="inc_vat"/);
 const input={value:'83.33',dataset:{displayAmount:'83.33',displayVat:'ex_vat',originalAmount:'100',originalVat:'inc_vat'}};
 const tr={querySelector:s=>s==='[data-line-amount]'?input:{value:'ex_vat'}};
 const original=ctx.invoiceEditorLineValue(tr);assert.equal(original.amount,100);assert.equal(original.vat_mode,'inc_vat');assert.equal(ctx.invoiceTotals([original]).total,100);
 input.value='90';const edited=ctx.invoiceEditorLineValue(tr);assert.equal(edited.amount,90);assert.equal(edited.vat_mode,'ex_vat');assert.equal(ctx.invoiceTotals([edited]).total,108);
});
test('actual print output shows Staff net lines with separate VAT and unchanged total',()=>{
 const inv={job_id:'s',lines:[{description:'Repair',amount:120,vat_mode:'inc_vat'},{description:'MOT',amount:55,vat_mode:'no_vat'}],subtotal:155,vat:20,total:175};
 ctx.printInvoice(inv);assert.match(ctx.sheet.innerHTML,/Amount \(ex VAT\)/);assert.match(ctx.sheet.innerHTML,/£100.00/);assert.match(ctx.sheet.innerHTML,/£55.00/);assert.match(ctx.sheet.innerHTML,/<b>VAT:<\/b><span>£20.00/);assert.match(ctx.sheet.innerHTML,/<b>Total:<\/b><span>£175.00/);
 for(const job_id of ['n','c']){ctx.printInvoice({...inv,job_id});assert.doesNotMatch(ctx.sheet.innerHTML,/Amount \(ex VAT\)/);assert.match(ctx.sheet.innerHTML,/£120.00/);}
});
