import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bookingTypes} from '../../lib/booking-input.js';

const booking=readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
const mirror=readFileSync(new URL('../../public/booking.html',import.meta.url),'utf8');

test('booking pages stay in sync',()=>assert.equal(mirror,booking));
test('website service choices survive booking input normalisation',()=>{
 assert.deepEqual(bookingTypes({job_types:['Interim Service'],service_choice:'Interim Service'}),['Interim Service']);
 assert.deepEqual(bookingTypes({job_types:['Service'],service_choice:'Interim Service'}),['Interim Service']);
 assert.deepEqual(bookingTypes({job_types:['Full Service'],service_choice:'Full Service'}),['Full Service']);
});
test('offline vehicle lookup retains manual booking path',()=>{
 assert.match(booking,/state\.lookup==='error'&&!document\.querySelector\('\[data-field="vehicle"\]'\)/);
 assert.match(booking,/state\.lookup==='error'\?\`<label>Make &amp; Model/);
 assert.match(booking,/if\(state\.lookup!=='success'\)return state\.step===2\?nevosHtml\(\):''/);
 assert.match(booking,/Our vehicle lookup is offline/);
});
test('website booking submission preserves selected service',()=>{
 assert.match(booking,/job_types:f\.job_types\.map\(x=>x==='Service'\?\(f\.service_choice\|\|x\):x\)/);
});
