import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && html[i + 1] === '*') { i = html.indexOf('*/', i + 2) + 1; continue; }
    if (char === '/' && html[i + 1] === '/') { i = html.indexOf('\n', i + 2); continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('legacy lane compaction cannot move jobs away from explicitly chosen times', () => {
  const jobs = [
    { id: 'a', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '08:00', estimated_hours: 1 },
    { id: 'b', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '08:30', estimated_hours: 0.5 },
    { id: 'c', booking_date: '2026-09-14', technician: 'Alfie', drop_time: '09:00', estimated_hours: 1.5 },
  ];
  const context = {
    jobs,
    plannerLaneActiveJobs: () => jobs,
    clockMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; },
    normaliseClock: value => value,
    timeFromMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; },
    roundPlannerMinutesUp: value => Math.ceil(value / 15) * 15,
    plannerSafeStackStart: (_job, cursor) => cursor,
    Number,
    Date,
  };
  vm.runInNewContext(`${namedFunctionSource('plannerCompactLane')}; changed = plannerCompactLane('2026-09-14', 'Alfie');`, context);
  assert.deepEqual(jobs.map(j => j.id), ['a', 'b', 'c']);
  assert.deepEqual(jobs.map(j => j.drop_time), ['08:00', '08:30', '09:00']);
  assert.deepEqual(jobs.map(j => j.estimated_hours), [1, 0.5, 1.5]);
  assert.deepEqual(Array.from(context.changed, j => j.id), []);
});

test('planner moves save locally first and then verify every cloud write', () => {
  const bindLane = namedFunctionSource('bindLane');
  const persist = namedFunctionSource('persistPlannerJobs');
  assert.match(bindLane, /saveLocal\(\)[\s\S]*?persistPlannerJobsInBackground\(changed,'Planner job move'\)/);
  assert.match(persist, /await upsertRemote\('jobs',j,\{silent:true\}\)[\s\S]*?await vectaVerifyPlannerJobSaved\(j\)/);
  assert.match(namedFunctionSource('vectaVerifyPlannerJobSaved'), /for\(var attempt=0;attempt<3;attempt\+\+\)/);
});

test('unallocated jobs are explicit and tasks cannot leak into that list', () => {
  const source = namedFunctionSource('bindUnallocatedDrop');
  assert.match(source, /card_type==='mini_task'/);
  assert.match(source, /j\.technician='Unallocated'/);
  assert.match(source, /j\.booking_date=null/);
  assert.match(source, /persistPlannerJobsInBackground\(changed,'Move to Unallocated'\)/);
});

test('legacy technician names collide in the same visible Other lane', () => {
  const plannerRules = fs.readFileSync(new URL('../../public/js/vecta-planner-rules.js', import.meta.url), 'utf8');
  const jobs = [
    { id: 'legacy', booking_date: '2026-09-14', technician: 'Jordan', drop_time: '09:00', estimated_hours: 1, status: 'booked' },
  ];
  const context = {
    app: { settings: { mechanics: ['Alfie', 'Other', 'Anyone'] }, jobs },
    window: {},
    globalThis: {},
    isJobInvoiced: () => false,
    clockMinutes(value) { const [h, m] = value.split(':').map(Number); return h * 60 + m; },
    roundPlannerMinutesUp: value => Math.ceil(Number(value || 0) / 15) * 15,
    timeFromMinutes(value) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; },
    normaliseClock: value => value,
    Number,
    String,
    Math,
  };
  context.window.window = context.window;
  vm.runInNewContext(plannerRules, context.window);
  vm.runInNewContext([
    namedFunctionSource('configuredMechanicNames'),
    namedFunctionSource('plannerLaneMechanics'),
    namedFunctionSource('plannerTechnicianName'),
    namedFunctionSource('plannerTechnicianLane'),
    namedFunctionSource('mechanicBookingIntervals'),
    "intervals=mechanicBookingIntervals('2026-09-14','Other','new')",
  ].join(';'), context);
  assert.deepEqual(Array.from(context.intervals, row => [row.id, row.start, row.end]), [['legacy', 540, 600]]);
  assert.match(namedFunctionSource('findNextMechanicSlot'), /mechanicBookingIntervals\(date,job\.technician,excludeId\)/);
});

test('background overlap hooks do not mutate bookings or write to the cloud', async () => {
 const jobs=[{id:'a',drop_time:'08:00'},{id:'b',drop_time:'08:00'}],before=JSON.stringify(jobs);
 const ctx={app:{jobs},saveLocal(){throw Error('Unexpected save')},upsertRemote(){throw Error('Unexpected cloud write')}};
 vm.runInNewContext(namedFunctionSource('repairExistingPlannerOverlaps'),ctx);
 assert.equal(await ctx.repairExistingPlannerOverlaps({persistRemote:true}),0);assert.equal(JSON.stringify(jobs),before);
});

test('hourly snap is anchored at 08:00 and placement rejects occupied slots without moving neighbours',()=>{
 const ctx={clockMinutes:value=>{const [h,m]=value.split(':').map(Number);return h*60+m},mechanicBookingIntervals:()=>[{start:540,end:600}]};
 vm.runInNewContext(namedFunctionSource('plannerSnapMinutes')+';'+namedFunctionSource('plannerPlacementConflict'),ctx);
 assert.equal(ctx.plannerSnapMinutes(481),480);assert.equal(ctx.plannerSnapMinutes(525),540);assert.equal(ctx.plannerSnapMinutes(940),960);
 assert.match(ctx.plannerPlacementConflict({drop_time:'09:00',estimated_hours:1}),/occupied/);
 assert.equal(ctx.plannerPlacementConflict({drop_time:'10:00',estimated_hours:1}),'');
 assert.match(ctx.plannerPlacementConflict({drop_time:'16:00',estimated_hours:2}),/17:00/);
});

