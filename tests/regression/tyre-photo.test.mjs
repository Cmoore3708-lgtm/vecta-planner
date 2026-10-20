import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/js/vecta-tyre-photo.js','utf8');
const sandbox={};vm.runInNewContext(source,sandbox);
const detect=text=>Array.from(sandbox.VectaTyrePhoto.candidates(text));
test('read spaced and ZR sizes without duplicates',()=>{
 assert.deepEqual(detect('MICHELIN 225 / 40 R 18 92Y; 225/40ZR18'),['225/40R18']);
 assert.deepEqual(detect('205 / 55 R 16'),['205/55R16']);
});
test('preserve multiple sizes for explicit selection',()=>{
 assert.deepEqual(detect('Front 225/40ZR18\nRear 255/35R18'),['225/40R18','255/35R18']);
});
test('never repair ambiguous digits or treat DOT codes as sizes',()=>{
 for(const text of ['DOT 2024 2254018','225/4O R18','999/99R99','1225/40R18','225/40R180','225/40','225/40 18'])
  assert.deepEqual(detect(text),[],text);
});
test('booking mirrors and photo assets stay identical',()=>{
 for(const path of ['js/vecta-tyre-photo.js','js/vecta-tyre-photo.css'])
  assert.equal(fs.readFileSync('public/'+path,'utf8'),fs.readFileSync('website/'+path,'utf8'));
 const booking=fs.readFileSync('website/booking/index.html','utf8');
 assert.equal(booking,fs.readFileSync('public/booking.html','utf8'));
 assert.ok(booking.includes('VectaTyrePhoto.mount'));
 assert.ok(booking.includes('state.form.tyre_size=size;state.form.tyre_guide=null;'));
 assert.ok(booking.includes('/js/vecta-tyre-photo.js'));
});
