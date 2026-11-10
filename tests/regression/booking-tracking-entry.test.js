import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync('public/js/vecta-booking-tracking.js','utf8');
function controller(request){const context={window:{},fetch:request,AbortController,setTimeout,clearTimeout};vm.runInNewContext(source,context);let registration='H16 CKK',changes=[];const c=context.window.VectaBookingTracking.createController({request,getRegistration:()=>registration,onChange:x=>changes.push(x)});return {c,changes,setRegistration:r=>registration=r};}
const response=(registration='H16CKK',stage='underway',status=200)=>({ok:status===200,status,json:async()=>({registration,stage})});
test('confirmation HERE opens its signed booking receipt and never accepts an external destination',()=>{
 const html=fs.readFileSync('website/booking/index.html','utf8');
 const context={state:{form:{registration:'H16 CKK'}},encodeURIComponent};
 vm.runInNewContext(html.slice(html.indexOf('function bookingTrackingHref('),html.indexOf('function bookingReceiptActionsHtml(')),context);
 const path='/track#request.payload.'+'a'.repeat(43);assert.equal(context.bookingTrackingHref({tracking_url:path}),path);
 for(const tracking_url of [undefined,'https://evil.example/','/track#bad','javascript:alert(1)'])assert.equal(context.bookingTrackingHref({tracking_url}),'/track?reg=H16CKK');
});
test('only a successful exact same-day tracking result offers the link; errors never block booking',async()=>{
 for(const [r,expected] of [[response(),'booked'],[response('OTHER'),'unavailable'],[response('H16CKK','scheduled'),'unavailable'],[response('H16CKK','',404),'absent'],[response('H16CKK','',503),'unavailable']]){
  const f=controller(async(url,options)=>{assert.equal(url,'/api/job-progress');assert.equal(JSON.parse(options.body).registration,'H16CKK');assert.equal(options.cache,'no-store');return r;});
  await f.c.check('H16 CKK');assert.equal(f.c.current().status,expected);assert.equal(f.c.canAdvance(),expected!=='booked');
 }
 const f=controller(async()=>{throw Error('offline');});await f.c.check('H16CKK');assert.equal(f.c.current().status,'unavailable');assert.equal(f.c.canAdvance(),true);
});
test('late responses cannot attach a previous vehicle booking to a new registration',async()=>{
 let resolve;const f=controller(()=>new Promise(r=>resolve=r));const pending=f.c.check('H16CKK');f.setRegistration('AB12CDE');f.c.reset();resolve(response());await pending;assert.equal(f.c.current().status,'idle');assert.equal(f.c.canAdvance(),false);
});
test('repeated checks share the saved result and reset clears it',async()=>{
 let calls=0;const f=controller(async()=>{calls++;return response();});await f.c.check('H16CKK');await f.c.check('H16 CKK');assert.equal(calls,1);f.c.reset();assert.equal(f.c.current().status,'idle');await f.c.check('H16CKK');assert.equal(calls,2);
});
test('today booking panel is a safe registration-specific link beneath the vehicle details',()=>{
 const html=fs.readFileSync('website/booking/index.html','utf8');const {document}=parseHTML('<div id="todayTracking"></div>');
 const context={document,state:{form:{registration:'H16 CKK'}},todayTracking:{current:()=>({registration:'H16CKK',status:'booked'})},encodeURIComponent};
 vm.runInNewContext(html.slice(html.indexOf('function updateTodayTracking(){'),html.indexOf('const haynesLookup=')),context);context.updateTodayTracking();const link=document.querySelector('a');assert.equal(link.getAttribute('href'),'/track?reg=H16CKK');assert.equal(link.textContent,'We see your car is with us today.Click here to track its progress');assert.equal(document.getElementById('todayTracking').hidden,false);
 context.state.form.registration='AB12CDE';context.updateTodayTracking();assert.equal(document.querySelector('a'),null);assert.equal(document.getElementById('todayTracking').hidden,true);
 assert.match(html,/state.step===1&&valid\(\)&&todayTracking.canAdvance\(\)/);
 assert.match(html,/class="confirmation-tracking">Track your car on the day of your booking by clicking <a href="\$\{esc\(bookingTrackingHref\(d\)\)\}">HERE<\/a>\./);
 const index=fs.readFileSync('index.html','utf8');const email=index.slice(index.indexOf('async function openWebsiteBookingConfirmationEmail('),index.indexOf('async function openWebsiteBookingConfirmationEmail(')+2500);assert.doesNotMatch(email,/You can track the progress|revisiting VectaMotors/);assert.match(email,/VectaPortalWorkshop.confirmation/);
});
test('tracking links prefill and look up the registration without needing a second entry',async()=>{
 const {document}=parseHTML(fs.readFileSync('public/track.html','utf8'));document.hidden=false;let payload;
 const context={document,window:{addEventListener(){}},location:{hash:'',search:'?reg=H16CKK'},URLSearchParams,Intl,Date,AbortSignal,Error,setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({registration:'H16CKK',stage:'underway',title:'In the workshop',scene_state:'unavailable'})};}};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-progress.js','utf8'),context);await new Promise(r=>setImmediate(r));assert.equal(payload.registration,'H16CKK');assert.equal(payload.action,'registration');assert.equal(document.getElementById('registrationInput').value,'H16CKK');assert.equal(document.getElementById('registration').textContent,'H16CKK');assert.equal(document.getElementById('paperwork').hidden,true);
});
