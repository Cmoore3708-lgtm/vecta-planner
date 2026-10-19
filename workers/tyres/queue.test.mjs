import test from 'node:test';
import assert from 'node:assert/strict';
import { GuideQueue } from './queue.mjs';
const payload = {settings:{vatIncluded:true,fullyFitted:true},rows:[{size:'205/55R16',brand:'EXAMPLE',model:'Test',stock:4,sellout:'£62.00',runflat:false,season:'summer',newTyre:true}]};
const brands = {budget:['EXAMPLE']};
test('deduplicates concurrent lookups, caches and isolates returned objects',async()=>{
 let calls=0,now=0;const q=new GuideQueue(async()=>{calls++;return payload;},{brands,clock:()=>now,ttlMs:100});
 const [a,b]=await Promise.all([q.get('205/55 R16'),q.get('205/55R16')]);a.options[0].unitPence=1;
 assert.equal(b.options[0].unitPence,6200);assert.equal(calls,1);assert.equal((await q.get('205/55R16')).options[0].unitPence,6200);
 now=101;await q.get('205/55R16');assert.equal(calls,2);
});
test('serializes searches and does not cache failures',async()=>{
 let active=0,max=0,calls=0;const q=new GuideQueue(async(size)=>{calls++;active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,5));active--;if(calls===1)throw Error('LOGIN_REQUIRED');return payload;},{brands});
 const first=q.get('205/55R16');const second=q.get('205/55R16',2);await assert.rejects(first);await second;await q.get('205/55R16');assert.equal(max,1);assert.equal(calls,3);
});
test('bounds the queue and cache',async()=>{
 let release;const q=new GuideQueue(()=>new Promise(r=>{release=r}),{brands,maxPending:1,maxCache:1});
 const a=q.get('205/55R16');await Promise.resolve();await assert.rejects(q.get('225/55R16'),/BUSY/);release(payload);await a;
});
test('timeouts stop later browser searches from overlapping',async()=>{
 let calls=0;const q=new GuideQueue(async()=>{calls++;return new Promise(()=>{});},{brands,timeoutMs:10});
 const a=q.get('205/55R16');const b=q.get('225/55R16');await assert.rejects(a,/TIMEOUT/);await assert.rejects(b,/RESTART/);assert.equal(calls,1);
});
