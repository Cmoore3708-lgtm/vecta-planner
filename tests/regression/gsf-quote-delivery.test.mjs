import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteDelivery,closeOwned} from '../../workers/gsf/quote-delivery.mjs';
test('service completion precedes cleanup and an expired lease cannot be reported as saved',async()=>{
 const events=[],payload={id:'service',lease:'fixture',action:'complete'};
 const delivery=createQuoteDelivery(async body=>{assert.equal(body,payload);events.push('complete');return {status:'EXPIRED'};});
 assert.equal(await delivery.finish(payload,[{close:async()=>events.push('close')}]),'EXPIRED');
 assert.deepEqual(events,['complete','close']);assert.equal(delivery.pending,false);
});
test('a lost service reply retries without another supplier lookup, with a bounded expiry window',async()=>{
 let clock=10;const events=[];const delivery=createQuoteDelivery(async payload=>{events.push(payload);throw Error('connection');},{now:()=>clock,retryWindowMs:20});
 const payload={action:'complete',id:'same',lease:'same'};
 await assert.rejects(delivery.finish(payload,[]),/connection/);
 await assert.rejects(delivery.flush(),/connection/);assert.equal(events[0],events[1]);
 clock=31;assert.equal(await delivery.flush(),'EXPIRED');assert.equal(delivery.pending,false);
});
test('shutdown of unresponsive owned contexts is bounded',async()=>{
 await assert.rejects(closeOwned([{close:()=>new Promise(()=>{})}],10),/GSF_BROWSER_RESTART_REQUIRED/);
});
