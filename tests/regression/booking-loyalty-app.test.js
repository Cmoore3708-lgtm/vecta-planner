import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('My Garage switches between booking bonus and earned balance, rejects unrelated frames and resets changed cars',async()=>{
 const {document,window:dom}=parseHTML(fs.readFileSync('public/app/home.html','utf8')),$=id=>document.getElementById(id),listeners={};
 const vehicle={id:'test-car',registration:'AB12CDE',vehicle_data:{vehicle:'Test car'}},origin='https://www.vectamotors.co.uk';
 $('modal').close=()=>{};$('bookingFrame').contentWindow={postMessage(){}};
 const scrolls=[],viewportListeners={},viewport={height:844,offsetTop:0,addEventListener:(name,fn)=>viewportListeners[name]=fn};
 const context={document,location:{origin},window:{scrollY:450,scrollTo:options=>scrolls.push(options),visualViewport:viewport,addEventListener:(n,fn)=>listeners[n]=fn},confirm:()=>true,navigator:{onLine:true,userAgent:'test',platform:'test'},matchMedia:()=>({matches:false}),localStorage:{getItem:()=> 'session',removeItem(){}},requestAnimationFrame:fn=>fn(),AbortSignal,setTimeout,clearTimeout,URL,URLSearchParams,fetch:async(url,options)=>{
  const {action}=JSON.parse(options.body);
  return {ok:true,json:async()=>action==='garage-status'?{email:'qa@example.invalid',vehicles:[vehicle],suggestions:[],profile:{name:'Alex'}}:action==='garage-rewards'?{active:true,starts_on:'2026-11-16',earned_bonus_pence:1250,paid_spend_pence:25000,payments:[],terms:'5%'}:action==='garage-booking-prefill'?{registration:vehicle.registration,profile:{name:'Alex',email:'qa@example.invalid'}}:{ok:true}};
 }};
 vm.runInNewContext(fs.readFileSync('public/app/garage.js','utf8'),context);await flush();
 const click=async selector=>{document.querySelector(selector).dispatchEvent(new dom.Event('click',{bubbles:true}));await flush();};
 const send=(data,extra={})=>listeners.message({origin,source:$('bookingFrame').contentWindow,data:{type:'vecta-booking-total',registration:vehicle.registration,pence:16000,pending:false,...data},...extra});
 assert.equal($('loyaltyAmount').textContent,'£12.50');
 await click('[data-tab="book"]');
 assert.equal(document.body.classList.contains('bookingActive'),true);assert.equal($('loyaltyBox').classList.contains('bookingBonusCompact'),true);
 assert.equal(document.body.style.getPropertyValue('--booking-viewport-height'),'844px');
 viewport.height=460;viewport.offsetTop=24;viewportListeners.resize();assert.equal(document.body.style.getPropertyValue('--booking-viewport-height'),'460px');assert.equal(document.body.style.getPropertyValue('--booking-viewport-top'),'24px');
 assert.equal($('loyaltyTitle').textContent,'Your booking bonus');assert.equal($('loyaltyAmount').textContent,'5%');
 send({});assert.equal($('loyaltyAmount').textContent,'£8.00');assert.match($('loyaltyNote').textContent,/You will earn £8.00 from this booking/);
 send({pence:999999},{origin:'https://wrong.invalid'});send({pence:999999},{source:{}});send({pence:999999,registration:'XY99ZZZ'});send({pence:-1});send({pence:NaN});
 assert.equal($('loyaltyAmount').textContent,'£8.00');
 send({pence:13000});assert.equal($('loyaltyAmount').textContent,'£6.50');
 send({pence:6500,pending:true});assert.match($('loyaltyNote').textContent,/Estimated bonus so far: £3.25/);assert.doesNotMatch($('loyaltyNote').textContent,/You will earn/);
 await click('[data-tab="garage"]');assert.equal(document.body.classList.contains('bookingActive'),false);assert.equal($('loyaltyBox').classList.contains('bookingBonusCompact'),false);assert.equal(scrolls.at(-1).top,450);assert.equal(document.body.style.getPropertyValue('--booking-viewport-height'),undefined);assert.equal($('loyaltyAmount').textContent,'£12.50');assert.equal($('loyaltyLabel').textContent,'bonus earned');
 await click('[data-tab="book"]');assert.equal($('loyaltyAmount').textContent,'£3.25');
 send({type:'vecta-booking-confirmed'});await flush();assert.equal($('loyaltyAmount').textContent,'£3.25','refresh after confirmation does not credit or overwrite prospective reward');
 $('bookingChange').onclick();assert.equal(document.body.classList.contains('bookingActive'),false);assert.equal($('loyaltyAmount').textContent,'£12.50');
 await click('[data-book="test-car"]');assert.equal($('loyaltyAmount').textContent,'5%','new booking must not reuse its previous price');
 $('signout').onclick({currentTarget:$('signout')});await flush();
 assert.equal(document.body.classList.contains('bookingActive'),false);assert.equal($('loyaltyTitle').textContent,'Your loyalty bonus');assert.equal($('loyaltyAmount').textContent,'5%');
 assert.doesNotMatch(document.body.textContent,/£12.50|£3.25/);
});

test('embedded price bridge sends only the registration and public price summary to its own origin',()=>{
 const sent=[],window={parent:{postMessage:(...args)=>sent.push(args)},location:{origin:'https://www.vectamotors.co.uk',search:'?app=1'}};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-garage-booking.js','utf8'),{window,URLSearchParams});
 window.VectaGarageBooking.updateTotal({registration:'AB12CDE',pence:16000,pending:['Tyres'],email:'private@example.invalid'});
 assert.equal(JSON.stringify(sent[0][0]),JSON.stringify({type:'vecta-booking-total',registration:'AB12CDE',pence:16000,pending:true}));
 assert.equal(sent[0][1],window.location.origin);
 window.location.search='';window.VectaGarageBooking.updateTotal({pence:20000,pending:[]});assert.equal(sent.length,1);
});
