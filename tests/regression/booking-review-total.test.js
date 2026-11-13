import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html=fs.readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
function browser(form={}) {
 const c=vm.createContext({state:{form:{job_types:['Service'],service_choice:'Oil & Filter Change',mini_valet:false,...form}},
  serviceEngineSize:()=>1600,serviceGuidePrices:()=>({oil:130,full:180,major:220}),
  liveServiceQuote:()=>null,serviceExtraAddedPence:()=>0,selectedTyreGuide:()=>null,savedTyreGuide:()=>null,
  servicePriceState:{status:'unavailable'},serviceExtraSelection:()=>'',serviceExtraOffer:()=>null,
  serviceVehicleHtml:()=>'',esc:s=>s});
 for(const name of ['fullServiceSelected','miniValetReviewHtml','bookingTotalContent','refreshBookingTotal','bindMiniValetReview','estimateCost','tyreMoney','serviceChoicePrice','serviceGuideFallback','pricingHtml']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);
  vm.runInContext(html.slice(start,end),c);
 }
 return c;
}
function amount(c){const {document}=parseHTML(c.bookingTotalContent());return document.querySelector('.booking-total-amount').textContent;}
function serviceReview(form={}){
 const c=browser({service_choice:'Full Service',registration:'FX69XWU',fuel_registration:'FX69XWU',fuel_type:'Diesel',service_extra_registration:'FX69XWU',service_extra_kind:'fuel_filter',service_extra_choice:'replace',...form});
 c.state.step=5;
 c.liveServiceQuote=()=>({totalPence:22000,serviceExtra:{kind:c.state.form.service_extra_kind,totalPence:11000}});
 Object.assign(c,{tyreReviewHtml:()=>'',customerPartsSummaryHtml:()=>'',seriousRepairChoiceHtml:()=>''});
 for(const name of ['serviceExtraKind','serviceExtraOffer','serviceExtraSelection','serviceExtraAddedPence','serviceExtraSummary','serviceExtraReviewHtml','stepHtml']){
  const start=html.indexOf('function '+name+'('),end=html.indexOf('\nfunction ',start+1);
  vm.runInContext(html.slice(start,end),c);
 }
 return c;
}

test('replacement price is included once and shown at the bottom of the service card',()=>{
 for(const [fuel,kind,label] of [['Diesel','fuel_filter','Fuel filter replacement'],['Petrol','spark_plug','Spark plug replacement']]){
  const c=serviceReview({fuel_type:fuel,service_extra_kind:kind});
  const {document}=parseHTML(c.stepHtml()),service=document.querySelector('.review-price'),extra=service.lastElementChild;
  assert.equal(extra.className,'review-service-extra');
  assert.match(extra.textContent,new RegExp(label));
  assert.equal(extra.querySelector('.review-service-extra-included').textContent,'Included');
  assert.match(extra.textContent,/£110 of your £330 service total, including fitting and VAT/);
  assert.doesNotMatch(extra.textContent,/Extra £/);
  assert.equal(service.querySelector('.guide-price-card strong').textContent,'£330');
  assert.equal(amount(c),'£330');
  assert.equal(c.estimateCost(),330);
  assert.equal(document.querySelectorAll('.review-service-extra').length,1);
 }
});

test('check-first and unavailable extras are never described as already included',()=>{
 const c=serviceReview({service_extra_choice:'check'});
 assert.doesNotMatch(c.serviceExtraReviewHtml(),/Included|of your/);
 assert.match(c.serviceExtraReviewHtml(),/check manufacturer’s guidance/);
 assert.equal(amount(c),'£220');
 c.state.form.service_extra_choice='replace';
 c.liveServiceQuote=()=>({totalPence:22000});
 assert.doesNotMatch(c.serviceExtraReviewHtml(),/Included|of your/);
 assert.match(c.serviceExtraReviewHtml(),/confirm the price before fitting/);
 assert.equal(amount(c),'£220');
 c.liveServiceQuote=()=>null;
 assert.doesNotMatch(c.serviceExtraReviewHtml(),/Included|of your/);
 c.state.form.service_extra_choice='none';
 assert.equal(c.serviceExtraReviewHtml(),'');
});

