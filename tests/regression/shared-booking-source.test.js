import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBookingPage,bookingSource,bookingOutput} from '../../scripts/sync-booking-page.mjs';
test('both hosted booking pages use the exact shared source and the build checks for drift',()=>{
 assert.equal(syncBookingPage({check:true}),false);assert.equal(fs.readFileSync(bookingSource,'utf8'),fs.readFileSync(bookingOutput,'utf8'));
 const pkg=JSON.parse(fs.readFileSync('package.json'));assert.match(pkg.scripts.build,/sync-booking-page\.mjs --check/);
});
test('both booking entry points retain transfer feedback, repeat-safe submission and current plate layout',()=>{
 for(const file of [bookingSource,bookingOutput]){const html=fs.readFileSync(file,'utf8');assert.match(html,/vecta-booking-transfer\.js/);assert.match(html,/sendBookingRequest\(/);assert.match(html,/registration-brand-row/);assert.match(html,/submitRegistration\(/);assert.match(html,/These advisories were recommended on your last MOT:/);}
});