test('startup cleanup cannot overwrite a newer mechanic with a cached unallocated copy',()=>{
 const stale={id:'adam-mot',registration:'ADAM',technician:'Unallocated',booking_date:'2026-10-23',status:'booked',updated_at:'2026-10-09T14:00:00Z'};
 const original=JSON.stringify(stale);let writes=0;
 const ctx={app:{jobs:[stale]},remoteClient:{},isUnallocatedJob:()=>true,isJobInvoiced:()=>false,saveLocal:()=>{writes++},upsertRemote:()=>{writes++;return Promise.resolve([])}};
 vm.runInNewContext(namedFunctionSource('normaliseUnallocatedBookingDates')+';result=normaliseUnallocatedBookingDates()',ctx);
 assert.equal(ctx.result,0);assert.equal(writes,0);assert.equal(JSON.stringify(stale),original);
});

test('opening an existing job uses the configured mechanic names for legacy allocations',()=>{
 const open=namedFunctionSource('openJobModal');
 const start=open.indexOf("var mechanics=['Unallocated']"),end=open.indexOf('var ramps=',start);
 assert.ok(start>-1&&end>start);
 for(const [technician,expected] of [['Jordan','Other'],['alfie','Alfie'],['Alfie','Alfie']]){
  const ctx={id:'existing-job',j:{technician},app:{settings:{mechanics:['Alfie','Other']}}};
  const result={...ctx,esc:v=>String(v),String};vm.runInNewContext(namedFunctionSource('configuredMechanicNames')+';'+namedFunctionSource('configuredMechanicChoice')+';'+open.slice(start,end)+';'+namedFunctionSource('select')+";markup=select('Technician','technician',j.technician,mechanics)",result);
  assert.match(result.markup,new RegExp('<option value="'+expected+'" selected>'));
 }
});

test('current and future legacy-mechanic bookings do not also appear in Unallocated',()=>{
 const jobs=[
  {id:'future',registration:'H13CKK',technician:'Chris',booking_date:'2026-10-13',status:'booked'},
  {id:'today',registration:'AB12XYZ',technician:'Chris',booking_date:'2026-10-12',status:'booked'},
  {id:'past',registration:'PAST',technician:'Chris',booking_date:'2026-10-09',status:'booked'},
  {id:'no-date',registration:'NODATE',technician:'Chris',booking_date:null,status:'booked'},
  {id:'unallocated',registration:'NONE',technician:'Unallocated',booking_date:null,status:'booked'}
 ];
 jobs.push({id:'hold',technician:'Unallocated',booking_date:null,status:'provisional'});
 const before=JSON.stringify(jobs);
 const ctx={app:{jobs,settings:{mechanics:['Alfie','Other']}},todayIso:()=> '2026-10-12',isVehicleTaxJob:()=>false,isJobInvoiced:()=>false,normReg:v=>String(v||'').replace(/\s/g,'').toUpperCase(),carryOverMeta:()=>null,byTime:()=>0};
 vm.runInNewContext(namedFunctionSource('unallocatedJobs')+';rows=unallocatedJobs()',ctx);
 assert.deepEqual(Array.from(ctx.rows,j=>j.id).sort(),['no-date','past','unallocated']);
 assert.equal(JSON.stringify(jobs),before);
});

test('the review panel lists active manual and web holds across dates and removes them on review',()=>{
 const jobs=[
  {id:'later',status:'provisional',booking_date:'2026-11-12',drop_time:'09:00',source:'website booking'},
  {id:'earlier',status:'provisional',booking_date:'2026-11-10',drop_time:'08:00',source:'manual'},
  {id:'undated',status:'provisional'},
  {id:'archived',status:'provisional',archived:true},
  {id:'deleted',status:'provisional',tombstone:true},
  {id:'invoiced',status:'provisional',invoiced:true},
  {id:'cancelled',status:'cancelled'}
 ];
 const ctx={app:{jobs},window:{},esc:v=>String(v??''),vectaJobIsDeletedForLists:j=>j.tombstone,
  isJobInvoiced:j=>j.invoiced,byTime:(a,b)=>String(a.drop_time||'').localeCompare(String(b.drop_time||'')),
  listPlate:()=>'',plannerVehicleLabel:()=>'',jobTypeInlineStyle:()=>'',isWebsiteBookingJob:j=>j.source==='website booking'};
 vm.runInNewContext(namedFunctionSource('provisionalBookingsPanelHtml'),ctx);
 const ids=()=>Array.from(ctx.provisionalBookingsPanelHtml().matchAll(/data-open-job="([^"]+)"/g),match=>match[1]);
 assert.deepEqual(ids(),['earlier','later','undated']);
 assert.match(ctx.provisionalBookingsPanelHtml(),/10\/11 · 08:00/);
 jobs[1].status='booked';jobs[0].archived=true;
 assert.deepEqual(ids(),['undated']);
 jobs[2].status='cancelled';assert.deepEqual(ids(),[]);
 assert.match(ctx.provisionalBookingsPanelHtml(),/provisionalPanelEmpty[^]*No provisional bookings/);
});

