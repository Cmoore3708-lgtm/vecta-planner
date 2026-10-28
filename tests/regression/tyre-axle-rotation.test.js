import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{frame}=require('../../scripts/tyre-roll-model.cjs');
const booking=fs.readFileSync('website/booking/index.html','utf8');
test('tyre tread moves around a fixed axle without rotating its silhouette',()=>{
 const frames=[];for(const phase of [0,.07])frame({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>frames.push(image.data)},phase,96);
 let changed=0;for(let i=0;i<frames[0].length;i+=4){assert.equal(frames[0][i+3],frames[1][i+3],'the tyre outline and opening stay fixed');if(frames[0][i]!==frames[1][i]||frames[0][i+1]!==frames[1][i+1]||frames[0][i+2]!==frames[1][i+2])changed++;}
 assert.ok(changed>100,'the tread and sidewall texture must visibly move');
});
test('selected tyre uses native axle-roll animation and reduced motion uses a still',()=>{
 assert.match(booking,/selected&&!blocked\?'\/assets\/tyre-axle-rolling.webp':'\/assets\/tyre-axle-still.webp'/);
 assert.match(booking,/<source media="\(prefers-reduced-motion: reduce\)" srcset="\/assets\/tyre-axle-still.webp">/);
 assert.doesNotMatch(fs.readFileSync('public/js/vecta-tyre-booking.css','utf8'),/vecta-selected-tyre-spin/);
});
test('axle-roll frames loop and are identical in both website builds',()=>{
 for(const name of ['tyre-axle-still.webp','tyre-axle-rolling.webp'])assert.deepEqual(fs.readFileSync('public/assets/'+name),fs.readFileSync('website/assets/'+name));
 const file=fs.readFileSync('public/assets/tyre-axle-rolling.webp');let frames=0,duration=0;
 assert.equal(file.toString('ascii',8,12),'WEBP');
 for(let i=12;i+8<=file.length;){const type=file.toString('ascii',i,i+4),length=file.readUInt32LE(i+4);if(type==='ANMF'){frames++;duration+=file.readUIntLE(i+8+12,3);}i+=8+length+(length%2);}
 assert.equal(frames,32);assert.equal(duration,1000);assert.ok(file.length<350000);
});
