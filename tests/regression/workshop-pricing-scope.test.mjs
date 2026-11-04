import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyJobPricingBridge} from '../../scripts/verify-job-pricing-build.mjs';
test('actual job-editor mount passes private helpers without relying on window globals',()=>{
 verifyJobPricingBridge(readFileSync('index.html','utf8'));
 assert.throws(()=>verifyJobPricingBridge('window.VectaJobPricing.install(j)'),/private job-editor scope/);
});
