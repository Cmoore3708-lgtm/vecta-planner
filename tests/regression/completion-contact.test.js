import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../../public/js/vecta-completion-contact.js';
const rules=globalThis.VectaCompletionContact;
const finished={id:'job',customer_account:'Staff',customer_name:'Chris Moore',registration:'AB12 CDE',status:'ready_to_invoice',customer_email:'job@example.test',customer_phone:'07700 900123',work_required:'PRIVATE WORKSHOP NOTES',amount_quoted:999};
const previous={...finished,status:'booked'};
test('first ready or completion creates a draft, later finish-stage transitions and edits do not',()=>{assert.equal(rules.shouldNotify(finished,previous),true);assert.equal(rules.shouldNotify({...finished,status:'completed'},previous),true);assert.equal(rules.shouldNotify({...finished,status:'completed'},finished),false);assert.equal(rules.shouldNotify(finished,finished),false);assert.equal(rules.shouldNotify(finished,{...previous,status:'work_complete'}),true);assert.equal(rules.shouldNotify({...finished,status:'work_complete'},previous),false)});
test('quotes, admin/tax work and mini tasks do not open owner messages',()=>{for(const extra of [{status:'quote'},{no_vehicle:true},{registration:''},{mini_task:true},{card_type:'mini_task'},{job_type:'Vehicle Tax'}])assert.equal(rules.shouldNotify({...finished,...extra},previous),false)});
test('current Fleet contact wins conflicting job and customer emails; multiple recipients are preserved',()=>{const plan=rules.plan({...finished,customer_phone:''},previous,{email:'current@example.test, SECOND@example.test',invoiceTotal:999},{email:'customer@example.test'});assert.equal(plan.recipient,'current@example.test,SECOND@example.test');assert.match(plan.url,/^mailto:/);assert.match(decodeURIComponent(plan.url),/AB12 CDE/);assert.doesNotMatch(decodeURIComponent(plan.url),/PRIVATE WORKSHOP NOTES/);});
test('Staff prefers WhatsApp and uses email when no usable phone exists',()=>{assert.equal(rules.plan(finished,previous,{invoiceTotal:999},{}).channel,'whatsapp');assert.equal(rules.plan({...finished,customer_phone:''},previous,{invoiceTotal:999},{}).recipient,'job@example.test');assert.equal(rules.plan({...finished,customer_email:'',customer_phone:''},previous,{invoiceTotal:999}, {email:'customer@example.test'}).channel,'email');const plan=rules.plan({...finished,customer_email:'not an address'},previous,{invoiceTotal:999},{});assert.equal(plan.channel,'whatsapp');assert.match(plan.url,/^https:\/\/wa.me\/447700900123\?text=/)});
test('UK and explicit international phone formats normalise safely',()=>{for(const number of ['07700 900123','+44 7700 900123','00447700900123','447700900123','+44 (0)7700 900123']){assert.equal(rules.phone(number),'447700900123')}assert.equal(rules.phone('+353 87 1234567'),'353871234567');for(const number of ['1234','7700900123','07700 900123 ext 4','+00000000','bad'])assert.equal(rules.phone(number),'')});
test('no usable owner contact yields a missing-details notice',()=>{assert.equal(rules.plan({...finished,customer_email:'',customer_phone:''},previous,{invoiceTotal:999},{}).channel,'missing')});
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
test('notification happens after confirmed save, skips historical entries, and failures cannot fail the job save',()=>{assert.match(html,/if\(savedResult===true&&!historicalEntry\)/);assert.match(html,/try\{if\(window.VectaCompletionContact.shouldNotify\(j,savedJobBeforeEdit\)\)openJobCompletionContact/);assert.match(html,/else if\(firstWebsiteConfirmation\)openWebsiteBookingConfirmationEmail/);assert.ok(html.indexOf('if(savedResult===false)')<html.indexOf('if(savedResult===true&&!historicalEntry)'))});
test('app handoff has a durable clickable fallback and never sends messages automatically',()=>{assert.match(html,/link.href=plan.url/);assert.match(html,/window.open\(plan.url,'_blank','noopener,noreferrer'\)/);assert.match(html,/Click Send in/);assert.doesNotMatch(fs.readFileSync(new URL('../../public/js/vecta-completion-contact.js',import.meta.url),'utf8'),/fetch\(|supabase|sendMail/)});

 test('Staff wording uses first name and invoice total including VAT',()=>{
 const plan=rules.plan(finished,previous,{invoiceTotal:1198.8},{});
 assert.match(decodeURIComponent(plan.url),/Hi Chris\.\n\nThe work on your car AB12 CDE is complete\. The total price is £1198.80\. I will send you a payment link shortly\./);
 });
 test('contractors never receive completion drafts',()=>{for(const account of ['CONTRACTOR','OWBEN','E4 ELECTRICAL'])assert.equal(rules.plan({...finished,customer_account:account},previous,{email:'fleet@example.test',invoiceTotal:10},{}),null)});
 test('NMUK Internal and Pool use email only and their collection wording',()=>{
 for(const subtype of ['Internal','Pool']){
 const job={...finished,customer_account:'NMUK',nmuk_vehicle_type:subtype};
 const plan=rules.plan(job,previous,{email:'fleet@example.test',name:'Jane Smith'},{});
 assert.equal(plan.channel,'email');assert.match(decodeURIComponent(plan.url),/Hi Jane\./);assert.match(decodeURIComponent(plan.url),/ready to collect from our workshop/);assert.doesNotMatch(decodeURIComponent(plan.url),/total price|payment link/);
 assert.equal(rules.plan({...job,customer_email:''},previous,{phone:'07700900123'},{}),null);
 }
 assert.equal(rules.plan({...finished,customer_account:'NMUK',nmuk_vehicle_type:'MVOS'},previous,{email:'fleet@example.test'},{}),null);
 });
 test('invoice preview and completion message share the same invoice line calculation',()=>{
 assert.match(html,/var invoiceLines=vectaInvoiceLinesForJob\(j\)/);
 assert.match(html,/invoiceTotals\(vectaInvoiceLinesForJob\(job\)\)\.total/);
 });
