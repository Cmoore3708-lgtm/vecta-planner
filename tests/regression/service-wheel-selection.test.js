import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML,DOMParser} from 'linkedom';
const booking=fs.readFileSync('website/booking/index.html','utf8');
const code=booking.slice(booking.indexOf('let serviceHeadlightSvgSequence=0;'),booking.indexOf('\nfunction serviceOptionsHtml()'));
test('only selected ready cars illuminate pale headlight lenses; wheels and other lamps stay intact',()=>{
 const {document}=parseHTML('<html><body><div class="service-option selected"><span class="service-vehicle-stage"><img data-service-car data-vehicle-ready="1"></span></div><div class="service-option"><img data-service-car data-vehicle-ready="1"></div></body></html>');
 const artwork='<svg xmlns="http://www.w3.org/2000/svg"><g id="wheels"><path fill="#aaa" d="M0 0h10v10z"/></g><g id="lights"><path id="head" fill="#F7F7D1"/><path id="tail" fill="#FF0000"/><path id="indicator" fill="#FF6633"/></g></svg>';
 const imgs=[...document.querySelectorAll('img')];imgs.forEach(img=>img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(artwork));
 vm.runInNewContext(code+'\nilluminateServiceCarHeadlights();illuminateServiceCarHeadlights();',{document,DOMParser,console});
 const svg=document.querySelector('.service-animated-artwork');
 assert.ok(svg);assert.equal(document.querySelectorAll('.service-animated-artwork').length,1);
 assert.equal(svg.querySelector('.service-headlight-on').getAttribute('fill'),'#fffdeb');
 assert.equal(svg.querySelector('[id$="tail"]').getAttribute('fill'),'#FF0000');
 assert.equal(svg.querySelector('[id$="indicator"]').getAttribute('fill'),'#FF6633');
 assert.equal(svg.querySelector('[id$="wheels"] path').getAttribute('d'),'M0 0h10v10z');
 assert.equal(svg.querySelector('animateTransform'),null);
 assert.equal(imgs[1].dataset.serviceAnimated,undefined);
});
test('booking copies match and reduced motion keeps steady headlights',()=>{
 assert.equal(booking,fs.readFileSync('public/booking.html','utf8'));
 assert.match(booking,/@media\(prefers-reduced-motion:reduce\)\{\.service-headlight-on\{animation:none\}/);
 assert.doesNotMatch(booking,/service-inspection-sweep|animateServiceCarWheels|animateTransform/);
});
