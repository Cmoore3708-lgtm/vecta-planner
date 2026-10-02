import test from 'node:test'; import assert from 'node:assert/strict';
import {buildStaffReminderQueue,reminderContent,staffDueItems} from '../../lib/staff-reminders.js';
const today='2026-09-29';
const staff={registration:'AB12 CDE',fleetGroup:'Staff',contactName:'Alex',contactEmail:'alex@example.com',motExpiryDate:'2026-10-20',nextServiceDue:'2026-10-10'};
test('only active Staff vehicles due within 30 days enter the queue',()=>{
 assert.equal(staffDueItems(staff,today).length,2);
 assert.equal(staffDueItems({...staff,fleetGroup:'Nissan Internal'},today).length,0);
 assert.equal(staffDueItems({...staff,status:'Archived'},today).length,0);
 assert.equal(staffDueItems({...staff,motExpiryDate:'2026-12-20',nextServiceDue:''},today).length,0);
});
test('a matching future booking suppresses only that reminder type',()=>{
 const jobs=[{registration:'AB12CDE',booking_date:'2026-10-05',status:'booked',archived:false,job_type:'MOT'}];
 const q=buildStaffReminderQueue([staff],jobs,[],today);
 assert.deepEqual(q.map(x=>x.kind),['Service']);
});
test('sent stage is deduplicated but 14-day follow-up remains possible',()=>{
 const sends=[{registration:'AB12CDE',kind:'MOT',due_date:'2026-10-20',stage:'30-day',status:'sent'}];
 const q=buildStaffReminderQueue([staff],[],sends,today);
 assert.equal(q.some(x=>x.kind==='MOT'),false);
 const later=buildStaffReminderQueue([staff],[],sends,'2026-10-07');
 assert.equal(later.some(x=>x.kind==='MOT'&&x.stage==='14-day'),true);
});
test('missing email is visible but cannot send',()=>{
 const q=buildStaffReminderQueue([{...staff,contactEmail:''}],[],[],today);
 assert.equal(q.length,2); assert.equal(q.every(x=>!x.canSend),true);
});
test('email copy identifies registration, due item and booking link',()=>{
 const c=reminderContent(buildStaffReminderQueue([staff],[],[],today)[0]);
 assert.match(c.subject,/AB12CDE/); assert.match(c.text,/book your vehicle/i); assert.match(c.html,/Book online/);
});