test('phone Unallocated uses the shared list without adding assigned multi-day jobs',()=>{
 const allocated={id:'assigned-multi',card_type:'multi_day',technician:'Other',booking_date:'2026-10-13',status:'booked'};
 const unallocated={id:'real-backlog',technician:'Unallocated',status:'booked'};
 const ctx={app:{jobs:[allocated,unallocated],notes:''},window:{},selectedIso:()=> '2026-10-12',quoteJobs:()=>[],unallocatedJobs:()=>[unallocated],byTime:()=>0,esc:v=>String(v||''),mobileJobCardHtml:j=>'<i data-job="'+j.id+'"></i>',plannerTechnicianName:j=>j.technician};
 vm.runInNewContext(namedFunctionSource('mobilePlannerHtml')+";output=mobilePlannerHtml(['Alfie','Other'],[],'<section>HOLDS</section>')",ctx);
 assert.match(ctx.output,/<section>HOLDS<\/section><div class="mobileGroup mobileGroup-unallocated-jobs"[^]*mobileGroup-quotes/);assert.match(ctx.output,/data-job="real-backlog"/);assert.doesNotMatch(ctx.output,/assigned-multi/);
 vm.runInNewContext("output=mobilePlannerHtml(['Alfie','Other'],[app.jobs[0]])",ctx);
 assert.equal((ctx.output.match(/assigned-multi/g)||[]).length,1);
});

test('renamed second column receives both Chris and legacy Other bookings',()=>{
 const rules=fs.readFileSync(new URL('../../public/js/vecta-planner-rules.js',import.meta.url),'utf8');const ctx={};vm.runInNewContext(rules,ctx);
 for(const technician of ['Chris','Other','Jordan'])assert.equal(ctx.VectaPlannerRules.technicianName({technician},['Alfie','Chris','Anyone']),'Chris');
 assert.equal(ctx.VectaPlannerRules.technicianName({technician:'Unallocated'},['Alfie','Chris','Anyone']),'Unallocated');
});

test('legacy Other is shown as Chris in the editor after renaming the column',()=>{
 const open=namedFunctionSource('openJobModal'),start=open.indexOf("var mechanics=['Unallocated']"),end=open.indexOf('var ramps=',start);
 const ctx={id:'job',j:{technician:'Other'},app:{settings:{mechanics:['Alfie','Chris','Anyone']}},plannerTechnicianLane:()=> 'Chris',esc:v=>String(v)};
 vm.runInNewContext(namedFunctionSource('configuredMechanicNames')+';'+namedFunctionSource('configuredMechanicChoice')+';'+open.slice(start,end)+';'+namedFunctionSource('select')+";markup=select('Technician','technician',j.technician,mechanics)",ctx);
 assert.match(ctx.markup,/<option value="Chris" selected>/);assert.doesNotMatch(ctx.markup,/<option value="Other"/);
});

test('unrelated settings saves preserve the shared renamed mechanic list',async()=>{
 let written;const latest={value:{mechanics:['Alfie','Chris','Anyone']},updated_at:'r1'};
 const ctx={app:{settings:{mechanics:['Alfie','Other','Anyone'],businessName:'Vecta Motors'}},vectaSettingsWriteQueue:Promise.resolve(),contractorMasterNames:()=>[],saveLocal(){},vectaMainSettingsLastPersisted:'',console,remoteClient:{from(){let payload;const q={select(){return q},eq(){return q},is(){return q},maybeSingle:async()=>({data:latest}),update(row){payload=row;return q},then(resolve){written=payload;latest.value=payload.value;return Promise.resolve({data:[{id:'main'}]}).then(resolve)}};return q}}};
 vm.runInNewContext(namedFunctionSource('mergeContractorNames')+';'+namedFunctionSource('vectaSettingsSignature')+';async '+namedFunctionSource('persistMainSettings'),ctx);
 assert.equal(await ctx.persistMainSettings(),true);assert.deepEqual(Array.from(written.value.mechanics),['Alfie','Chris','Anyone']);
 ctx.app.settings.mechanics=['Alfie','Dan','Anyone'];await ctx.persistMainSettings({mechanicsChanged:true});assert.deepEqual(Array.from(written.value.mechanics),['Alfie','Dan','Anyone']);
});

