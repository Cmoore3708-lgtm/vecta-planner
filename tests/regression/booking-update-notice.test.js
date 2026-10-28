import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const code=fs.readFileSync('public/js/vecta-booking-updates.js','utf8');
test('a newer page is offered in a separate tab without clearing the customer form',async()=>{
 const {document}=parseHTML('<html><head><meta name="vecta-booking-version" content="old"></head><body><div class="shell"><input value="Customer details"></div></body></html>');
 const root={document,Date,AbortSignal,encodeURIComponent,addEventListener(){},setInterval:()=>({unref(){}}),fetch:async()=>({ok:true,text:async()=>'<meta name="vecta-booking-version" content="new">'})};root.window=root;
 vm.runInNewContext(code,root);await root.VectaBookingUpdates.check(true);
 const link=document.querySelector('#bookingUpdateNotice a');assert.ok(link);assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('href'),'/booking?v=new');assert.equal(document.querySelector('input').value,'Customer details');
 await root.VectaBookingUpdates.check(true);assert.equal(document.querySelectorAll('#bookingUpdateNotice').length,1);
});
test('website booking documents and mutable helper files cannot be served from an old browser or CDN cache',()=>{
 const config=JSON.parse(fs.readFileSync('website/vercel.json','utf8'));
 for(const source of ['/booking','/booking/:path*','/js/:path*']){const route=config.headers.find(h=>h.source===source);assert.ok(route);assert.ok(route.headers.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store')));assert.ok(route.headers.some(h=>h.key==='Vercel-CDN-Cache-Control'&&h.value==='no-store'));}
 assert.deepEqual(fs.readFileSync('public/js/vecta-booking-updates.js'),fs.readFileSync('website/js/vecta-booking-updates.js'));
});
