import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {confirmationContent,confirmationPreviewHtml} from '../../lib/portal-email.js';
const job={id:'11111111-1111-4111-8111-111111111111',registration:'TEST001',vehicle:'Peugeot 208',booking_date:'2026-11-24',amount_quoted:120,work_required:'Full service'};
const link='https://www.vectamotors.co.uk/track#test';
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
 const {document}=parseHTML(content.html);assert.equal(document.querySelector('[data-confirmation-field="work"]').textContent,'<img src=x onerror=alert(1)> & repair');assert.equal(document.querySelectorAll('img').length,1);
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
});
