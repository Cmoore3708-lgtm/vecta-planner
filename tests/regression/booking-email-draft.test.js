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
