import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const html=fs.readFileSync('website/booking/index.html','utf8');
test('EV offer requires registration-bound electric identity, never hybrid or unknown',()=>{
 const c={state:{form:{registration:'AB12CDE',fuel_registration:'AB12CDE',fuel_type:'Electric'}}};vm.createContext(c);vm.runInContext(html.match(/function confirmedEvServiceVehicle\(\)\{[^\n]+/)[0],c);assert.equal(c.confirmedEvServiceVehicle(),true);
 for(const fuel of ['Petrol','Diesel','Petrol Hybrid','Plug-in Hybrid','']){c.state.form.fuel_type=fuel;assert.equal(c.confirmedEvServiceVehicle(),false);}
 c.state.form.fuel_type='Electric';c.state.form.registration='ZZ99ZZZ';assert.equal(c.confirmedEvServiceVehicle(),false);
 assert.match(html,/Normally £90 - £150/);assert.match(html,/'Full computer diagnostic scan','Comprehensive health check & report'/);assert.doesNotMatch(html,/Servicing for electric vehicles\.'[^\n]*'Air filter'/);
});
