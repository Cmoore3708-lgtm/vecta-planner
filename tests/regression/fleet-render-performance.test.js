import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function fleetWithRenderCache('),html.indexOf('function fleetHtml()',html.indexOf('function fleetWithRenderCache(')));
function setup(){
 const calls={plans:0,bookings:0,evidence:0},fleetPlans=[{vehicleId:'1'},{vehicleId:'2'}],jobs=[{registration:'AB12 CDE'},{registration:'CD34 EFG'}];
 const ctx={Map,JSON,fleetPlans,fleetCompletions:[],app:{jobs},normReg:r=>String(r).replace(/\s/g,'').toUpperCase(),
 fleetVehiclePlans:(id,candidates)=>{calls.plans++;assert.deepEqual(Array.from(candidates),fleetPlans.filter(p=>p.vehicleId===id));return candidates},
 fleetPlannerJobsForVehicle:(reg,candidates)=>{calls.bookings++;assert.deepEqual(Array.from(candidates),jobs.filter(j=>ctx.normReg(j.registration)===ctx.normReg(reg)));return candidates},
 fleetLatestCompletedEvidenceDate:()=>{calls.evidence++;return '2026-10-13'}};
 const originals=[ctx.fleetVehiclePlans,ctx.fleetPlannerJobsForVehicle,ctx.fleetLatestCompletedEvidenceDate];vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,calls,originals};
}
test('Fleet indexes plans and jobs and reuses reads only within the current render',()=>{
 const {ctx,calls,originals}=setup();const build=()=>{for(let i=0;i<20;i++){ctx.fleetVehiclePlans('1');ctx.fleetPlannerJobsForVehicle('AB12CDE');ctx.fleetLatestCompletedEvidenceDate({id:'1'},'service')}return 'rendered'};
 assert.equal(ctx.fleetWithRenderCache(build),'rendered');assert.deepEqual(calls,{plans:1,bookings:1,evidence:1});
 ctx.fleetPlans.push({vehicleId:'1'});ctx.app.jobs.push({registration:'AB12CDE'});ctx.fleetWithRenderCache(build);assert.deepEqual(calls,{plans:2,bookings:2,evidence:2});
 assert.deepEqual([ctx.fleetVehiclePlans,ctx.fleetPlannerJobsForVehicle,ctx.fleetLatestCompletedEvidenceDate],originals);
});
test('Fleet restores live readers even when rendering throws',()=>{
 const {ctx,originals}=setup();assert.throws(()=>ctx.fleetWithRenderCache(()=>{throw Error('render failed')}),/render failed/);
 assert.deepEqual([ctx.fleetVehiclePlans,ctx.fleetPlannerJobsForVehicle,ctx.fleetLatestCompletedEvidenceDate],originals);
});