test('technician choices follow the complete current list without invented fallback names',()=>{
 const ctx={app:{settings:{mechanics:[' Amy ','Ben','Cara','Dan','Anyone','amy','Unallocated']}}};
 vm.runInNewContext(namedFunctionSource('configuredMechanicNames')+';'+namedFunctionSource('plannerLaneMechanics')+';names=configuredMechanicNames();lanes=plannerLaneMechanics()',ctx);
 assert.deepEqual(Array.from(ctx.names),['Amy','Ben','Cara','Dan']);
 assert.deepEqual(Array.from(ctx.lanes),['Amy','Ben','Cara','Dan','Anyone']);
 assert.deepEqual(ctx.app.settings.mechanics,[' Amy ','Ben','Cara','Dan','Anyone','amy','Unallocated']);
 ctx.app.settings.mechanics=[];
 vm.runInNewContext('names=configuredMechanicNames()',ctx);
 assert.deepEqual(Array.from(ctx.names),[]);
 assert.doesNotMatch(namedFunctionSource('plannerHtml'),/app\.settings\.mechanics\s*=/);
 assert.doesNotMatch(html,/function ensureThreeMechanics\(/);
});

test('a superseded planner save cannot overwrite a later drag', async()=>{
 const latest={id:'a',booking_date:'2026-10-22',technician:'Alfie',drop_time:'11:00',estimated_hours:1,updated_at:'2026-10-22T10:01:00Z'};
 const writes=[],ctx={app:{jobs:[latest]},normaliseClock:v=>String(v||'08:00'),upsertRemote:async(_table,j)=>writes.push(j.drop_time),vectaVerifyPlannerJobSaved:async()=>true,syncTaskFromMiniJob(){}};
 vm.runInNewContext(namedFunctionSource('plannerChangeIsCurrent')+';async '+namedFunctionSource('persistPlannerJobs'),ctx);
 await ctx.persistPlannerJobs([{...latest,drop_time:'09:00',updated_at:'2026-10-22T10:00:00Z'},latest]);
 assert.deepEqual(writes,['11:00']);assert.equal(latest.drop_time,'11:00');
});

function stackedPlanner(jobs){
 const context={app:{jobs},window:{},plannerStartMinutes:480,confirm:()=>true,
  plannerTechnicianLane:x=>x,normaliseClock:x=>x,
  clockMinutes:value=>{const [h,m]=value.split(':').map(Number);return h*60+m},
  timeFromMinutes:value=>`${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`,
  roundPlannerMinutesUp:x=>Math.ceil(x/15)*15,plannerSnapMinutes:x=>Math.round(x/30)*30,
  isSoftDeletedJob:()=>false,jobCompletionEvidence:x=>x.status==='completed',isJobInvoiced:()=>false};
 for(const name of ['plannerJobTimeLocked','plannerBookingTimeNote','plannerConfirmTimeMove','plannerLaneActiveJobs','plannerSafeStackStart','plannerPackOrderedJobs','plannerCloseCompletedGap','plannerDropOrder','plannerInsertJob'])vm.runInNewContext(namedFunctionSource(name),context);
 return context;
}
const stackedJob=(id,time,extra={})=>({id,drop_time:time,booking_date:'2026-11-04',technician:'Alfie',estimated_hours:1,status:'booked',...extra});

test('completion closes the slot and preserves remaining order and durations',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00',{status:'completed'}),stackedJob('c','10:00',{estimated_hours:.5}),stackedJob('d','11:00')];
 const ctx=stackedPlanner(jobs);ctx.plannerCloseCompletedGap(jobs[1]);
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:00','09:00','09:30']);
 assert.equal(jobs[2].estimated_hours,.5);
});
test('dropping between jobs inserts and shifts neighbours instead of rejecting overlap',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00'),stackedJob('c','10:00')];const ctx=stackedPlanner(jobs);
 ctx.plannerInsertJob(jobs[2],'2026-11-04','Alfie',540);
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','10:00','09:00']);
 ctx.plannerInsertJob(jobs[0],'2026-11-04','Alfie',700);
 assert.deepEqual(jobs.map(j=>j.drop_time),['10:00','09:00','08:00']);
});
test('moving between mechanics closes the source gap and inserts into the destination',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00'),stackedJob('c','08:00',{technician:'Chris'})];const ctx=stackedPlanner(jobs);
 ctx.plannerInsertJob(jobs[0],'2026-11-04','Chris',550);
 assert.equal(jobs[1].drop_time,'08:00');assert.equal(jobs[0].technician,'Chris');assert.equal(jobs[0].drop_time,'09:00');
});
test('closing gaps respects mechanic time off and leaves other dates and mechanics alone',()=>{
 const jobs=[stackedJob('a','08:00',{status:'completed'}),stackedJob('b','10:00'),stackedJob('c','12:00',{technician:'Chris'}),stackedJob('d','12:00',{booking_date:'2026-11-05'})];const ctx=stackedPlanner(jobs);
 ctx.window.vectaTimeOffConflict=job=>ctx.clockMinutes(job.drop_time)<540?{}:null;
 ctx.plannerCloseCompletedGap(jobs[0]);
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:00','12:00','12:00']);
});

test('an impossible rearrangement leaves both mechanic lanes unchanged',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00'),stackedJob('c','08:00',{technician:'Chris'})];const ctx=stackedPlanner(jobs),before=JSON.stringify(jobs);
 ctx.window.vectaTimeOffConflict=()=>({});
 assert.throws(()=>ctx.plannerInsertJob(jobs[0],'2026-11-04','Chris',550),/available mechanic time/);
 assert.equal(JSON.stringify(jobs),before);
});

test('the completion path closes gaps only after the server accepts the completed job',()=>{
 const save=html.slice(html.indexOf('async function saveJob(id)'),html.indexOf('function prepareLinkedCustomerVehicleLocal(j)'));
 assert.ok(save.indexOf("if(savedResult===false)")<save.indexOf('plannerCloseCompletedGap(savedJobBeforeEdit||j)'));
 assert.match(save,/savedJobBeforeEdit&&!wasCompleted&&j.status==='completed'/);
 assert.match(save,/persistPlannerJobsInBackground\(completionShifted,'Close completed job gap'\)/);
});

test('a late first remaining job moves to 08:00 after completion',()=>{
 const jobs=[stackedJob('done','10:00',{status:'completed'}),stackedJob('next','11:00')],ctx=stackedPlanner(jobs);
 ctx.plannerCloseCompletedGap(jobs[0]);assert.equal(jobs[1].drop_time,'08:00');
});

test('inserting into an empty mechanic column starts at 08:00 even when dropped at 10:00',()=>{
 const jobs=[stackedJob('a','10:00',{technician:'Unallocated'})],ctx=stackedPlanner(jobs);
 ctx.plannerInsertJob(jobs[0],'2026-11-04','Alfie',600);assert.equal(jobs[0].drop_time,'08:00');
});

