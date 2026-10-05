import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bookingSlot,durationFor} from '../../api/availability.js';

const friday='2026-10-09',tuesday='2026-10-13';
const job=(hours,patch={})=>({booking_date:friday,drop_time:'08:00',estimated_hours:hours,technician:'Alfie',status:'booked',archived:false,...patch});
test('Mondays and weekends never have online slots',()=>{
 for(const date of ['2026-10-12','2026-10-10','2026-10-11'])assert.equal(bookingSlot(date,[],[],[],1),null);
 assert.ok(bookingSlot(tuesday,[],[],[],1));
});
test('Friday includes the incoming booking and permits exactly four hours',()=>{
 assert.ok(bookingSlot(friday,[job(2.5)],[],[],1.5));
 assert.equal(bookingSlot(friday,[job(3)],[],[],1.5),null);
 assert.equal(bookingSlot(friday,[job(4)],[],[],.5),null);
 assert.equal(bookingSlot(friday,[],[],[],4.5),null);
});
test('Friday pending website requests reserve capacity before manual acceptance',()=>{
 const pending=[{confirmed_date:friday,job_types:['Full Service']}];
 assert.ok(bookingSlot(friday,[job(1)],[],pending,1.5));
 assert.equal(bookingSlot(friday,[job(1.5)],[],pending,1.5),null);
});
test('Other, deleted, completed, cancelled, archived and quote jobs do not consume Alfie’s capacity',()=>{
 for(const patch of [{technician:'Other'},{status:'deleted'},{status:'completed'},{status:'cancelled'},{status:'quote'},{archived:true}])assert.ok(bookingSlot(friday,[job(8,patch)],[],[],1.5));
});
test('Friday slots cannot extend beyond Alfie’s 14:30 finish',()=>{
 const off=[{mechanic:'Alfie',start_date:friday,end_date:friday,start_time:'08:00',end_time:'13:30'}];
 assert.equal(bookingSlot(friday,[],off,[],1.5),null);
 assert.equal(bookingSlot(friday,[],off,[],1).time,'13:30');
});
test('Tuesday to Thursday retain the existing 75% threshold',()=>{
 assert.ok(bookingSlot(tuesday,[job(5.5,{booking_date:tuesday})],[],[],1.5));
 assert.equal(bookingSlot(tuesday,[job(6,{booking_date:tuesday})],[],[],1),null);
});
test('pending service and MOT combinations match customer booking durations',()=>{
 assert.equal(durationFor(['Oil & Filter Change','MOT']),2);
 assert.equal(durationFor(['Major Service','MOT']),3.5);
 assert.equal(durationFor(['Brakes','Tyres']),3);
});
test('further-ahead calendar enables only checked slots, including no Mondays',()=>{
 const html=fs.readFileSync(new URL('../../website/booking/index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function monthKey('),html.indexOf('function motCalendarHtml('));
 class TestDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-05T12:00:00Z']));}static now(){return Date.parse('2026-10-05T12:00:00Z');}}
 const dates=['06','07','08','09','13','14','15','16','20','21','22','23','27'];
 const c=vm.createContext({state:{form:{available_slots:dates.map(day=>({date:'2026-10-'+day}))}},Date:TestDate,Intl});
 vm.runInContext(source,c);const calendar=c.generalCalendarHtml();
 assert.match(calendar,/data-future-date="2026-10-27"/);
 assert.doesNotMatch(calendar,/data-future-date="2026-10-26"/);
 assert.doesNotMatch(calendar,/data-future-date="2026-10-30"/);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
});
