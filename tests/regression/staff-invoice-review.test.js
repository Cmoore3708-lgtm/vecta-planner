import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import gen from '@babel/generator';
import traverse from '@babel/traverse';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const functions=new Map();
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  const ast=parse(match[1],{sourceType:'script'});
  (traverse.default||traverse)(ast,{FunctionDeclaration(path){
    if(['openInvoiceForJob','openInvoice'].includes(path.node.id.name))functions.set(path.node.id.name,(gen.default||gen)(path.node).code);
  }});
}
const readyStart=html.indexOf("var readyButton=document.getElementById('markReady');");
assert.ok(readyStart>0);
const readyBindings=html.slice(readyStart,html.indexOf('var serviceButton=',readyStart));

function setup(){
  const {document}=parseHTML('<html><body><div id="jobModal" class="open"><button id="markReady">Ready to invoice</button><button id="createInvoiceFromJob">Create invoice</button><input id="job_status" value="work_complete"></div><div id="invoiceModal"></div></body></html>');
  const events=[],job={id:'job',status:'work_complete',customer_account:'Staff',customer_name:'Jane Smith',customer_phone:'07700123456',customer_email:'',registration:'AB12 CDE',vehicle:'Nissan Qashqai',amount_quoted:175};
  const c={document,console,window:{},j:job,id:job.id,app:{jobs:[job],invoices:[],settings:{nextInvoiceNumber:42}},
    alert:message=>events.push(['alert',message]),uid:()=> 'invoice',todayIso:()=> '2026-11-11',nextInvoiceNumberText:()=> 'VECTA-00042',
    savedInvoiceForJobId:()=>c.app.invoices[0],privatePricingItemsForJob:()=>[],invoiceLineWithMotVat:line=>line,invoiceDescriptionText:()=> 'Full service',invoiceJobTypeLabel:()=> 'Service',
    invoiceIsStaff:()=>true,invoiceMotTestLine:()=>false,jobVehicleDueData:()=>({}),knownRegistrationDetails:()=>({}),latestServiceMileage:()=>'',currentJobMileageUnknown:()=>false,confirmedJobMileage:()=> '12345',fleetInvoiceJobDate:()=> '2026-11-11',
    fleetNmukInvoiceChargesDraft:inv=>inv,fleetInvoiceCustomerProfile:()=>({}),invoiceSenderHtml:()=>'',vehicleTaxInvoiceHeading:()=>'',invoiceCustomerAccount:()=> 'STAFF',
    esc:value=>String(value??''),fieldInv:(label,key,value)=>'<input id="inv_'+key+'" value="'+String(value||'')+'">',invoicePlate:reg=>reg,niceDate:value=>value,
    staffInvoiceLineHtml:line=>'<tr><td>'+line.description+'</td></tr>',invoicePaymentMethodOptions:()=>'',bindInvoiceFields(){},calcInvoice(){},invoiceCustomerNotification:()=>({channel:'whatsapp'}),
    gatherJob:()=>({...job}),vectaCheckInvoiceActionAgainstCloud:async()=>true,
    saveJob:async()=>{events.push(['save-job']);job.status=document.getElementById('job_status').value;return true;},
    saveInvoice:async id=>{events.push(['save-invoice',id]);return true;},saveInvoiceAndNotify:async id=>{events.push(['save-message',id]);return true;},
    closeModals:()=>document.querySelectorAll('.open').forEach(el=>el.classList.remove('open')),
    vectaSendReadyInvoice:async()=>events.push(['email']),vectaProgressRequest:async()=>events.push(['progress-request'])
  };
  vm.createContext(c);vm.runInContext([...functions.values()].join('\n')+'\n'+readyBindings,c);
  return {c,events,job,document};
}

for(const button of ['markReady','createInvoiceFromJob'])test(button+' opens an editable staff invoice without saving or emailing, even without an email address',async()=>{
  const {c,events,job,document}=setup();
  await document.getElementById(button).onclick();
  assert.equal(document.getElementById('invoiceModal').classList.contains('open'),true);
  assert.ok(document.getElementById('invoiceLines'));
  assert.deepEqual(events,button==='markReady'?[['save-job']]:[]);
  assert.equal(c.app.invoices.length,0);assert.equal(c.app.settings.nextInvoiceNumber,42);assert.notEqual(job.archived,true);
  await Promise.resolve();assert.ok(document.getElementById('saveInvoice'));
});

test('Save only saves; Save & Message is a separate explicit action',async()=>{
  const {c,events,document}=setup();c.openInvoiceForJob('job');
  await document.getElementById('saveInvoice').onclick();assert.deepEqual(events,[['save-invoice','invoice']]);
  events.length=0;await document.getElementById('notifyInvoiceCustomer').onclick();assert.deepEqual(events,[['save-message','invoice']]);
});

test('opening an existing staff invoice leaves it unchanged until a save action',()=>{
  const {c,events,document}=setup();const inv={id:'saved',job_id:'job',invoice_number:'VECTA-00041',mileage:'12345',mot_due:'2027-01-01',status:'saved',lines:[{description:'Full service',amount:175,vat_mode:'inc_vat'}]};
  c.app.invoices=[inv];const before=JSON.stringify(inv);c.openInvoice('saved');
  assert.equal(JSON.stringify(inv),before);assert.deepEqual(events,[]);assert.ok(document.getElementById('invoiceLines'));
});

test('a failed job save or stale cloud check does not open an invoice',async()=>{
  const {c,events,document}=setup();c.saveJob=async()=>false;
  await document.getElementById('markReady').onclick();assert.equal(document.getElementById('invoiceModal').classList.contains('open'),false);
  c.vectaCheckInvoiceActionAgainstCloud=async()=>false;
  await document.getElementById('createInvoiceFromJob').onclick();assert.equal(document.getElementById('invoiceModal').classList.contains('open'),false);assert.deepEqual(events,[]);
});
