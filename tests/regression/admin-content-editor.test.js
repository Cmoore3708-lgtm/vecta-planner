import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../../public/admin.html',import.meta.url),'utf8');
test('Admin seeds MOT popup copy and waits for DOM before populating fields',()=>{
 assert.match(html,/"bookingMotPopupTitle":"MOT booking notice"/);
 assert.match(html,/"bookingMotPopupMessage":"Due to limited availability, MOT’s need to be booked 9 days in advance\."/);
 assert.match(html,/"bookingMotPopupDropoff":"Please drop your car off at our Workshop in the morning before you start your shift\."/);
 assert.match(html,/"bookingMotPopupButton":"Continue"/);
 assert.match(html,/document\.addEventListener\('DOMContentLoaded',[\s\S]*?fillBuiltInCopy\(\)/);
});