test('opening the current dashboard closes existing morning and internal gaps once',()=>{
 const jobs=[stackedJob('a','10:00'),stackedJob('b','12:00'),stackedJob('c','11:00',{technician:'Chris'})],ctx=stackedPlanner(jobs);
 let saves=0,persists=0;Object.assign(ctx,{plannerInteractionBusy:false,cloudRefreshBusy:false,selectedIso:()=> '2026-11-04',todayIso:()=> '2026-11-04',saveLocal:()=>saves++,persistPlannerJobsInBackground:()=>persists++,console});
 vm.runInNewContext(namedFunctionSource('plannerPackVisibleDay'),ctx);
 ctx.plannerPackVisibleDay();assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:00','08:00']);
 ctx.plannerPackVisibleDay();assert.equal(saves,1);assert.equal(persists,1);
 ctx.selectedIso=()=> '2026-11-03';jobs[0].drop_time='10:00';ctx.plannerPackVisibleDay();assert.equal(jobs[0].drop_time,'10:00');
});

test('a dashboard rendered during cloud refresh packs once the refresh finishes',()=>{
 const jobs=[stackedJob('a','10:00')],ctx=stackedPlanner(jobs);let callback,renders=0,timers=0;
 Object.assign(ctx,{plannerInteractionBusy:false,cloudRefreshBusy:true,plannerGapTimer:null,view:'planner',selectedIso:()=> '2026-11-04',todayIso:()=> '2026-11-04',saveLocal(){},persistPlannerJobsInBackground(){},render:()=>renders++,setTimeout:fn=>{callback=fn;timers++;return 1},console});
 vm.runInNewContext(namedFunctionSource('plannerPackVisibleDay'),ctx);
 ctx.plannerPackVisibleDay();ctx.plannerPackVisibleDay();assert.equal(timers,1);assert.equal(jobs[0].drop_time,'10:00');
 ctx.cloudRefreshBusy=false;callback();assert.equal(jobs[0].drop_time,'08:00');assert.equal(renders,1);
});


const fixedJob=(id,time,extra={})=>stackedJob(id,time,{customer_note:'[[VECTA_BOOKING_TIME:fixed]]',...extra});
test('next available is the first and default choice; stored fixed times reopen unchanged',()=>{
 const ctx={};vm.runInNewContext(namedFunctionSource('halfHourTimeSelect'),ctx);
 const fresh=ctx.halfHourTimeSelect('Booking time','drop_time','');
 assert.match(fresh,/<select[^>]*><option value="" selected>Next available space<\/option>/);
 for(const time of ['07:30','10:00','16:30']){
  const markup=ctx.halfHourTimeSelect('Booking time','drop_time',time);
  assert.match(markup,new RegExp('<option value="'+time+'" selected>'));
  assert.equal((markup.match(/ selected/g)||[]).length,1);
 }
});
test('booking mode survives serialisation and changing to next available preserves all other notes',()=>{
 const ctx=stackedPlanner([]),note='Call on arrival\n[[MOT_TIME:11:30]]\n[[VECTA_PRIVATE_PRICING:abc]]';
 const locked={customer_note:ctx.plannerBookingTimeNote(note,true)};
 assert.equal(ctx.plannerJobTimeLocked(JSON.parse(JSON.stringify(locked))),true);
 const flexible={customer_note:ctx.plannerBookingTimeNote(locked.customer_note,false)};
 assert.equal(ctx.plannerJobTimeLocked(flexible),false);assert.ok(flexible.customer_note.startsWith(note));
 assert.equal((flexible.customer_note.match(/VECTA_BOOKING_TIME/g)||[]).length,1);
});
test('completion and automatic gap closing reserve fixed appointments and fill gaps around them',()=>{
 const jobs=[stackedJob('done','08:00',{status:'completed'}),fixedJob('appointment','10:00'),stackedJob('a','12:00'),stackedJob('b','13:00'),stackedJob('c','14:00')];
 const ctx=stackedPlanner(jobs);ctx.plannerCloseCompletedGap(jobs[0]);
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','10:00','08:00','09:00','11:00']);
 assert.equal(ctx.plannerJobTimeLocked(jobs[1]),true);
 assert.equal(ctx.plannerPackOrderedJobs(ctx.plannerLaneActiveJobs('2026-11-04','Alfie'),480).length,0);
});
test('packing a lane preserves provisional slots displayed in the sidebar',()=>{
 const jobs=[stackedJob('flex','08:00',{estimated_hours:2}),stackedJob('hold','09:00',{status:'provisional'})];
 const ctx=stackedPlanner(jobs);ctx.plannerPackOrderedJobs(jobs,480);
 assert.deepEqual(jobs.map(j=>j.drop_time),['10:00','09:00']);
});
test('a flexible job that cannot fit before a fixed booking is placed after it',()=>{
 const jobs=[stackedJob('long','08:00',{estimated_hours:3}),fixedJob('appointment','10:00')];const ctx=stackedPlanner(jobs);
 ctx.plannerPackOrderedJobs(jobs,480);assert.deepEqual(jobs.map(j=>j.drop_time),['11:00','10:00']);assert.equal(jobs[0].estimated_hours,3);
});
test('packing respects both time off and several fixed appointments',()=>{
 const jobs=[fixedJob('first','09:00'),fixedJob('second','11:00'),stackedJob('work','15:00',{estimated_hours:2})];const ctx=stackedPlanner(jobs);
 ctx.window.vectaTimeOffConflict=j=>ctx.clockMinutes(j.drop_time)<540?{}:null;
 ctx.plannerPackOrderedJobs(jobs,480);assert.deepEqual(jobs.map(j=>j.drop_time),['09:00','11:00','12:00']);
});
test('declining a fixed drag leaves both lanes and every booking field unchanged',()=>{
 const jobs=[fixedJob('fixed','10:00'),stackedJob('other','12:00',{technician:'Chris'})],ctx=stackedPlanner(jobs),before=JSON.stringify(jobs);let asks=0;
 ctx.confirm=message=>{asks++;assert.match(message,/fixed at 10:00/);return false};
 assert.equal(ctx.plannerInsertJob(jobs[0],'2026-11-04','Chris',690).length,0);assert.equal(asks,1);assert.equal(JSON.stringify(jobs),before);
});
test('confirmed fixed drag keeps its new exact time through subsequent packing',()=>{
 const jobs=[fixedJob('fixed','10:00'),stackedJob('other','12:00')],ctx=stackedPlanner(jobs);let asks=0;
 ctx.confirm=()=>{asks++;return true};ctx.plannerInsertJob(jobs[0],'2026-11-04','Alfie',690);
 assert.equal(asks,1);assert.equal(jobs[0].drop_time,'11:30');assert.equal(ctx.plannerJobTimeLocked(jobs[0]),true);
 ctx.plannerPackOrderedJobs(jobs,480);assert.equal(jobs[0].drop_time,'11:30');
});
test('reordering a flexible booking cannot shift a fixed neighbour',()=>{
 const jobs=[stackedJob('a','08:00'),fixedJob('fixed','09:00'),stackedJob('b','10:00')],ctx=stackedPlanner(jobs);
 ctx.confirm=()=>{throw Error('A flexible booking must not ask to move the fixed neighbour')};
 ctx.plannerInsertJob(jobs[2],'2026-11-04','Alfie',480);assert.equal(jobs[1].drop_time,'09:00');assert.equal(jobs[2].drop_time,'08:00');assert.equal(jobs[0].drop_time,'10:00');
});
test('unchanged fixed bookings need no confirmation; date, technician and unlock changes do',()=>{
 const ctx=stackedPlanner([]),job=fixedJob('fixed','10:00');let asks=0;ctx.confirm=()=>{asks++;return false};
 assert.equal(ctx.plannerConfirmTimeMove(job,{...job,work_required:'New work'}),true);assert.equal(asks,0);
 for(const change of [{booking_date:'2026-11-05'},{technician:'Chris'},{drop_time:'11:00'},{customer_note:ctx.plannerBookingTimeNote(job.customer_note,false)}])assert.equal(ctx.plannerConfirmTimeMove(job,{...job,...change}),false);
 assert.equal(asks,4);
});
test('next available searches the first usable gap while explicitly chosen times bypass allocation',()=>{
 const jobs=[stackedJob('busy','08:00'),fixedJob('appointment','10:00')],ctx=stackedPlanner(jobs);
 for(const name of ['mechanicBookingIntervals','findNextMechanicSlot','shouldAutoAllocateJobSlot'])vm.runInNewContext(namedFunctionSource(name),ctx);
 const next=stackedJob('new','14:00',{customer_note:'[[VECTA_BOOKING_TIME:next]]'});
 const slot=ctx.findNextMechanicSlot(next,next.id);assert.equal(slot.drop_time,'09:00');assert.equal(slot.booking_date,next.booking_date);
 assert.equal(ctx.shouldAutoAllocateJobSlot(null,next),true);assert.equal(ctx.shouldAutoAllocateJobSlot(null,fixedJob('new','10:00')),false);
 assert.equal(ctx.shouldAutoAllocateJobSlot(fixedJob('new','14:00'),next),true);
});
test('phone assignment preserves fixed time and cancelling is side-effect free',()=>{
 const job=fixedJob('fixed','10:00'),ctx=stackedPlanner([job]);let updates=0;
 Object.assign(ctx,{findNextMechanicSlot:()=>{throw Error('Fixed time must not be auto-allocated')},updateJobQuick:()=>updates++,confirm:()=>false});
 vm.runInNewContext(namedFunctionSource('assignPlannerJob'),ctx);assert.equal(ctx.assignPlannerJob(job,'Chris','2026-11-05'),false);assert.equal(job.technician,'Alfie');assert.equal(updates,0);
 ctx.confirm=()=>true;assert.equal(ctx.assignPlannerJob(job,'Chris','2026-11-05'),true);assert.equal(job.drop_time,'10:00');assert.equal(job.technician,'Chris');assert.equal(updates,1);
});

