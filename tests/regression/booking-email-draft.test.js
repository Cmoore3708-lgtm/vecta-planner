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
for(const device of ['iPhone','iPad','Android','Windows'])test(device+' automatically opens a prefilled unsent email and keeps formatted copy available',async()=>{
 const {api,document,events,win}=browser({userAgent:device});const copied=[];
 win.ClipboardItem=class {constructor(data){this.data=data;}};
 win.navigator.clipboard={write:async items=>copied.push(...items)};
 const draft=api.create(input);api.open(draft);
 assert.equal(win.location.href,draft.mailto);assert.deepEqual(events.downloads,[]);
 const dialog=document.querySelector('dialog[open]'),link=dialog.querySelector('[data-booking-email-open]');
 assert.equal(link.hidden,false);
 assert.equal(link.getAttribute('href'),draft.mailto);
 await dialog.querySelector('[data-booking-email-copy]').onclick();
 assert.equal(copied.length,1);assert.equal(link.hidden,false);
 const html=await copied[0].data['text/html'].text(),message=parseHTML(html).document;
 assert.equal(message.querySelector('a').textContent,'HERE');assert.equal(message.querySelector('a').getAttribute('href'),input.trackingUrl);
 assert.equal(message.body.textContent.includes(input.trackingUrl),false);
 const url=new URL(link.getAttribute('href'));
 assert.equal(url.protocol,'mailto:');assert.equal(decodeURIComponent(url.pathname),input.email);
 assert.equal(url.searchParams.get('subject'),input.subject);assert.equal(url.searchParams.get('body'),draft.text);
 assert.match(dialog.querySelector('[data-booking-email-status]').textContent,/Copied.*Paste before sending/);
 assert.equal(dialog.querySelector('[data-booking-email-message] a').textContent,'HERE');
 assert.equal(dialog.querySelector('[data-booking-email-message]').textContent.includes(input.trackingUrl),false);
 api.open(draft);assert.equal(document.querySelectorAll('dialog').length,1);
 document.querySelector('[data-booking-email-close]').click();assert.equal(document.querySelector('dialog'),null);
});
test('blocked clipboard leaves a selectable formatted message and never claims it copied',async()=>{
 const {api,document,win}=browser({userAgent:'iPhone'});
 win.ClipboardItem=class {};
 win.navigator.clipboard={write:async()=>{throw Error('Permission denied');}};
 api.open(api.create(input));await document.querySelector('[data-booking-email-copy]').onclick();
 assert.match(document.querySelector('[data-booking-email-status]').textContent,/Select and copy/);
 assert.equal(document.querySelector('[data-booking-email-preview]').open,true);
 assert.equal(document.querySelector('[data-booking-email-copy]').disabled,false);
 assert.equal(win.location.href,api.create(input).mailto);
});
