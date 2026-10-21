import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const source=name=>html.split('\n').find(line=>line.startsWith('function '+name+'('));

test('Admin retains existing monthly charges and tax entries, newest first, without generating jobs',()=>{
 const jobs=[
  {id:'monthly-old',source:'monthly_admin',booking_date:'2026-09-30',work_required:'Fleet maintenance'},
  {id:'ordinary',booking_date:'2026-10-21',work_required:'Repair'},
  {id:'tax',tax:true,booking_date:'2026-10-20',work_required:'Vehicle tax'},
  {id:'monthly-new',source:'monthly_admin',booking_date:'2026-10-31',work_required:'Fleet maintenance'}
 ];
 const before=JSON.stringify(jobs),context={app:{jobs},isVehicleTaxJob:j=>j.tax===true};
 vm.runInNewContext(source('jobsForList'),context);
 assert.deepEqual(Array.from(context.jobsForList('admin'),j=>j.id),['monthly-new','tax','monthly-old']);
 assert.equal(JSON.stringify(jobs),before);
 assert.doesNotMatch(html,/ensureMonthlyNmukJobs|auto-monthly-/);
});

test('Fleet drawer directly renders maintenance and archive controls without the retired tax banner',()=>{
 const context={fleetVehicles:[{id:'vehicle',registration:'AB12 XYZ',model:'Nissan',fleetGroup:'Nissan Pool Cars'}],activeFleetVehicleId:'vehicle',fleetCompletions:[],fleetVehiclePlans:()=>[{id:'service',type:'Full Service',intervalMonths:12}],fleetDate:()=> '2026-11-01',fleetTone:()=>'',fleetFormat:s=>s,esc:s=>s,fleetPlate:s=>s,fleetDisplayModel:s=>s,fleetGroupLabel:s=>s,vehicleEmailLinkHtml:()=>'',fleetGovernmentDataHtml:()=>''};
 vm.runInNewContext(source('fleetDrawerHtml'),context);
 const output=context.fleetDrawerHtml();
 assert.match(output,/AB12 XYZ/);assert.match(output,/Full Service/);
 assert.match(output,/data-fleet-book="service"/);assert.match(output,/id="fleetRemoveVehicle"/);
 assert.doesNotMatch(output,/fleetTaxConfirmBar|fleetConfirmTaxed/);
 context.activeFleetVehicleId='missing';assert.equal(context.fleetDrawerHtml(),'');
});

test('job cards have one calendar implementation without obsolete popup observers or editor wrappers',()=>{
 assert.doesNotMatch(html,/v240JobObserver|v240InstallCapacityLauncher|openBookingCapacityChooser|originalOpenJobModal/);
 assert.match(html,/preview\.className='bookingAvailabilityWorkspace'/);
 assert.match(html,/window\.openJobModal=function\(id,preset\)\{return openJobModal\(id,preset\);\}/);
 assert.match(html,/window\.v255ManualFleetMotCheck=v255Manual/);
});
