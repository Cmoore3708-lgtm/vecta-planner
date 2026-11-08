import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingTypes} from '../../lib/booking-input.js';
const booking=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
const mirror=readFileSync(new URL('../../public/booking.html',import.meta.url),'utf8');
test('booking source and mirror match',()=>assert.equal(mirror,booking));
test('service choices remain distinct',()=>{
 assert.deepEqual(bookingTypes({job_types:['Service'],service_choice:'Interim Service'}),['Interim Service']);
 assert.deepEqual(bookingTypes({job_types:['Full Service'],service_choice:'Full Service'}),['Full Service']);
});
test('manual vehicle entry is available before lookup completes',()=>{
 assert.ok(booking.includes("state.lookup!=='success'?\`<label>Make &amp; Model"));
 assert.ok(booking.includes("state.lookup==='success'||!!f.vehicle.trim()"));
 assert.ok(booking.includes("let hideNext=state.step===1&&!valid()"));
 assert.ok(booking.includes("state.step===1&&state.form.registration.toUpperCase()"));
});
test('offline Nissan retains NEVOS question',()=>{
 assert.ok(booking.includes("if(state.lookup!=='success')return state.step===2?nevosHtml():''"));
});
