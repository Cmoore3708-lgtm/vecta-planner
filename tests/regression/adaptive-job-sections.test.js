import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const script=readFileSync(new URL('../../public/js/haynes-job-tools.js',import.meta.url),'utf8');

test('the job editor fits the invoice below the calendar and returns it in order when the space disappears',()=>{
 const {document,window}=parseHTML(`<html><body><div id="modal"><div class="jobModalCard">
  <div class="jobModalHead"><h2>Job</h2></div>
  <div class="jobVehicleSection"><input id="job_registration"></div>
  <div class="jobCardSections">
   <section class="jobWorkSection"></section><section class="jobMotAdvisories"></section>
   <section class="jobBookingSection"><div class="bookingAvailabilityWorkspace"></div></section>
   <section class="jobFormSection"><div class="jobPartsEditor"></div></section>
   <section class="privatePricingSection"><textarea></textarea></section>
  </div></div></div></body></html>`);
 let frame,notifyResize,disconnected=false;
 const browser={
  MutationObserver:window.MutationObserver,
  ResizeObserver:class {
   constructor(callback){notifyResize=callback;}
   observe(){}
   disconnect(){disconnected=true;}
  },
  getComputedStyle:()=>({rowGap:'5px'}),
  requestAnimationFrame:callback=>{frame=callback;return 1;},
  cancelAnimationFrame:()=>{frame=null;}
 };
 vm.runInNewContext(script,{window:browser,document,setTimeout,clearTimeout});
 const modal=document.querySelector('#modal');
 browser.initHaynesJobTools(modal,{recoverImage:false});
 const find=selector=>modal.querySelector(selector);
 const main=find('.jobCardMainColumn'),aside=find('.jobCardSupportColumn');
 const invoice=find('.privatePricingSection'),field=invoice.querySelector('textarea');
 const parts=find('.jobPartsEditor').parentElement,advisories=find('.jobMotAdvisories');
 let calendarHeight=320,wide=true;
 main.getBoundingClientRect=()=>({left:0,right:510,width:510});
 aside.getBoundingClientRect=()=>({left:wide?520:0,width:510});
 find('.jobWorkSection').getBoundingClientRect=()=>({height:300});
 find('.bookingAvailabilityWorkspace').getBoundingClientRect=()=>({height:calendarHeight});
 advisories.getBoundingClientRect=()=>({height:60});
 parts.getBoundingClientRect=()=>({height:110});
 invoice.getBoundingClientRect=()=>({height:150});
 const layout=()=>{notifyResize();assert.ok(frame);const run=frame;frame=null;run();};
 layout();
 assert.ok(invoice.parentElement===aside,'invoice.parentElement should be aside');
 assert.ok(parts.parentElement===main,'parts.parentElement should be main');
 field.value='Front tyre replacement';
 Object.defineProperty(document,'activeElement',{configurable:true,value:field});
 calendarHeight=900;layout();
 assert.ok(invoice.parentElement===aside,'invoice.parentElement should be aside');
 Object.defineProperty(document,'activeElement',{configurable:true,value:null});
 field.dispatchEvent(new window.Event('focusout',{bubbles:true}));assert.ok(frame);layout();
 assert.ok(invoice.parentElement===main,'invoice.parentElement should be main');
 assert.ok(invoice.previousElementSibling===parts,'invoice.previousElementSibling should be parts');
 calendarHeight=320;layout();assert.ok(invoice.parentElement===aside,'invoice.parentElement should be aside');
 wide=false;layout();
 assert.ok(invoice.parentElement===main,'invoice.parentElement should be main');
 assert.ok(invoice.previousElementSibling===parts,'invoice.previousElementSibling should be parts');
 assert.ok(parts.previousElementSibling===advisories,'parts.previousElementSibling should be advisories');
 assert.ok(find('textarea')===field,'find("textarea") should be field');
 assert.equal(field.value,'Front tyre replacement');
 modal.replaceChildren();layout();
 assert.equal(disconnected,true);
});
