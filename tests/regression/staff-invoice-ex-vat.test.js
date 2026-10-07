import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import gen from '@babel/generator';
import traverse from '@babel/traverse';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['invoiceCustomerAccount','invoiceIsStaff','invoiceMotTestLine','invoiceLineWithMotVat','staffInvoiceLineAmount','staffInvoiceLineHtml','invoiceEditorLineValue','invoiceTotals','lineHtml','vehicleTaxInvoiceTitle','vehicleTaxInvoiceHeading','printInvoice','gatherInvoice','openInvoiceForJob'];
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
test('Staff customer memory survives cloud reloads where jobs lack customer_account',()=>{
 ctx.app.jobCustomerMemory={'cloud-staff':{customer_account:'Staff'},'cloud-nmuk':{customer_account:'NMUK'},'cloud-contractor':{customer_account:'CONTRACTOR'}};
 ctx.app.jobs.push({id:'cloud-staff',registration:'KO69WMF'});
 const inv={job_id:'cloud-staff',lines:[{description:'Tyres',amount:200,vat_mode:'inc_vat'}],subtotal:200/1.2,vat:200-200/1.2,total:200};
 assert.equal(ctx.invoiceIsStaff(inv),true);
 ctx.printInvoice(inv);assert.match(ctx.sheet.innerHTML,/Amount \(ex VAT\)/);assert.match(ctx.sheet.innerHTML,/£166.67/);assert.match(ctx.sheet.innerHTML,/<b>Total:<\/b><span>£200.00/);
 assert.equal(ctx.invoiceIsStaff({job_id:'cloud-nmuk'}),false);
 assert.equal(ctx.invoiceIsStaff({job_id:'cloud-contractor'}),false);
 assert.equal(ctx.invoiceIsStaff({...inv,fleet_customer:'NMUK'}),false);
 assert.equal(ctx.invoiceIsStaff({lines:[{invoice_customer_account:'STAFF'}]}),true);
});
test('only standalone MOT test fees are automatically No VAT',()=>{
 for(const description of ['MOT','MOT test','MOT test fee','MOT retest','MOT re-test','M.O.T. test','MOT test (Class 4)']){
  const line={description,amount:65,vat_mode:'inc_vat'};
  assert.equal(ctx.invoiceLineWithMotVat(line).vat_mode,'no_vat');
  assert.equal(ctx.invoiceLineWithMotVat(line).amount,65);
  assert.equal(line.vat_mode,'inc_vat','normalisation does not mutate source records');
 }
 for(const description of ['Pre MOT check','MOT preparation','MOT repairs','MOT test + Service','MOT test / MOT preparation.','Supply & fit rear coupling','MOT test booking administration'])assert.equal(ctx.invoiceMotTestLine({description}),false);
});
test('mixed Staff invoice corrects MOT VAT without exempting repair work',()=>{
 const inv={job_id:'cloud-staff',lines:[{description:'MOT test',amount:65,vat_mode:'inc_vat'},{description:'Supply & Fit Rear Prop shaft flexible coupling',amount:130,vat_mode:'inc_vat'}],subtotal:162.5,vat:32.5,total:195};
 ctx.printInvoice(inv);
 assert.match(ctx.sheet.innerHTML,/MOT test<\/td><td class="right">£65.00<\/td><td>No VAT/);
 assert.match(ctx.sheet.innerHTML,/£108.33<\/td><td>Ex VAT/);
 assert.match(ctx.sheet.innerHTML,/<b>VAT:<\/b><span>£21.67/);
 assert.match(ctx.sheet.innerHTML,/<b>Total:<\/b><span>£195.00/);
 assert.equal(inv.lines[0].vat_mode,'inc_vat','printing does not silently change saved data');
 assert.match(ctx.staffInvoiceLineHtml(inv.lines[0]),/value="65.00"/);
 assert.match(ctx.staffInvoiceLineHtml(inv.lines[0]),/value="no_vat" selected/);
});
test('MOT fee remains No VAT when editor dropdown is changed',()=>{
 const vat={value:'ex_vat'},input={value:'65',dataset:{displayAmount:'65.00',displayVat:'no_vat',originalAmount:'65',originalVat:'no_vat'}};
 const tr={dataset:{staffInvoice:'1'},querySelector:s=>s==='[data-line-amount]'?input:s==='[data-line-vat]'?vat:{value:'MOT test'}};
 const result=ctx.invoiceEditorLineValue(tr);assert.equal(result.amount,65);assert.equal(result.vat_mode,'no_vat');assert.equal(vat.value,'no_vat');
});
test('new mixed job invoice exempts only MOT and stores Staff evidence in JSON lines',()=>{
 const prior={...ctx};
 ctx.savedInvoiceForJobId=()=>null;ctx.uid=()=> 'new-invoice';ctx.privatePricingItemsFromNote=()=>[{description:'MOT test',price:65},{description:'Rear coupling',price:130}];ctx.nextInvoiceNumberText=()=> 'VECTA-TEST';ctx.todayIso=()=> '2026-10-07';ctx.openInvoice=(_id,inv)=>ctx.draft=inv;
 ctx.openInvoiceForJob('s');
 assert.equal(ctx.draft.lines[0].vat_mode,'no_vat');assert.equal(ctx.draft.lines[1].vat_mode,'inc_vat');
 const {document}=parseHTML('<html><body><div class="invoiceDetails" data-invoice-job-id="cloud-staff" data-invoice-customer-account="STAFF"></div><input id="inv_registration" value="KO69WMF"><input id="inv_invoice_date" value="2026-10-07"><table><tbody id="invoiceLines">'+ctx.draft.lines.map(ctx.staffInvoiceLineHtml).join('')+'</tbody></table></body></html>');
 // linkedom does not implement select.value; use the option the renderer selected.
 document.querySelectorAll('[data-line-vat]').forEach(el=>Object.defineProperty(el,'value',{writable:true,value:el.querySelector('option[selected]').getAttribute('value')}));
 ctx.document=document;ctx.app.invoices=[];
 const saved=ctx.gatherInvoice('new-invoice');
 assert.equal(saved.lines[0].invoice_customer_account,'STAFF');assert.equal(saved.lines[0].amount,65);assert.equal(saved.lines[0].vat_mode,'no_vat');assert.equal(saved.lines[1].amount,130);assert.equal(saved.total,195);
 const previousMemory=ctx.app.jobCustomerMemory,previousJobs=ctx.app.jobs;ctx.app.jobs=[];ctx.app.jobCustomerMemory={};
 assert.equal(ctx.invoiceIsStaff(JSON.parse(JSON.stringify(saved))),true,'persisted line snapshot works without loaded jobs or customer memory');
 ctx.app.jobs=previousJobs;ctx.app.jobCustomerMemory=previousMemory;ctx.document=prior.document;
});
