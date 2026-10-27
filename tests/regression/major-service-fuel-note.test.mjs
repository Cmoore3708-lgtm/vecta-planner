import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('website/booking/index.html','utf8');
const helper=source.match(/function majorServiceFuelFilterNote\(choice\)\{[^\n]+/)[0];
test('fuel filter explanation uses displayed £50 boundary and verified parts',()=>{
 let full={totalPence:23000},major={totalPence:28000,items:[{kind:'fuel_filter'}]};
 const c={liveServiceQuote:service=>service==='Full Service'?full:major};vm.createContext(c);vm.runInContext(helper,c);
 assert.equal(c.majorServiceFuelFilterNote('Major Service'),'');major.totalPence=28500;
 assert.match(c.majorServiceFuelFilterNote('Major Service'),/The high price is due to the expensive Fuel filter/);
 assert.equal(c.majorServiceFuelFilterNote('Full Service'),'');major.items=[];assert.equal(c.majorServiceFuelFilterNote('Major Service'),'');major.items=[{kind:'fuel_filter'}];full=null;assert.equal(c.majorServiceFuelFilterNote('Major Service'),'');
});
