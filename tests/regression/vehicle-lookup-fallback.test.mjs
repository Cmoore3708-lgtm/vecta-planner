import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../api/vehicle-lookup.js',import.meta.url),'utf8');
const cache=readFileSync(new URL('../../lib/vehicle-lookup-fallback.js',import.meta.url),'utf8');
test('supplier failures can use saved vehicle details',()=>{
 assert.match(source,/\[429,500,502,503,504\]\.includes\(result\.status\)/);
 assert.match(source,/cachedVehicleLookup\(registration\)/);
});
test('no private customer or workshop fields in cache select',()=>{
 assert.match(cache,/select:'registration,make,model,vehicle,fuel_type,engine_size,colour,updated_at'/);
 assert.doesNotMatch(cache,/select:'[^']*(?:customer_id|notes|mot_history)/);
});
