import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function fn(name){
 const start=html.indexOf('function '+name+'(');
 assert.ok(start>=0,name);
 const end=html.indexOf('\n}',start);
 return html.slice(start,end+2);
}
function fixture(registration='VN68 FYV'){
 const vehicle={id:'pool-vehicle',registration,fleetGroup:'Nissan Pool'};
 const plan={id:'safety-plan',vehicleId:vehicle.id,type:'Six-month Safety Check',currentDueDate:'2026-10-01',manualDueDate:true,status:'Active'};
 const job={id:'completed-check',registration:registration.replace(/ /g,''),job_type:'6 Month Safety Check',work_required:'Health check, tyres, brakes and fluid levels',status:'completed',booking_date:'2026-09-30',completed_at:'2026-09-30T11:11:00Z'};
 const ctx={app:{jobs:[job],serviceRecords:[]},fleetVehicles:[vehicle],fleetPlans:[plan],fleetCompletions:[],todayIso:()=> '2026-10-15',fleetDate:p=>p.currentDueDate,normReg:s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''),normaliseJobTypeKey:s=>String(s||'').toLowerCase(),isVehicleTaxJob:()=>false,serviceRecordKind:r=>r.sheet_type||'service'};
 ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-fleet-rules.js',import.meta.url),'utf8'),ctx);
 ctx.fleetMaintenanceCategory=ctx.VectaFleetRules.maintenanceCategory;
 for(const name of ['jobTypeValues','fleetPlannerJobCategories','completedJobCanUpdateFleet','completedJobDateForFleet','fleetServiceCompletionMatchesCycle','fleetSafetyCompletionMatchesCycle','fleetCompletedJobForPlanCycle','fleetLatestCompletedEvidenceDate','fleetPlannerJobsForVehicle','fleetPlannerJobTypeKeyMatches','fleetBookedPlannerJob'])vm.runInContext(fn(name),ctx);
 vm.runInContext(html.match(/function isSixMonthSafetyCheck\(value\)\{[^\n]+/)[0],ctx);
 const start=html.indexOf('window.fleetPlanCompletedForCurrentCycle=function(p)'),end=html.indexOf('\n  };',start);
 vm.runInContext(html.slice(start,end+5),ctx);
 return {ctx,plan,job,done:()=>ctx.fleetPlanCompletedForCurrentCycle(plan)};
}

test('completed checks clear manually dated fleet cycles for VN68 FYV and VO20 FYA without changing dates',()=>{
 for(const reg of ['VN68 FYV','VO20 FYA','VO20 GXG']){
  const f=fixture(reg),before=JSON.stringify(f.plan);
  assert.equal(f.done(),true,reg+' completed 30 September against 1 October due');
  assert.equal(JSON.stringify(f.plan),before,'completion must not move the service-anchored safety date');
 }
});
test('unfinished checks and previous-cycle completions remain outstanding',()=>{
 const f=fixture();f.job.status='booked';f.job.completed_at=null;
 assert.equal(f.done(),false);
 f.job.status='completed';f.job.completed_at='2026-04-01T10:00:00Z';
 assert.equal(f.done(),false);
 f.job.completed_at='2026-09-30T11:11:00Z';f.plan.currentDueDate='2027-04-01';
 assert.equal(f.done(),false,'next service-anchored cycle must remain due');
});
test('a durable completed-check record clears the manual cycle before job history is hydrated',()=>{
 const f=fixture();f.ctx.app.jobs=[];
 f.ctx.fleetCompletions=[{id:'job-safety-completed-check',vehicleId:f.plan.vehicleId,planId:f.plan.id,type:'Six-month Safety Check',completedDate:'2026-09-30',cycleDue:'2026-10-01',datePrecision:'day',source:'job:completed-check'}];
 assert.equal(f.done(),true);
 f.ctx.fleetCompletions[0].source='historical/imported/photograph';
 assert.equal(f.done(),false,'historical imports cannot clear a protected due cycle');
});
test('a current open safety booking keeps its cycle outstanding',()=>{
 const f=fixture();f.ctx.app.jobs.push({...f.job,id:'new-check',status:'booked',completed_at:null,booking_date:'2026-10-20'});
 assert.equal(f.done(),false);
});
