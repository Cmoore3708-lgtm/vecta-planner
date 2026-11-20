import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import gen from '@babel/generator';
import traverse from '@babel/traverse';
import {parseHTML} from 'linkedom';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=['invoiceCustomerNotification','reserveInvoiceMessageWindow','closeInvoiceMessageWindow','promptInvoiceCustomerNotification','saveInvoiceAndNotify'];
function setup(navigator={userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:0}){
 const {document}=parseHTML('<html><body><div id="invoiceModal"></div></body></html>');
 const events=[],tab={closed:false,document:{body:{}},location:{replace:url=>events.push(['navigate',url])},close(){this.closed=true;events.push(['close'])}};
 const inv={id:'i',job_id:'j',total:175,customer_phone:'07700123456',customer_email:'customer@example.com'};
 const ctx={navigator,document,console,URL,AbortSignal,render(){},financialSection:'main',view:'planner',app:{jobs:[{id:'j',customer_account:'Staff',customer_note:'Contact preference: Email || Other: detail'}],customers:[],websiteRequests:[],invoices:[]},invoiceNotificationSaves:{},invoiceCustomerAccount:()=> 'STAFF',vehicleTaxInvoiceTitle:()=>'',invoiceEmailRecipient:i=>({email:i.customer_email,name:'Jane Smith'}),fleetInvoiceFormatRegistration:()=> 'AB12 CDE',esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'),closeModals:()=>document.getElementById('invoiceModal').classList.remove('open'),window:{open:()=>{events.push(['open']);return tab}},gatherInvoice:()=>inv,saveInvoice:async()=>{events.push(['save']);ctx.app.invoices=[inv];return true},createInvoiceCustomerLink:async()=>{events.push(['link']);return 'https://workshop.example/invoice?token=secure'}};
 vm.createContext(ctx);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const ast=parse(match[1],{sourceType:'script'});(traverse.default||traverse)(ast,{FunctionDeclaration(path){if(names.includes(path.node.id.name))vm.runInContext((gen.default||gen)(path.node).code,ctx)}});
 }
 return {ctx,events,tab,inv};
}
test('Staff Save & Message uses WhatsApp even with an older Email preference; includes gross total and signed link',()=>{
 const {ctx,inv}=setup(),url='https://workshop.example/invoice?token=secure',n=ctx.invoiceCustomerNotification(inv,url);
 assert.equal(n.channel,'whatsapp');assert.equal(n.preferredUrl,n.whatsapp);
 assert.equal(new URL(n.email).searchParams.get('body'),'Hi Jane,\n\nWe have completed the work on your car. The total price is £175.00.\n\nYou can view your invoice here:\n'+url+'\n\nWe will send a payment link from BeePaid via text message shortly… Thank you for your custom.');
 ctx.app.jobs[0].customer_note='Contact preference: WhatsApp';const w=ctx.invoiceCustomerNotification(inv,url);assert.equal(w.preferredUrl,w.whatsapp);assert.equal(new URL(w.whatsapp).hostname,'web.whatsapp.com');assert.equal(new URL(w.whatsapp).pathname,'/send');assert.equal(new URL(w.whatsapp).searchParams.get('phone'),'447700123456');
});
test('reserve on click before asynchronous save; open only with confirmed invoice and PDF link; repeat saves supported',async()=>{
 const {ctx,events,inv}=setup();inv.customer_email='';assert.equal(await ctx.saveInvoiceAndNotify('i'),true);assert.equal(ctx.view,'invoices');assert.equal(ctx.financialSection,'invoiceList');assert.deepEqual(events.map(e=>e[0]),['open','save','link','navigate']);assert.match(events[3][1],/^https:\/\/web\.whatsapp\.com\/send\?phone=447700123456&text=/);assert.match(new URL(events[3][1]).searchParams.get('text'),/https:\/\/workshop.example\/invoice\?token=secure/);
 assert.equal(ctx.document.getElementById('invoiceModal').classList.contains('open'),false,'Returning from WhatsApp should reveal the invoice list');
 events.length=0;assert.equal(await ctx.saveInvoiceAndNotify('i'),true);assert.equal(ctx.view,'invoices');assert.equal(ctx.financialSection,'invoiceList');assert.deepEqual(events.map(e=>e[0]),['open','save','link','navigate']);
});
test('desktop invoices use WhatsApp Web; phone and iPad invoices retain the app link and identical message',()=>{
 const invoiceUrl='https://workshop.example/invoice?token=secure&view=pdf',cases=[
  ['Windows touchscreen',{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:10},false],
  ['Mac',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',platform:'MacIntel',maxTouchPoints:0},false],
  ['iPhone',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},true],
  ['Android',{userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 8)'},true],
  ['iPad desktop mode',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel',maxTouchPoints:5},true]
 ];
 for(const [name,device,mobile] of cases){
  const {ctx,inv}=setup(device);ctx.window.innerWidth=390;
  const notice=ctx.invoiceCustomerNotification(inv,invoiceUrl),url=new URL(notice.preferredUrl);
  assert.equal(url.hostname,mobile?'wa.me':'web.whatsapp.com',name);
  assert.equal(mobile?url.pathname.slice(1):url.searchParams.get('phone'),'447700123456',name);
  assert.equal(url.searchParams.get('text'),notice.body,name);assert.ok(notice.body.includes(invoiceUrl),name);
  assert.equal(notice.whatsappLabel,mobile?'WhatsApp':'WhatsApp Web',name);
 }
});
test('invoice preparation logs the same Web URL used by the reserved tab and fallback button once',async()=>{
 const {ctx,events}=setup(),records=[];ctx.window.vectaMessages={fromUrl:(url,context)=>records.push({url,context})};
 await ctx.saveInvoiceAndNotify('i');
 assert.equal(records.length,1);assert.equal(records[0].url,events.find(e=>e[0]==='navigate')[1]);
 assert.equal(records[0].context.invoice_id,'i');assert.equal(records[0].context.job_id,'j');assert.equal(records[0].context.kind,'invoice');
 const automaticUrl=records[0].url;
 records.length=0;
 ctx.window.open=()=>null;
 await ctx.saveInvoiceAndNotify('i');
 const link=ctx.document.querySelector('a[href^="https://web.whatsapp.com/send?"]');
 assert.equal(link.getAttribute('href'),automaticUrl);
 link.click();assert.equal(records.length,1);assert.equal(records[0].url,automaticUrl);
});
test('failed save closes reserved window and never issues invoice link or message',async()=>{
 const {ctx,events,tab}=setup();ctx.saveInvoice=async()=>false;assert.equal(await ctx.saveInvoiceAndNotify('i'),false);assert.equal(tab.closed,true);assert.deepEqual(events.map(e=>e[0]),['open','close']);
});
test('failed PDF leaves saved invoice intact and offers retry without resaving',async()=>{
 const {ctx,events,tab}=setup();ctx.createInvoiceCustomerLink=async()=>{throw Error('Unavailable')};await ctx.saveInvoiceAndNotify('i');assert.equal(ctx.app.invoices.length,1);assert.equal(tab.closed,true);assert.ok(ctx.document.getElementById('retryInvoiceLink'));assert.ok(!events.some(e=>e[0]==='navigate'));
});
test('blocked popup retains ready message with direct email/WhatsApp links',async()=>{
 const {ctx}=setup();ctx.window.open=()=>null;await ctx.saveInvoiceAndNotify('i');assert.ok(ctx.document.querySelector('a[href^="mailto:"]'));const link=ctx.document.querySelector('a[href^="https://web.whatsapp.com/send?"]');assert.ok(link);assert.equal(link.textContent,'Open WhatsApp Web');assert.equal(link.target,'_blank');assert.equal(new URL(link.href).searchParams.get('phone'),'447700123456');assert.match(ctx.document.getElementById('invoiceModal').textContent,/£175.00/);
});
test('missing mobile leaves invoice open without saving or falling back to email',async()=>{
 const {ctx,inv,events}=setup();inv.customer_phone='0191 1234567';assert.equal(ctx.invoiceCustomerNotification(inv).preferredUrl,'');
 const modal=ctx.document.getElementById('invoiceModal');modal.innerHTML='<input id="inv_customer_phone">';modal.classList.add('open');const editor=modal.firstElementChild,alerts=[];ctx.alert=message=>alerts.push(message);
 assert.equal(await ctx.saveInvoiceAndNotify('i'),false);assert.deepEqual(events,[]);assert.equal(ctx.app.invoices.length,0);assert.equal(modal.firstElementChild,editor);assert.equal(modal.classList.contains('open'),true);assert.match(alerts[0],/mobile number/);
});
test('double-click saves and prepares WhatsApp only once',async()=>{
 const {ctx,inv,events}=setup();let resolve;ctx.saveInvoice=()=>new Promise(r=>{resolve=r});const first=ctx.saveInvoiceAndNotify('i');assert.equal(await ctx.saveInvoiceAndNotify('i'),false);ctx.app.invoices=[inv];resolve(true);await first;assert.deepEqual(events.map(e=>e[0]),['open','link','navigate']);
});
test('NMUK Internal and Pool notifications remain email only',()=>{
 const {ctx,inv}=setup();ctx.invoiceCustomerAccount=()=> 'NMUK';
 for(const subtype of ['Internal','Pool']){ctx.app.jobs[0].nmuk_vehicle_type=subtype;const notice=ctx.invoiceCustomerNotification(inv,'https://workshop.example/invoice?token=secure');assert.equal(notice.channel,'email');assert.equal(notice.preferredUrl,notice.email);assert.equal(notice.whatsapp,'');}
});


test('message links go directly to the signed invoice and reject external redirects', async()=>{
 const {ctx,inv}=setup();vm.runInContext(html.match(/async function createInvoiceCustomerLink\(inv\)\{[\s\S]*?\n\}/)[0],ctx);ctx.window.location={host:'workshop.example'};
 ctx.fetch=async(url,options)=>{assert.equal(JSON.parse(options.body).shorten,undefined);assert.equal(JSON.parse(options.body).compact,true);return {ok:true,json:async()=>({url:'https://workshop.example/i/abcdefghijklmnopqrstuvwx'})}};
 assert.equal(await ctx.createInvoiceCustomerLink(inv),'https://workshop.example/i/abcdefghijklmnopqrstuvwx');
 for(const url of ['https://tinyurl.com/test123','https://attacker.example/invoice?token=secure','https://workshop.example/invoice','https://user@workshop.example/invoice?token=secure']){
  ctx.fetch=async()=>({ok:true,json:async()=>({url})});await assert.rejects(ctx.createInvoiceCustomerLink(inv),/Unexpected invoice address/);
 }
});
