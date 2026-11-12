import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function app(){
 const {document,window}=parseHTML('<html><body><main id="job"><section class="jobWorkSection"></section><section class="jobInternalNotesSection"></section></main></body></html>');
 document.hidden=false;
 const create=document.createElement.bind(document);
 document.createElement=tag=>{const el=create(tag);if(tag==='canvas'){el.getContext=()=>({drawImage(){},fillRect(){}});el.toDataURL=()=>'data:image/jpeg;base64,/9j/2Q==';}return el;};
 class Image{naturalWidth=300;naturalHeight=200;async decode(){}}
 const calls=[],photos=[],state={uploadFailure:0,replyFailure:false,holdReply:null,quoteFailure:false};let next=0;
 const fetch=async(_url,{body})=>{
  const b=JSON.parse(body);calls.push(b);
  if(b.action==='portal-job')return Response.json({events:[],alerts:[]});
  if(b.action==='approval-list')return Response.json({approvals:[],whatsapp:null});
  if(b.action==='photos-list')return Response.json({photos});
  if(b.action==='photos-upload'){
   if(state.uploadFailure===calls.filter(c=>c.action==='photos-upload').length)return Response.json({error:'Photo upload interrupted'},{status:503});
   photos.push({id:b.photo_id,caption:b.caption,private_finding:false});return Response.json({ok:true});
  }
  if(b.action==='approval-stage')return Response.json({approval_id:b.approval_id,stage:'draft'});
  if(b.action==='approval-request')return state.quoteFailure?Response.json({error:'Quote send unconfirmed'},{status:503}):Response.json({channels:{email:'test',whatsapp:'test'}});
  if(b.action==='portal-reply'){
   if(state.holdReply)await state.holdReply;
   return state.replyFailure?Response.json({error:'Message not confirmed; retry'},{status:503}):Response.json({ok:true,alerts:{channels:{email:'test',whatsapp:'test'}}});
  }
  throw Error('Unexpected action '+b.action);
 };
 const ctx=vm.createContext({document,window,navigator:{onLine:true},location:{search:''},Image,crypto:{randomUUID:()=>String(++next)},fetch,AbortSignal,URLSearchParams,Intl,Date,Event:window.Event,
  URL:{createObjectURL:()=> 'blob:photo',revokeObjectURL(){}},setTimeout(){},clearTimeout(){}});
 for(const file of ['vecta-portal-workshop.js','vecta-workshop-photos.js'])vm.runInContext(readFileSync('public/js/'+file,'utf8'),ctx);
 window.VectaWorkshopPhotos.mount(document.getElementById('job'),{id:'job-1',registration:'TEST001',status:'in_progress'},true);
 const form=document.querySelector('.portalWorkshopComposer form'),input=form.querySelector('textarea');
 return {document,form,input,calls,state,async add(count=1,camera=false){const field=form.querySelector(camera?'[data-photo-camera-input]':'[data-photo-choose-input]');field.files=Array.from({length:count},()=>({size:100,type:'image/jpeg',name:'photo.jpg'}));await field.onchange();},send:()=>form.onsubmit({preventDefault(){}})};
}

test('one customer section offers a text message, camera and upload without requiring a price',async()=>{
 const h=app();await tick();
 assert.equal(h.document.querySelectorAll('.jobFormSection').length,1);
 assert.equal(h.document.querySelector('.portalWorkshop h3').textContent,'Customer messages & updates');
 assert.equal(h.document.querySelector('.portalWorkshopComposer summary').textContent,'Message customer');
 assert.ok(h.document.querySelector('.portalWorkshop .portalWorkshopPhotos'));
 assert.equal(h.form.querySelector('[data-photo-camera-input]').getAttribute('capture'),'environment');
 assert.equal(h.form.querySelector('[data-photo-choose-input]').hasAttribute('capture'),false);
 assert.equal(h.form.querySelector('[data-photo-choose]').textContent,'Upload photo');
 assert.equal(h.document.querySelector('.approvalComposer').hidden,true);
 await h.send();assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,0);
 h.input.value='Your car is ready to collect.';await h.send();
 assert.equal(h.calls.find(c=>c.action==='portal-reply').message,'Your car is ready to collect.');
 assert.equal(h.calls.filter(c=>c.action==='photos-upload'||c.action==='approval-stage').length,0);
 assert.match(h.form.textContent,/Message saved in the customer portal/);
});

