import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {confirmationContent,confirmationPreviewHtml} from '../../lib/portal-email.js';
const job={id:'11111111-1111-4111-8111-111111111111',registration:'TEST001',vehicle:'Peugeot 208',booking_date:'2026-11-24',amount_quoted:120,work_required:'Full service'};
const link='https://www.vectamotors.co.uk/track#test';
test('Android bookings get three Android guide pictures, including after a portal preference edit',()=>{
 const preferences={version:1,parts:'budget',serious_repairs:'change_parts',booking_phone:'android'};
 const note=globalThis.VectaBookingRules.customerPreferencesNote({customer_preferences:preferences});
 const updated='[[VECTA_PORTAL_PREFERENCES:'+JSON.stringify({...preferences,booking_phone:undefined,parts:'oem'})+']]';
 const {html,text}=confirmationContent({...job,customer_note:note+updated},link);
 const {document}=parseHTML(html);
 const images=[...document.querySelectorAll('img[src*="app-install"]')].map(i=>i.getAttribute('src').split('/').pop());
 assert.deepEqual(images,['android-home.jpg','android.jpg','android-bonus.jpg']);
 assert.match(text,/android-bonus\.jpg/);assert.doesNotMatch(text,/iphone-bonus\.jpg/);
 assert.ok(document.querySelector('a[href*="install-app?phone=iphone#test"]'));
});
test('confirmation uses the approved white header and edits both email alternatives without changing the job or links',()=>{
 const original=structuredClone(job),edits={heading:'Your booking with Chris',work:'Full service\nPlease check the rear tyres.',cost:'Estimated cost: £150 including VAT',parking:'Leave the keys with Chris.',signoff:'See you on Tuesday',portal_button:'OPEN MY BOOKING'};
 const content=confirmationContent(job,link,'aW1hZ2U=',edits),{document}=parseHTML(content.html);
 assert.deepEqual(job,original);
 for(const [key,text]of Object.entries(edits)){
  const field=document.querySelector(`[data-confirmation-field="${key}"]`);for(const br of field.querySelectorAll('br'))br.replaceWith('\n');
  assert.equal(field.textContent,text);assert.ok(content.text.includes(text));
 }
 assert.equal(document.querySelector('img').parentElement.getAttribute('bgcolor'),'#ffffff');
 assert.deepEqual(Buffer.from(content.attachments.find(a=>a.content_id==='booking-logo').content,'base64'),readFileSync('public/assets/vecta-reminder-logo-white.png'));
 assert.equal(document.querySelector('[data-confirmation-field="portal_button"]').getAttribute('href'),link);
 assert.match(document.querySelector('[data-confirmation-field="directions_link"]').getAttribute('href'),/waypoints=54\.9111134/);
 assert.match(content.html,/cid:booking-vehicle/);
 assert.doesNotMatch(content.html,/contenteditable|role="textbox"/);
});
test('plain text edits cannot add executable HTML, change recipients or exceed the limits',()=>{
 const content=confirmationContent(job,link,null,{work:'<img src=x onerror=alert(1)> & repair',parking:''});
 const {document}=parseHTML(content.html);assert.equal(document.querySelector('[data-confirmation-field="work"]').textContent,'<img src=x onerror=alert(1)> & repair');assert.deepEqual([...document.querySelectorAll('img')].map(img=>img.getAttribute('src')),['cid:booking-logo',...['iphone-home','iphone','iphone-bonus'].map(name=>'https://www.vectamotors.co.uk/assets/app-install/'+name+'.jpg'),'https://www.vectamotors.co.uk/assets/vecta-workshop-exterior-email.jpg']);
 assert.equal(document.querySelector('[data-confirmation-field="parking"]').textContent,'');
 for(const edits of [{to:'elsewhere@example.invalid'},{work:'x'.repeat(5001)},[],{work:null},JSON.parse('{"__proto__":"bad"}')])assert.throws(()=>confirmationContent(job,link,null,edits),e=>e.status===400);
});
test('click-to-edit sends the latest text, retains multiline edits, locks the submitted draft and refreshes Messages',async()=>{
 const {document}=parseHTML('<html><body></body></html>'),create=document.createElement.bind(document);
 let editor;
 document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>{};el.close=()=>el.remove();}if(tag==='iframe'){
  Object.defineProperty(el,'srcdoc',{set(html){editor=parseHTML(html).document;Object.defineProperty(el,'contentDocument',{value:editor,configurable:true});el.dispatchEvent(new document.defaultView.Event('load'));}});
 }return el;};
 const requests=[],events=[],window={dispatchEvent:event=>events.push(event.type)};
 vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{document,window,location:{search:''},URLSearchParams,AbortSignal,Event,fetch:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  return Response.json(body.action==='confirmation-preview'?{editable:true,email:'driver@example.invalid',status:'unsent',html:confirmationPreviewHtml(confirmationContent(job,link))}:{accepted:true});
 }});
 await window.VectaPortalWorkshop.confirmation(job);
 assert.equal(document.querySelector('iframe').getAttribute('sandbox'),'allow-same-origin');
 const field=editor.querySelector('[data-confirmation-field="work"]');assert.equal(field.getAttribute('contenteditable'),'plaintext-only');
 field.innerHTML='Service plus tyre check<br>Call Chris first';field.dispatchEvent(new editor.defaultView.Event('input',{bubbles:true}));
 assert.match(document.querySelector('.portalEmailHint').textContent,/recorded in Messages/);
 const send=document.querySelector('button');await send.onclick();
 assert.deepEqual(requests[1].edits,{work:'Service plus tyre check\nCall Chris first'});
 assert.equal(send.disabled,true);assert.equal(field.hasAttribute('contenteditable'),false);assert.deepEqual(events,['vecta-portal-changed']);
 assert.equal(document.querySelector('dialog'),null,'successful send closes the confirmation window');
});
test('the selected work precedes mileage notes in both email formats without changing the saved job',()=>{
 const mileage='Current mileage unknown. Check mileage on arrival and carry out the selected service package. Discuss additional items separately.';
 const advisory='MOT Advisories, customer would like these done: inspect rear tyres';
 const booking={...job,job_type:'Full Service',work_required:[mileage,advisory,'Full Service','Spark plugs: Check first — replace if due.'].join('\n\n')};
 const before=structuredClone(booking),mail=confirmationContent(booking,link),{document}=parseHTML(mail.html);
 const work=document.querySelector('[data-confirmation-field="work"]');for(const br of work.querySelectorAll('br'))br.replaceWith('\n');
 const expected=['Full Service',mileage,advisory,'Spark plugs: Check first — replace if due.'].join('\n\n');
 assert.equal(work.textContent,expected);assert.ok(mail.text.includes('Job Description\n'+expected));assert.deepEqual(booking,before);
 const edited=confirmationContent(booking,link,null,{work:'My own amended description'});assert.ok(edited.text.includes('Job Description\nMy own amended description'));
});
test('combined jobs and freeform work retain all notes when moved above mileage, and ordinary descriptions stay unchanged',()=>{
 for(const [job_type,work_required,expected]of [
  ['Full Service || MOT','Mileage: 25,000 miles\n\nFull Service\n\nMOT','Full Service\n\nMOT\n\nMileage: 25,000 miles'],
  ['Other','Current mileage unknown. Check on arrival.\n\nInvestigate intermittent rattle','Investigate intermittent rattle\n\nCurrent mileage unknown. Check on arrival.'],
  ['Full Service','Customer request: inspect tyres\n\nFull Service','Customer request: inspect tyres\n\nFull Service']
 ])assert.ok(confirmationContent({...job,job_type,work_required},link).text.includes('Job Description\n'+expected));
});
test('an unconfirmed or failed send and an outstanding delivery-record warning keep the confirmation window open',async()=>{
 for(const outcome of ['pending','failed','audit']){
  const {document}=parseHTML('<html><body></body></html>'),create=document.createElement.bind(document);
  document.createElement=tag=>{const el=create(tag);if(tag==='dialog'){el.showModal=()=>{};el.close=()=>el.remove();}return el;};
  const window={};let complete;
  vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{document,window,location:{search:''},URLSearchParams,AbortSignal,fetch:async(url,options)=>{
   if(JSON.parse(options.body).action==='confirmation-preview')return Response.json({editable:false,email:'driver@example.invalid',status:'unsent',html:'<p>Saved preview</p>'});
   return new Promise(resolve=>complete=()=>resolve(outcome==='audit'?Response.json({accepted:true,audit_pending:true}):Response.json({error:outcome==='failed'?'Email rejected':'Sending could not be confirmed'},{status:503})));
  }});
  await window.VectaPortalWorkshop.confirmation(job);const send=document.querySelector('button'),pending=send.onclick();
  assert.ok(document.querySelector('dialog'));assert.equal(send.disabled,true);
  complete();await pending;assert.ok(document.querySelector('dialog'));
  assert.match(document.querySelector('[role="status"]').textContent,outcome==='audit'?/delivery record needs checking/:outcome==='failed'?/Email rejected/:/could not be confirmed/);
 }
});

