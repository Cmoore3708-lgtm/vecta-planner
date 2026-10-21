import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={};vm.createContext(context);vm.runInContext(readFileSync('public/js/vecta-tyre-booking.js','utf8'),context);
test('only edge-connected white background becomes transparent; logo colours and enclosed white stay exact',()=>{
 const pixels=new Uint8ClampedArray(5*5*4);for(let i=0;i<25;i++)pixels.set([255,255,255,255],i*4);
 for(const i of [6,7,8,11,13,16,17,18])pixels.set([230,20,35,255],i*4);
 pixels.set([255,220,0,255],4*4);const original=pixels.slice();context.VectaTyreBooking.clearLogoBackground(pixels,5,5);
 assert.equal(pixels[3],0);assert.equal(pixels[12*4+3],255);
 for(const i of [4,6,7,8,11,12,13,16,17,18])assert.deepEqual(pixels.slice(i*4,i*4+4),original.slice(i*4,i*4+4));
 for(let i=0;i<25;i++)assert.deepEqual(pixels.slice(i*4,i*4+3),original.slice(i*4,i*4+3));
 assert.doesNotMatch(readFileSync('public/js/vecta-tyre-booking.css','utf8').match(/\.tyre-option \.tyre-brand-logo img\{[^}]*\}/)[0],/mix-blend-mode|filter:/);
});
