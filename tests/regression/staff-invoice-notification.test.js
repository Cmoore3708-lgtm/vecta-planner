import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import gen from '@babel/generator';
import traverse from '@babel/traverse';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['invoiceCustomerContactPreference','invoiceCustomerNotification','reserveInvoiceMessageWindow','closeInvoiceMessageWindow','promptInvoiceCustomerNotification','saveInvoiceAndNotify'];
function setup(){
 const {document}=parseHTML('<html><body><div id="invoiceModal"></div></body></html>');
 const events=[],tab={closed:false,document:{body:{}},location:{replace:url=>events.push(['navigate',url])},close(){this.closed=true;events.push(['close'])}};
 const inv={id:'i',job_id:'j',total:175,customer_phone:'07700123456',customer_email:'customer@example.com'};
 const ctx={document,console,app:{jobs:[{id:'j',customer_account:'Staff',customer_note:'Contact preference: Email || Other: detail'}],customers:[],websiteRequests:[],invoices:[]},invoiceNotificationSaves:{},invoiceCustomerAccount:()=> 'STAFF',vehicleTaxInvoiceTitle:()=>'',invoiceEmailRecipient:i=>({email:i.customer_email,name:'Jane Smith'}),fleetInvoiceFormatRegistration:()=> 'AB12 CDE',esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),closeModals:()=>document.getElementById('invoiceModal').classList.remove('open'),window:{open:()=>{events.push(['open']);return tab}},gatherInvoice:()=>inv,saveInvoice:async()=>{events.push(['save']);ctx.app.invoices=[inv];return true},createInvoiceCustomerLink:async()=>{events.push(['link']);return 'https://workshop.example/invoice?token=secure'}};
 vm.createContext(ctx);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const ast=parse(match[1],{sourceType:'script'});(traverse.default||traverse)(ast,{FunctionDeclaration(path){if(names.includes(path.node.id.name))vm.runInContext((gen.default||gen)(path.node).code,ctx)}});
 }
 return {ctx,events,tab,inv};
}
test('selected Email overrides available WhatsApp; exact message contains gross total and signed link',()=>{
 const {ctx,inv}=setup(),url='https://workshop.example/invoice?token=secure',n=ctx.invoiceCustomerNotification(inv,url);
 assert.equal(n.channel,'email');assert.equal(n.preferredUrl,n.email);
 assert.equal(new URL(n.email).searchParams.get('body'),'Hi Jane,\n\nWe have completed the work on your car. The total price is £175.00. You can view your invoice here '+url+'. We will send you a payment link shortly. Thank you for your custom.');
 ctx.app.jobs[0].customer_note='Contact preference: WhatsApp';const w=ctx.invoiceCustomerNotification(inv,url);assert.equal(w.preferredUrl,w.whatsapp);assert.equal(new URL(w.whatsapp).pathname,'/447700123456');
});
test('reserve on click before asynchronous save; open only with confirmed invoice and PDF link; repeat saves supported',async()=>{
 const {ctx,events}=setup();assert.equal(await ctx.saveInvoiceAndNotify('i'),true);assert.deepEqual(events.map(e=>e[0]),['open','save','link','navigate']);assert.match(events[3][1],/^mailto:/);
 events.length=0;assert.equal(await ctx.saveInvoiceAndNotify('i'),true);assert.deepEqual(events.map(e=>e[0]),['open','save','link','navigate']);
});
test('failed save closes reserved window and never issues invoice link or message',async()=>{
 const {ctx,events,tab}=setup();ctx.saveInvoice=async()=>false;assert.equal(await ctx.saveInvoiceAndNotify('i'),false);assert.equal(tab.closed,true);assert.deepEqual(events.map(e=>e[0]),['open','close']);
});
test('failed PDF leaves saved invoice intact and offers retry without resaving',async()=>{
 const {ctx,events,tab}=setup();ctx.createInvoiceCustomerLink=async()=>{throw Error('Unavailable')};await ctx.saveInvoiceAndNotify('i');assert.equal(ctx.app.invoices.length,1);assert.equal(tab.closed,true);assert.ok(ctx.document.getElementById('retryInvoiceLink'));assert.ok(!events.some(e=>e[0]==='navigate'));
});
test('blocked popup retains ready message with direct email/WhatsApp links',async()=>{
 const {ctx}=setup();ctx.window.open=()=>null;await ctx.saveInvoiceAndNotify('i');assert.ok(ctx.document.querySelector('a[href^="mailto:"]'));assert.match(ctx.document.getElementById('invoiceModal').textContent,/£175.00/);
});
test('missing preferred contact does not silently use another channel; double-click saves only once',async()=>{
 const {ctx,inv,events}=setup();inv.customer_email='';assert.equal(ctx.invoiceCustomerNotification(inv).preferredUrl,'');
 let resolve;ctx.saveInvoice=()=>new Promise(r=>{resolve=r});const first=ctx.saveInvoiceAndNotify('i');assert.equal(await ctx.saveInvoiceAndNotify('i'),false);ctx.app.invoices=[inv];resolve(true);await first;assert.ok(!events.some(e=>e[0]==='navigate'));
});
