import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const window={btoa:s=>Buffer.from(s,'binary').toString('base64')};
vm.runInNewContext(fs.readFileSync('public/js/vecta-booking-email-draft.js','utf8'),{window,URL,Blob,encodeURIComponent,unescape});
test('booking email is an unsent HTML draft with one named tracking link and a plain-text alternative',()=>{
 const draft=window.VectaBookingEmailDraft.create({email:'test@example.com',subject:'Vecta £120 booking',body:'Booking for <Customer>\n\nTrack your car on the day of your booking by clicking HERE.\n\nVecta Motors',trackingUrl:'https://www.vectamotors.co.uk/track?token=test&day=booking'});
 const {document}=parseHTML(draft.html),links=document.querySelectorAll('a');
 assert.equal(links.length,1);assert.equal(links[0].textContent,'HERE');assert.equal(links[0].getAttribute('href'),'https://www.vectamotors.co.uk/track?token=test&day=booking');
 assert.equal(document.querySelector('customer'),null);assert.equal(document.body.textContent.includes('https://'),false);
 assert.match(draft.eml,/^X-Unsent: 1\r\nTo: test@example.com/);
 const encoded=[...draft.eml.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)\r\n--/g)].map(m=>Buffer.from(m[1],'base64').toString('utf8'));
 assert.deepEqual(encoded,[draft.text,draft.html]);assert.match(draft.text,/https:\/\/www.vectamotors.co.uk\/track/);
});
test('draft rejects header injection and unsafe tracking URLs',()=>{
 const input={email:'test@example.com',subject:'booking',body:'test',trackingUrl:'https://www.vectamotors.co.uk/'};
 assert.throws(()=>window.VectaBookingEmailDraft.create({...input,email:'test@example.com\r\nBcc: victim@example.com'}));
 assert.throws(()=>window.VectaBookingEmailDraft.create({...input,trackingUrl:'javascript:alert(1)'}));
});

const input={email:'customer+booking@example.com',subject:'Vecta booking — LM21CFD £120 & MOT',body:'Full Service & MOT\nEstimated cost: £120\n\nTrack your car on the day of your booking by clicking HERE.',trackingUrl:'https://www.vectamotors.co.uk/track?token=example&day=booking'};
function browser(navigator){
 const {document}=parseHTML('<!doctype html><html><body></body></html>');
 const events={downloads:[],revoked:[],timers:[]};
 const createElement=document.createElement.bind(document);
 document.createElement=function(tag){const element=createElement(tag);if(tag==='a')element.click=()=>events.downloads.push({href:element.href,filename:element.download});if(tag==='dialog')element.showModal=()=>element.setAttribute('open','');return element;};
 const win={document,navigator,location:{href:'https://planner.example/'},btoa:window.btoa,URL:{createObjectURL(blob){events.blob=blob;return 'blob:email-draft';},revokeObjectURL(url){events.revoked.push(url);}},setTimeout(fn,delay){events.timers.push({fn,delay});}};
 vm.runInNewContext(fs.readFileSync('public/js/vecta-booking-email-draft.js','utf8'),{window:win,URL,Blob,encodeURIComponent,unescape});
 return {win,document,events,api:win.VectaBookingEmailDraft};
}
for(const [device,navigator] of [
 ['iPhone Safari',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1'}],
 ['iPhone embedded browser',{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'}],
 ['iPad desktop mode',{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',platform:'MacIntel',maxTouchPoints:5}],
 ['Android',{userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Mobile Safari/537.36'}],
 ['reduced mobile user agent',{userAgentData:{mobile:true}}],
])test(device+' prepares a usable email link after the save without downloading an EML file',async()=>{
 const {api,document,events,win}=browser({...navigator,userActivation:{isActive:false}});
 // The confirmation runs only after asynchronous booking persistence and tracking-link creation.
 await Promise.resolve();const draft=api.create(input);api.open(draft,'LM21 CFD');
 assert.equal(events.blob,undefined);assert.deepEqual(events.downloads,[]);
 assert.equal(win.location.href,'https://planner.example/');
 const dialog=document.querySelector('dialog[open]'),link=dialog.querySelector('[data-booking-email-open]'),url=new URL(link.getAttribute('href'));
 assert.equal(url.protocol,'mailto:');assert.equal(decodeURIComponent(url.pathname),input.email);
 assert.equal(url.searchParams.get('subject'),input.subject);assert.equal(url.searchParams.get('body'),draft.text);
 assert.match(draft.text,/Full Service & MOT\nEstimated cost: £120/);assert.ok(draft.text.includes(input.trackingUrl));
 assert.doesNotMatch(draft.text,/clicking HERE/);assert.match(dialog.textContent,/then tap Send/);
 assert.equal(link.hasAttribute('download'),false);
 api.open(draft,'LM21CFD');assert.equal(document.querySelectorAll('dialog').length,1);
 document.querySelector('[data-booking-email-close]').click();assert.equal(document.querySelector('dialog'),null);
});
test('mobile can launch immediately with an active tap and retains a retry link',()=>{
 const {api,win,document}=browser({userAgent:'iPhone',userActivation:{isActive:true}}),draft=api.create(input);
 api.open(draft,'LM21CFD');assert.equal(win.location.href,draft.mailto);
 assert.equal(document.querySelector('[data-booking-email-open]').getAttribute('href'),draft.mailto);
});
test('desktop opens the default email app with an unsent confirmation and a retry link',()=>{
 for(const navigator of [{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',maxTouchPoints:10},{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel',maxTouchPoints:0}]){
  const {api,events,document,win}=browser(navigator),draft=api.create(input);api.open(draft,'LM21 CFD');
  assert.equal(win.location.href,draft.mailto);
  assert.equal(document.querySelector('[data-booking-email-open]').getAttribute('href'),draft.mailto);
  assert.deepEqual(events.downloads,[]);assert.equal(events.blob,undefined);
 }
});