function resizePlanner(jobs){
 const ctx=stackedPlanner(jobs);
 for(const name of ['plannerResizePlan','plannerResizeJob'])vm.runInNewContext(namedFunctionSource(name),ctx);
 return ctx;
}
test('extending a job through multiple slots shifts the following queue without changing its order',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00'),stackedJob('c','10:00'),stackedJob('d','11:00',{estimated_hours:.5})],ctx=resizePlanner(jobs);
 const changed=ctx.plannerResizeJob(jobs[1],{...jobs[1],estimated_hours:2.5});
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:00','11:30','12:30']);
 assert.deepEqual(jobs.map(j=>j.estimated_hours),[1,2.5,1,.5]);
 assert.deepEqual(Array.from(changed,j=>j.id),['b','c','d']);
});
test('shortening a job pulls all following jobs up and preserves unrelated records',()=>{
 const jobs=[stackedJob('a','08:00',{estimated_hours:2}),stackedJob('b','10:00'),stackedJob('c','11:00'),stackedJob('other','12:00',{technician:'Chris'}),stackedJob('tomorrow','12:00',{booking_date:'2026-11-05'}),stackedJob('done','08:00',{status:'completed'}),stackedJob('quote','08:00',{status:'quote'})],ctx=resizePlanner(jobs),untouched=JSON.stringify(jobs.slice(3));
 ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:.5});
 assert.deepEqual(jobs.slice(0,3).map(j=>j.drop_time),['08:00','08:30','09:30']);
 assert.equal(JSON.stringify(jobs.slice(3)),untouched);
});
test('resize previews and no-op gestures never mutate jobs',()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00')],ctx=resizePlanner(jobs),before=JSON.stringify(jobs);
 const preview=ctx.plannerResizePlan(jobs[0],{...jobs[0],estimated_hours:2});
 assert.deepEqual(Array.from(preview,j=>j.drop_time),['08:00','10:00']);
 assert.equal(ctx.plannerResizeJob(jobs[0],{...jobs[0]}).length,0);
 assert.equal(JSON.stringify(jobs),before);
});
test('resizing keeps fixed appointments and skips recorded mechanic time off',()=>{
 const jobs=[stackedJob('a','08:00'),fixedJob('fixed','10:00'),stackedJob('b','11:00')],ctx=resizePlanner(jobs);
 ctx.window.vectaTimeOffConflict=j=>{const start=ctx.clockMinutes(j.drop_time);return start<780&&start+j.estimated_hours*60>720?{}:null};
 ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:1.5});
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','10:00','11:00']);
 ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:3});
 assert.deepEqual(jobs.map(j=>j.drop_time),['13:00','10:00','16:00']);
});
test('a fixed job can grow into flexible jobs without moving its booked start',()=>{
 const jobs=[fixedJob('fixed','08:00'),stackedJob('a','09:00'),stackedJob('b','10:00')],ctx=resizePlanner(jobs);
 ctx.confirm=()=>{throw Error('Duration-only change needs no time confirmation')};
 ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:2});
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','10:00','11:00']);
});
test('a resize cannot overlap two fixed appointments or partially move jobs on failure',()=>{
 const jobs=[fixedJob('first','08:00'),fixedJob('second','09:00'),stackedJob('a','10:00')],ctx=resizePlanner(jobs),before=JSON.stringify(jobs);
 assert.throws(()=>ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:2}),/fixed booking/);
 ctx.window.vectaTimeOffConflict=()=>({});
 assert.throws(()=>ctx.plannerResizeJob(jobs[2],{...jobs[2],estimated_hours:2}),/available mechanic time/);
 assert.equal(JSON.stringify(jobs),before);
});
test('declining a top-edge change to a fixed appointment leaves the queue untouched',()=>{
 const jobs=[fixedJob('fixed','10:00'),stackedJob('a','11:00')],ctx=resizePlanner(jobs),before=JSON.stringify(jobs);
 ctx.confirm=()=>false;
 assert.equal(ctx.plannerResizeJob(jobs[0],{...jobs[0],drop_time:'09:30',estimated_hours:1.5}).length,0);
 assert.equal(JSON.stringify(jobs),before);
});
test('a full lane stays on the same day when resize pushes its last job beyond closing time',()=>{
 const jobs=Array.from({length:9},(_,i)=>stackedJob(String(i),String(8+i).padStart(2,'0')+':00')),ctx=resizePlanner(jobs);
 ctx.plannerResizeJob(jobs[0],{...jobs[0],estimated_hours:2});
 assert.equal(jobs[8].drop_time,'17:00');assert.ok(jobs.every(j=>j.booking_date==='2026-11-04'));
});

