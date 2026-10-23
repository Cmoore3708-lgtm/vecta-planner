import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync('index.html','utf8');
const names=['niceDate','plannerHeaderDayLabel','fleetFormat','fleetEmailSentDisplayDate','fleetBookedLink'];
const functions=names.map(name=>source.split('\n').find(line=>line.startsWith('function '+name+'('))||'').join('\n');
// fleetBookedLink spans several lines.
const booked=source.match(/function fleetBookedLink\(booked\)\{[\s\S]*?\n\}/)[0];
const context={Date,esc:String};vm.createContext(context);vm.runInContext(functions.replace('function fleetBookedLink(booked){','')+'\n'+booked,context);
test('planner uses weekday and ordinal without adding month or year',()=>{
 assert.equal(context.plannerHeaderDayLabel('2026-10-23'),'Friday 23rd');
 for(const [day,suffix] of [[1,'st'],[2,'nd'],[3,'rd'],[11,'th'],[12,'th'],[13,'th'],[21,'st'],[22,'nd'],[23,'rd'],[31,'st']])assert.ok(context.plannerHeaderDayLabel('2026-01-'+String(day).padStart(2,'0')).endsWith(' '+day+suffix));
});
test('Fleet booking and email labels stay compact while dated records retain the full UK date',()=>{
 const html=context.fleetBookedLink({id:'job1',booking_date:'2026-10-23',drop_time:'09:00'});
 assert.match(html,/>23\/10<\/button>/);assert.match(html,/title="Open planner for .*2026 at 09:00"/);
 assert.equal(context.fleetEmailSentDisplayDate({updated_at:'2026-10-23T10:30:00Z'}),'23/10');
 assert.equal(context.fleetFormat('2026-01-03'),'03/01/2026');
 assert.equal(context.fleetFormat(''),'Not scheduled');
 assert.equal(context.niceDate('2026-10-23'),'Fri, 23 Oct 2026');
});
