import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
test('known, missing and failed brand logos retain one identical panel without editing artwork',()=>{
 const {document}=parseHTML('<html><body></body></html>');const context={document};vm.createContext(context);vm.runInContext(readFileSync('public/js/vecta-tyre-booking.js','utf8'),context);
 document.body.innerHTML=['PIRELLI','COMFORSER',''].map(context.VectaTyreBooking.brandLogo).join('');
 assert.equal(document.querySelectorAll('.tyre-brand-logo').length,3);assert.equal(document.querySelector('.tyre-guide-brand').textContent,'COMFORSER');
 const img=document.querySelector('img');assert.equal(img.getAttribute('src'),'/assets/tyre-brands/pirelli.png');img.dispatchEvent(new document.defaultView.Event('error',{bubbles:true}));
 assert.equal(document.querySelectorAll('.tyre-brand-logo').length,3);assert.equal(document.querySelector('.tyre-brand-logo').textContent,'PIRELLI');assert.equal(document.querySelectorAll('img').length,0);
 const css=readFileSync('public/js/vecta-tyre-booking.css','utf8');assert.match(css,/background:#fff/);assert.doesNotMatch(css.match(/\.tyre-option \.tyre-brand-logo img\{[^}]*\}/)[0],/filter:|mix-blend-mode/);
});