function resizeGesture(){
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00')],ctx=resizePlanner(jobs),events={},writes=[];
 const handle={addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name],setPointerCapture(){},releasePointerCapture(){}};
 const classList={add(){},remove(){}};
 const cards=jobs.map(j=>({dataset:{jobId:j.id},style:{setProperty(){}},classList,querySelector:selector=>j.id==='a'&&selector==='.resizeHandle'?handle:null}));
 cards[0].parentElement={querySelectorAll:()=>cards};
 Object.assign(ctx,{PLANNER_PX_PER_HOUR:100,minutesFromTime:ctx.clockMinutes,topFor:j=>(ctx.clockMinutes(j.drop_time)-480)/60*100,heightFor:j=>j.estimated_hours*100,document:{body:{classList}},setTimeout(){},render(){},saveLocal:()=>writes.push('local'),persistPlannerJobsInBackground:rows=>writes.push(Array.from(rows,j=>({...j}))),showPlannerAvailabilityNotice:message=>writes.push(message)});
 vm.runInNewContext(namedFunctionSource('bindResize'),ctx);ctx.bindResize(cards[0]);
 const event=y=>({button:0,pointerId:1,clientY:y,preventDefault(){},stopPropagation(){}});
 handle.onpointerdown(event(100));
 return {jobs,ctx,events,writes,cards,event};
}
test('pointer resize previews the queue and saves the resized job plus every shifted job together',()=>{
 const g=resizeGesture();g.events.pointermove(g.event(200));
 assert.equal(g.cards[0].style.height,'200px');assert.equal(g.cards[1].style.top,'200px');
 assert.equal(g.jobs[0].estimated_hours,1);assert.equal(g.jobs[1].drop_time,'09:00');
 g.events.pointerup(g.event(200));
 assert.equal(g.jobs[0].estimated_hours,2);assert.equal(g.jobs[1].drop_time,'10:00');
 assert.equal(g.writes[0],'local');assert.deepEqual(g.writes[1].map(j=>j.id),['a','b']);
 assert.deepEqual(Object.keys(g.events),[]);assert.equal(g.ctx.plannerInteractionBusy,false);
});
test('pointer cancellation and dragging back to the original size never save preview changes',()=>{
 for(const cancel of [true,false]){
  const g=resizeGesture(),before=JSON.stringify(g.jobs);g.events.pointermove(g.event(200));
  if(cancel)g.events.pointercancel(g.event(200));
  else{g.events.pointermove(g.event(100));assert.equal(g.cards[1].style.top,'100px');g.events.pointerup(g.event(100))}
  assert.equal(JSON.stringify(g.jobs),before);assert.deepEqual(g.writes,[]);assert.deepEqual(Object.keys(g.events),[]);
 }
});