test('taking or uploading a photo only prepares it; Send publishes it before the message and accepts photos without text',async()=>{
 for(const camera of [true,false]){
  const h=app();await tick();await h.add(1,camera);
  assert.ok(h.form.querySelector('.workshopPhotoDraft img'));
  assert.equal(h.calls.filter(c=>['photos-upload','portal-reply'].includes(c.action)).length,0);
  await h.send();
  assert.deepEqual(h.calls.filter(c=>['photos-upload','portal-reply'].includes(c.action)).map(c=>c.action),['photos-upload','portal-reply']);
  assert.match(h.calls.find(c=>c.action==='portal-reply').message,/Workshop photos added/);
  assert.equal(h.calls.find(c=>c.action==='photos-upload').review_id,undefined);
  assert.equal(h.form.querySelector('.workshopPhotoDraft'),null);
  await h.send();assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,1,'cleared photos cannot create an empty duplicate message');
 }
});

test('partial photo failure keeps the message and remaining photo, retries the same photo and never repeats a confirmed upload',async()=>{
 const h=app();await tick();await h.add(2);h.input.value='These are the worn parts.';h.state.uploadFailure=2;
 await h.send();assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,0);assert.equal(h.form.querySelectorAll('.workshopPhotoDraft').length,1);assert.equal(h.input.value,'These are the worn parts.');
 await h.send();const uploads=h.calls.filter(c=>c.action==='photos-upload');assert.equal(uploads.length,3);assert.equal(uploads[1].photo_id,uploads[2].photo_id);assert.notEqual(uploads[0].photo_id,uploads[2].photo_id);
 assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,1);
});

test('an uncertain message retry preserves its id and photo-only text without uploading again; concurrent sends are blocked',async()=>{
 const h=app();await tick();await h.add();h.state.replyFailure=true;
 await h.send();assert.match(h.form.textContent,/Message not confirmed/);
 h.state.replyFailure=false;let release;h.state.holdReply=new Promise(resolve=>{release=resolve;});
 const pending=h.send();await tick();await h.send();release();await pending;
 const replies=h.calls.filter(c=>c.action==='portal-reply');assert.equal(replies.length,2);assert.equal(replies[0].id,replies[1].id);assert.equal(replies[0].message,replies[1].message);
 assert.equal(h.calls.filter(c=>c.action==='photos-upload').length,1);
 assert.equal(h.form.querySelector('[type=submit]').disabled,false);
});

test('removing a prepared photo cancels its upload and a failed photo cannot be silently omitted',async()=>{
 const h=app();await tick();await h.add();h.form.querySelector('.workshopPhotoDraft button').click();await h.send();assert.equal(h.calls.filter(c=>c.action==='photos-upload'||c.action==='portal-reply').length,0);
 const field=h.form.querySelector('[data-photo-choose-input]');field.files=[{size:100,type:'text/plain',name:'wrong.txt'}];await field.onchange();
 h.input.value='Photo attached';await h.send();assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,0);assert.match(h.form.textContent,/Choose an image/);
 const discard=[...h.form.querySelectorAll('button')].find(b=>b.textContent==='Discard failed photo');assert.equal(discard.hidden,false);discard.click();await h.send();assert.equal(h.calls.filter(c=>c.action==='portal-reply').length,1);
});


test('quote mode requires description and price, sends one quote, and retains ordinary message photo drafts',async()=>{
 const h=app();await tick();await h.add();
 const quote=[...h.form.querySelectorAll('button')].find(b=>b.textContent==='Send quote');quote.click();
 await h.send();assert.equal(h.calls.filter(c=>c.action==='approval-stage').length,0);
 h.input.value='Replace front brake pads';await h.send();assert.equal(h.calls.filter(c=>c.action==='approval-stage').length,0);
 const price=h.form.querySelector('.portalQuotePrice input');price.value='120.50';await h.send();
 assert.deepEqual(h.calls.filter(c=>['approval-stage','approval-request'].includes(c.action)).map(c=>c.action),['approval-stage','approval-request']);
 assert.equal(h.calls.find(c=>c.action==='approval-request').estimate,'120.50');assert.equal(h.calls.find(c=>c.action==='approval-request').message,'Replace front brake pads');
 assert.equal(h.calls.filter(c=>['portal-reply','photos-upload'].includes(c.action)).length,0);
 assert.ok(h.form.querySelector('.workshopPhotoDraft'));assert.match(h.form.textContent,/Waiting for the customer/);
});
test('uncertain quote retries retain ID, description and amount and block switching mode',async()=>{
 const h=app();await tick();[...h.form.querySelectorAll('button')].find(b=>b.textContent==='Send quote').click();
 h.input.value='Replace pads';h.form.querySelector('.portalQuotePrice input').value='120';h.state.quoteFailure=true;
 await h.send();assert.equal(h.input.readOnly,true);assert.match(h.form.textContent,/not confirmed/);
 h.state.quoteFailure=false;await h.send();const requests=h.calls.filter(c=>c.action==='approval-request');assert.equal(requests.length,2);assert.equal(requests[0].approval_id,requests[1].approval_id);assert.equal(requests[0].estimate,requests[1].estimate);
});
