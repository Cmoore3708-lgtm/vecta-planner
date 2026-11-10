import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {parseHTML} from 'linkedom';
const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=new Set(['fleetShortVehicle','fleetMaintenanceHtml','fleetPrintCurrentView','fleetDueRow','fleetEmailSentCell','fleetEmailCycleKey','fleetEmailSentDisplayDate','fleetBindEmailSent','fleetWorkDueGroupCell','fleetBookingTypeGroupCell','fleetBookedTickGroupCell','fleetBookedGroupCell','fleetBookedLink','fleetImageCell','fleetContactEmailCell','fleetDueCell','fleetDueIcon','fleetBookedTick']);
let source='';
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
 if(![...names].some(n=>m[1].includes('function '+n+'(')))continue;
 traverse(parse(m[1],{sourceType:'script'}),{FunctionDeclaration(p){if(names.has(p.node.id.name))source+=m[1].slice(p.node.start,p.node.end)+'\n'}});
}
function setup(){
 const {document}=parseHTML('<html><body></body></html>');
 const vehicle={id:'sample',registration:'AB12 CDE',model:'Qashqai 1.2 petrol',fleetGroup:'Nissan Pool Cars',contactEmail:'fleet.contact@example.invalid',tone:'overdue',nextDue:'2026-01-01',nextDueType:'Annual Service',plans:['Annual Service','MOT','Tax','Six-month Safety Check'].map((type,i)=>({id:'plan-'+i,type,due:'2026-01-01'}))};
 const c={document,console,vehicle,fleetListMode:'due30',fleetQuery:'',fleetFilter:'All',activeFleetVehicleId:'',fleetEmailSent:{},remoteClient:null,store:{},render(){},
  serviceTypeFromValue:()=>'full',fleetEnriched:()=>[vehicle],fleetDate:p=>p.due,fleetHasActiveMaintenanceRecord:()=>true,fleetBookedPlannerJob:()=>null,fleetPlannerJobsForVehicle:()=>[],
  fleetDisplayModel:x=>x,fleetNormaliseCustomer:x=>x||'',fleetGroupLabel:x=>x==='Nissan Pool Cars'?'NMUK pool cars':x,
  fleetEffectiveContactEmail:v=>v.contactEmail,fleetDateSort:()=>0,fleetTone:()=> 'overdue',
  fleetFormat:date=>date?date.split('-').reverse().join('/'):'—',niceDate:date=>date,
  fleetCustomerBadge:v=>'NMUK pool cars',fleetPlate:reg=>'<span class="fleetRegPlate"><span class="fleetGb">GB</span><b>'+reg+'</b></span>',
  fleetAnyBookedPlannerJob:()=>null,fleetCustomerProfileHtml:()=>'',myTasksHtml:()=>'',fleetDrawerHtml:()=>'',
  vectaListWindow:(kind,key,rows)=>rows,vectaListMoreHtml:()=>'',normReg:r=>String(r||'').replace(/\s/g,''),
  esc:s=>String(s??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 };
 c.localStorage={setItem:(k,v)=>c.store[k]=v};vm.createContext(c);vm.runInContext(source,c);return c;
}
function render(c,mode){c.fleetListMode=mode;c.document.body.innerHTML=c.fleetMaintenanceHtml();c.fleetBindEmailSent();return c.document.querySelector('[data-fleet-email-sent]')}
test('every due-work tab shares the saved email cycle and shows all ten cells',()=>{
 const c=setup(),first=render(c,'due30'),key=first.dataset.fleetEmailSent;
 c.fleetEmailSent[key]={sent:true,updated_at:'2026-11-08T10:00:00Z'};
 for(const mode of ['due30','service30','mot30','tax30','safety30']){
  const box=render(c,mode),row=box.closest('.fleetRow');
  assert.equal(box.dataset.fleetEmailSent,key,mode);assert.ok(box.hasAttribute('checked'),mode);
  assert.equal(row.children.length,10,mode);assert.equal(row.querySelector('.fleetContactEmailCell').textContent,c.vehicle.contactEmail);assert.equal(row.querySelector('.fleetEmailSentCheck small').textContent,'08/11');
  assert.equal(row.querySelector('.fleetEmailSentLabel').textContent,'Email sent');
  assert.equal(c.document.querySelector('.fleetTableHead').children.length,10);
 }
});
test('ticking or clearing a filtered email record persists and remains consistent on the combined list',()=>{
 const c=setup(),box=render(c,'service30'),key=box.dataset.fleetEmailSent;let opened=0;
 box.closest('.fleetRow').onclick=()=>opened++;
 box.click();assert.equal(opened,0);assert.equal(c.fleetEmailSent[key].sent,true);
 assert.equal(JSON.parse(c.store['vecta:fleet:email-sent:v329'])[key].sent,true);
 assert.ok(render(c,'due30').hasAttribute('checked'));
 render(c,'mot30').click();assert.equal(c.fleetEmailSent[key].sent,false);
 assert.equal(render(c,'service30').hasAttribute('checked'),false);
});
test('label and checkbox keyboard events do not open the vehicle card',()=>{
 const c=setup(),box=render(c,'service30'),row=box.closest('.fleetRow');let opened=0;
 row.onclick=row.onkeydown=()=>opened++;
 box.closest('label').click();box.dispatchEvent(new c.document.defaultView.Event('keydown',{bubbles:true}));
 assert.equal(opened,0);
});
test('combined rows retain all work badges and filtered rows only show their selected work',()=>{
 const c=setup();render(c,'due30');assert.equal(c.document.querySelectorAll('.fleetBookingTypeEntry').length,4);
 render(c,'service30');assert.equal(c.document.querySelectorAll('.fleetBookingTypeEntry').length,1);
 assert.equal(c.document.querySelector('.fleetDueIcon').textContent,'SER');
 render(c,'all');assert.equal(c.document.querySelectorAll('[data-fleet-email-sent]').length,0);
});


function customMaintenance(){
 const c=setup();
 vm.runInContext(fs.readFileSync(new URL('../../public/js/vecta-fleet-rules.js',import.meta.url),'utf8'),c);
 c.fleetMaintenanceCategory=value=>c.VectaFleetRules.maintenanceCategory(value);
 c.fleetIsMaintenanceRemoved=(_id,type)=>type==='Removed custom work';
 c.vehicle.plans=['DPF regeneration','Battery inspection','Removed custom work'].map((type,i)=>({id:'custom-'+i,vehicleId:c.vehicle.id,type,status:'Active',due:'2026-11-13',currentDueDate:'2026-11-13',intervalMonths:4}));
 c.fleetPlans=c.vehicle.plans;
 vm.runInContext(html.match(/function fleetHasActiveMaintenanceRecord\(vehicleId,typeKey\)\{[\s\S]*?\n\}/)[0],c);
 const RealDate=Date;
 c.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-10T12:00:00Z']))}};
 c.todayIso=()=> '2026-11-10';
 return c;
}
test('custom DPF work appears in the due list alongside another custom item on the same day',()=>{
 const c=customMaintenance();render(c,'due30');
 const entries=[...c.document.querySelectorAll('.fleetBookingTypeEntry')];
 assert.equal(entries.length,2);
 assert.equal(entries[0].textContent,'Other');
 assert.equal(entries[1].textContent,'DPF');
 assert.equal(c.document.querySelector('[aria-label="DPF regeneration due"]').textContent,'DPF');
 assert.equal(c.document.querySelector('[aria-label="Removed custom work due"]'),null);
 render(c,'service30');assert.equal(c.document.querySelector('[aria-label="DPF regeneration due"]'),null);
});
test('custom DPF work prints with its full name and date, and removed maintenance stays excluded',()=>{
 const c=customMaintenance();let printed='';
 c.window={open:()=>({document:{open(){},write:s=>printed=s,close(){}},focus(){},print(){}})};
 c.setTimeout=fn=>fn();c.alert=message=>{throw Error(message)};
 c.fleetPrintCurrentView();
 assert.match(printed,/DPF regeneration/);assert.match(printed,/Battery inspection/);
 assert.match(printed,/2026-11-13/);assert.doesNotMatch(printed,/Removed custom work/);
});
test('completing a four-month DPF plan advances November to March and July without altering annual service',()=>{
 const c=customMaintenance();
 c.fleetVehicles=[{id:'sample',fleetGroup:'Nissan Internal'}];c.fleetCompletions=[];
 c.todayIso=()=> '2026-11-10';c.saveFleet=()=>{};c.serviceTypeFromValue=()=>'';
 const service={id:'annual',vehicleId:'sample',type:'Internal Service',currentDueDate:'2027-07-13',intervalMonths:12};c.fleetPlans.push(service);
 for(const name of ['fleetAddMonthsFromDue','fleetCompletePlanNow'])vm.runInContext(html.split('\n').find(line=>line.startsWith('function '+name+'(')),c);
 c.fleetDate=p=>p.currentDueDate;
 c.fleetCompletePlanNow('custom-0');assert.equal(c.fleetPlans[0].currentDueDate,'2027-03-13');
 c.fleetCompletePlanNow('custom-0');assert.equal(c.fleetPlans[0].currentDueDate,'2027-07-13');
 assert.equal(c.fleetPlans[0].intervalMonths,4);assert.equal(c.fleetPlans[0].type,'DPF regeneration');
 assert.equal(service.currentDueDate,'2027-07-13');assert.equal(service.intervalMonths,12);
});