test('refresh restores the same booking and its amended email, and only Send delivers it',async()=>{
 const stored=new Map(),requests=[];
 const sessionStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
 function page(){
  const {document,window}=parseHTML('<html><body><main class="main"><header class="top"></header></main></body></html>');
  const create=document.createElement.bind(document);
  document.createElement=tag=>{
   const el=create(tag);
   if(tag==='dialog'){el.showModal=()=>el.setAttribute('open','');el.close=()=>el.remove();}
   if(tag==='iframe')Object.defineProperty(el,'srcdoc',{set(html){
    Object.defineProperty(el,'contentDocument',{value:parseHTML(html).document});
    el.dispatchEvent(new window.Event('load'));
   }});
   return el;
  };
  const workshopWindow={addEventListener(){}};
  vm.runInNewContext(readFileSync('public/js/vecta-portal-workshop.js','utf8'),{window:workshopWindow,document,navigator:{onLine:false},sessionStorage,setInterval(){},location:{search:''},URLSearchParams,AbortSignal,Event,fetch:async(url,opts)=>{
   const body=JSON.parse(opts.body);requests.push(body);
   return Response.json(body.action==='confirmation-preview'?{confirmation_id:'visit-1',status:'unsent',editable:true,email:'driver@example.invalid',html:confirmationPreviewHtml(confirmationContent(job,link))}:{accepted:true});
  }});
  return {document,workshop:workshopWindow.VectaPortalWorkshop,field:()=>document.querySelector('iframe').contentDocument.querySelector('[data-confirmation-field="work"]')};
 }
 const first=page();first.workshop.prepareConfirmation(job);
 const opened=page();await new Promise(resolve=>setImmediate(resolve));
 opened.field().textContent='Check the tyres first';opened.field().dispatchEvent(new (opened.field().ownerDocument.defaultView.Event)('input',{bubbles:true}));
 const restored=page();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(restored.field().textContent,'Check the tyres first');
 assert.deepEqual(requests.map(r=>[r.action,r.job_id]),Array(2).fill(['confirmation-preview',job.id]));
 await restored.document.querySelector('.portalEmailDialog button').onclick();
 assert.deepEqual(requests[2].edits,{work:'Check the tyres first'});assert.equal(requests[2].action,'confirmation-send');assert.equal(stored.size,0);
});
