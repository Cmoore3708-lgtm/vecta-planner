import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('async function openWebsiteBookingConfirmationEmail('),html.indexOf('function isUnresolvedWebsiteService('));
function fixture(overrides={}){
 const {document}=parseHTML('<div id="jobModal"><section class="websiteJobRequestPanel"></section></div>');
 const job={id:'test-job',status:'booked',source:'website booking',customer_email:'test@example.invalid',booking_date:'2026-11-24',...overrides};
 const opened=[];
 const context={document,app:{jobs:[job]},window:{VectaPortalWorkshop:{confirmation:async saved=>opened.push(saved)}},isWebsiteBookingJob:j=>j.source==='website booking',vectaJobIsDeletedForLists:j=>!!j.deleted};
 vm.runInNewContext(source,context);
 const modal=document.getElementById('jobModal');
 const install=()=>context.installWebsiteBookingConfirmationButton(modal,job);
 return {document,modal,job,context,opened,install};
}
test('a confirmed booking can reopen its email repeatedly without saving or accepting the booking again',async()=>{
 const f=fixture(),before=JSON.stringify(f.job);f.install();f.install();
 const buttons=f.modal.querySelectorAll('[data-reopen-booking-confirmation]');assert.equal(buttons.length,1);
 await buttons[0].onclick();await buttons[0].onclick();
 assert.equal(f.opened.length,2);assert.equal(f.opened[0],f.job);assert.equal(JSON.stringify(f.job),before);
 assert.match(f.modal.textContent,/Confirmation preview opened/);
 const installer=html.slice(html.indexOf('function installDashboardJobActions('),html.indexOf('function openJobModal('));
 assert.match(installer,/installWebsiteBookingConfirmationButton\(modal,officeJob\)/);
});
test('provisional, deleted and non-website bookings and mechanics do not offer the confirmation action',()=>{
 for(const fields of [{status:'provisional'},{status:'quote'},{status:'cancelled'},{deleted:true},{source:'manual'}]){
  const f=fixture(fields);f.install();assert.equal(f.modal.querySelector('button'),null);
 }
 const f=fixture();f.context.window.VECTA_MECHANIC_DEPLOYMENT=true;f.install();assert.equal(f.modal.querySelector('button'),null);
 const draft=fixture();draft.context.installWebsiteBookingConfirmationButton(draft.modal,null);assert.equal(draft.modal.querySelector('button'),null);
});
test('reopening uses current saved details and reports a missing email or unavailable booking without changing it',async()=>{
 const f=fixture();f.install();const button=f.modal.querySelector('button');
 f.context.app.jobs=[{...f.job,booking_date:'2026-11-25'}];await button.onclick();assert.equal(f.opened[0].booking_date,'2026-11-25');
 f.context.app.jobs[0].customer_email='';await button.onclick();assert.match(f.modal.textContent,/Save a customer email address/);assert.equal(f.opened.length,1);
 f.context.app.jobs=[];await button.onclick();assert.match(f.modal.textContent,/no longer available/);assert.equal(button.disabled,false);
});
test('failed preview loading remains recoverable and repeated clicks cannot open duplicates in flight',async()=>{
 const f=fixture();let reject;f.context.window.VectaPortalWorkshop.confirmation=()=>new Promise((_,r)=>reject=r);f.install();
 const button=f.modal.querySelector('button'),pending=button.onclick();assert.equal(button.disabled,true);await button.onclick();
 reject(Error('Connection unavailable'));await pending;assert.match(f.modal.textContent,/Connection unavailable/);assert.equal(button.disabled,false);
 f.context.window.VectaPortalWorkshop.confirmation=async saved=>f.opened.push(saved);await button.onclick();assert.equal(f.opened.length,1);
});