test('ordinary job-card edits including preset duration changes do not ask for a new slot',()=>{
 const original=stackedJob('a','08:00'),ctx=stackedPlanner([original]);
 vm.runInNewContext(namedFunctionSource('shouldAutoAllocateJobSlot'),ctx);
 for(const edit of [{work_required:'New instructions'},{amount_quoted:80},{customer_email:'test@example.invalid'},{estimated_hours:2},{estimated_hours:.25},{job_type:'Tyres || MOT',estimated_hours:1.25}]){
  assert.equal(ctx.shouldAutoAllocateJobSlot(original,{...original,...edit}),false,JSON.stringify(edit));
 }
 for(const edit of [{booking_date:'2026-11-05'},{technician:'Chris'},{drop_time:'14:00'}])assert.equal(ctx.shouldAutoAllocateJobSlot(original,{...original,...edit}),true);
 assert.equal(ctx.shouldAutoAllocateJobSlot(null,original),true);
 assert.equal(ctx.shouldAutoAllocateJobSlot({...original,technician:'Unallocated',booking_date:null},original),true);
 assert.equal(ctx.shouldAutoAllocateJobSlot(original,{...original,customer_note:'[[VECTA_BOOKING_TIME:fixed]]',drop_time:'10:00'}),false);
});

function jobSavePlanner(jobs,editedIndex,changes){
 const ctx=stackedPlanner(jobs),previous=JSON.parse(JSON.stringify(jobs[editedIndex])),writes=[],scheduled=[];
 Object.assign(ctx,{
  document:{getElementById:()=>null,querySelector:()=>null},localStorage:{setItem(){}},console,
  gatherJob:()=>({...previous,...changes}),privatePricingItemsFromNote:()=>[],
  vectaConfirmDuplicateBooking:async()=>true,isUuid:()=>true,isWebsiteBookingJob:()=>false,isUnresolvedWebsiteService:()=>false,isVehicleTaxJob:()=>false,
  prepareLinkedCustomerVehicleLocal:()=>null,syncTaskFromMiniJob(){},ensureContractorSavedFromJob(){},invalidateFinanceDashboardCache(){},saveLocal(){},closeModals(){},
  syncSavedJobBundleInBackground:async job=>{writes.push({...job});return true;},
  alert:message=>{throw Error(message);},selectedIso:()=>previous.booking_date,todayIso:()=>previous.booking_date,plannerInteractionBusy:false,cloudRefreshBusy:false,
  persistPlannerJobsInBackground:rows=>scheduled.push(...rows.map(row=>({...row}))),
  render:()=>ctx.plannerPackVisibleDay(),
  findNextMechanicSlot:()=>{throw Error('Ordinary edits must not search for a new planner slot');}
 });
 ctx.app.customers=[];ctx.app.vehicles=[];
 ctx.window.__vectaJobEditorBaseline={id:previous.id,job:previous};
 for(const name of ['plannerCompactLane','plannerPackVisibleDay','shouldAutoAllocateJobSlot'])vm.runInNewContext(namedFunctionSource(name),ctx);
 vm.runInNewContext('var plannerGapTimer=null;async '+namedFunctionSource('saveJob'),ctx);
 return {ctx,writes,scheduled,previous};
}

test('saving a longer top job retains first place and shifts following jobs in order',async()=>{
 const jobs=[stackedJob('a','08:00',{customer_account:'Staff',work_required:'MOT',amount_quoted:65}),stackedJob('b','09:00'),stackedJob('c','10:00')];
 const {ctx,writes,scheduled}=jobSavePlanner(jobs,0,{work_required:'MOT and tyre replacement',job_type:'MOT || Tyres',estimated_hours:1.5});
 assert.equal(await ctx.saveJob('a'),true);
 assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:30','10:30']);
 assert.deepEqual(Array.from(ctx.plannerLaneActiveJobs('2026-11-04','Alfie'),j=>j.id),['a','b','c']);
 assert.equal(writes[0].drop_time,'08:00');assert.equal(writes[0].estimated_hours,1.5);
 assert.deepEqual(scheduled.map(j=>j.id),['b','c']);
});

test('saving a shorter middle job keeps its place and pulls only the following queue up',async()=>{
 const jobs=[stackedJob('a','08:00'),stackedJob('b','09:00',{customer_account:'Staff',work_required:'Service',estimated_hours:2}),stackedJob('c','11:00'),stackedJob('other','08:00',{technician:'Chris'}),stackedJob('tomorrow','08:00',{booking_date:'2026-11-05'})];
 const untouched=JSON.stringify(jobs.slice(3)),{ctx,scheduled}=jobSavePlanner(jobs,1,{estimated_hours:.5,work_required:'Shorter amended work'});
 assert.equal(await ctx.saveJob('b'),true);
 assert.deepEqual(jobs.slice(0,3).map(j=>j.drop_time),['08:00','09:00','09:30']);
 assert.equal(JSON.stringify(jobs.slice(3)),untouched);assert.deepEqual(scheduled.map(j=>j.id),['c']);
});

test('description-only job save keeps every planner position unchanged',async()=>{
 const jobs=[stackedJob('a','08:00',{customer_account:'Staff',work_required:'Original instructions'}),stackedJob('b','09:00'),stackedJob('c','10:00')];
 const {ctx,scheduled}=jobSavePlanner(jobs,0,{work_required:'Updated instructions'});
 assert.equal(await ctx.saveJob('a'),true);assert.deepEqual(jobs.map(j=>j.drop_time),['08:00','09:00','10:00']);assert.deepEqual(scheduled,[]);
});