test('review combines £130 service and £30 valet without double-charging the submitted base estimate',()=>{
 const c=browser({mini_valet:true});
 assert.equal(amount(c),'£160');
 assert.equal(c.estimateCost(),130,'API adds the valet once to this base estimate');
 assert.match(c.bookingTotalContent(),/Booking total/);
 assert.match(c.bookingTotalContent(),/Including VAT/);
 c.state.form.mini_valet=false;assert.equal(amount(c),'£130');
});

test('renaming Oil & Filter Change to Interim Service never selects the Major guide price',()=>{
 const c=browser({mini_valet:true});
 const {document}=parseHTML(c.pricingHtml());
 assert.match(document.querySelector('small').textContent,/INTERIM SERVICE/);
 assert.equal(document.querySelector('strong').textContent,'£130');
 assert.equal(amount(c),'£160');
 assert.doesNotMatch(c.pricingHtml(),/£220/);
});

test('a newly returned tyre price refreshes the review total without reopening the page',()=>{
 const c=browser({job_types:['Service','Tyres']});
 c.document=parseHTML('<div data-booking-total></div>').document;
 c.refreshBookingTotal();
 assert.match(c.document.body.innerHTML||c.document.toString(),/Total so far/);
 c.selectedTyreGuide=()=>({totalPence:16000});
 c.refreshBookingTotal();
 assert.equal(c.document.querySelector('.booking-total-amount').textContent,'£290');
 assert.match(html,/refreshTyrePanel\(\);refreshBookingTotal\(\);renderActions\(\)/);
});

test('valet checkbox immediately updates the visible total on adding and removing',()=>{
 const c=browser();
 const {document}=parseHTML(c.miniValetReviewHtml()+'<div data-booking-total></div>');
 c.document=document;
 for(const el of document.querySelectorAll('*'))el.focus=()=>{};
 c.bindMiniValetReview();
 const check=document.querySelector('[data-mini-valet]');
 assert.equal(document.querySelector('.booking-total-amount').textContent,'£130');
 check.checked=true;check.onchange();
 assert.equal(document.querySelector('.booking-total-amount').textContent,'£160');
 check.checked=false;check.onchange();
 assert.equal(document.querySelector('.booking-total-amount').textContent,'£130');
});

test('review preserves combined MOT discount, service extras, tyre quantity and penny precision',()=>{
 const c=browser({job_types:['Service','MOT','Tyres'],mini_valet:true});
 c.liveServiceQuote=()=>({totalPence:13099});
 c.serviceExtraAddedPence=()=>3500;
 c.selectedTyreGuide=()=>({totalPence:16000});
 assert.equal(amount(c),'£415.99');
});

test('Full Service never adds a paid valet and MOT-only includes its selected valet',()=>{
 assert.equal(amount(browser({service_choice:'Full Service',mini_valet:true})),'£180');
 assert.equal(amount(browser({job_types:['MOT'],mini_valet:true})),'£95');
});

test('unknown repairs, missing service prices and unknown tyres cannot look like a complete or free booking',()=>{
 const c=browser({job_types:['Service','Tyres','Other'],tyre_size_unknown:true,mini_valet:true});
 c.serviceGuidePrices=()=>({individual:true});
 assert.equal(amount(c),'£30');
 assert.match(c.bookingTotalContent(),/Total so far/);
 assert.match(c.bookingTotalContent(),/Service and Tyres and Additional work price to be confirmed/);
 c.state.form.mini_valet=false;
 assert.equal(amount(c),'Price to be confirmed');
 assert.doesNotMatch(c.bookingTotalContent(),/£0/);
});

test('both booking entry points contain the same accessible total after the valet selection',()=>{
 assert.equal(fs.readFileSync(new URL('../../public/booking.html',import.meta.url),'utf8'),html);
 assert.match(html,/\$\{miniValetReviewHtml\(\)\}<div class="review-total" data-booking-total aria-live="polite" aria-atomic="true">\$\{bookingTotalContent\(\)\}/);
});
