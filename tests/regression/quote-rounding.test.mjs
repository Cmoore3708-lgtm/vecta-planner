import test from 'node:test';
import assert from 'node:assert/strict';
import {roundedRepairTotal} from '../../lib/repair-quote.js';
test('VAT-inclusive quote rounds upwards once to £5 and reconciles saved net/VAT',()=>{
 for(const [baseNet,total] of [[11008,13500],[11250,13500],[11251,14000],[0,0],[29421,35500]]){
  const q=roundedRepairTotal(baseNet);
  assert.equal(q.totalIncVatPence,total);
  assert.equal(q.netPence+q.vatPence,total);
  assert.equal(Math.round(q.netPence/5),q.vatPence);
  assert.equal(baseNet+q.roundingNetPence,q.netPence);
  assert.ok(q.roundingNetPence>=0);
 }
 for(const bad of [-1,1.5,NaN,Infinity])assert.throws(()=>roundedRepairTotal(bad));
});
