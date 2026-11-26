import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {parseHTML} from 'linkedom';
import {requestGarageCode,verifyGarageCode,garageAccount,garageHash} from '../../lib/customer-garage-auth.js';
import {garageNevosStatus,garageDay,annualServiceDate,firstGarageMotDate,garageServiceSchedule,garageSnapshot,publicVehicleData,accountJobs,garageHistory,garageHistoryReport,garageDocument,customerGarageAction,loyaltyFromInvoices,garageRewards} from '../../lib/customer-garage.js';
import {garageReminderItems,runGarageAlerts,refreshGarageDueDates} from '../../lib/customer-garage-alerts.js';
import {serviceSheetSections,customerServicePdf} from '../../lib/customer-service-pdf.js';
const account={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.com',name:'Alex',phone:'07700000000'};
const vehicle={id:'22222222-2222-4222-8222-222222222222',account_id:account.id,registration:'AB12CDE',vehicle_data:{},nickname:'',reminders:true};
const job={id:'33333333-3333-4333-8333-333333333333',registration:'AB12 CDE',customer_email:account.email,booking_date:'2026-11-14',status:'completed',job_type:'Full Service',source:'Staff'};
const now=Date.parse('2026-11-15T13:00:00Z');
function environment(patch={}){const values={VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app',VITE_SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test-key',...patch},old={};for(const key in values){old[key]=process.env[key];process.env[key]=values[key];}return()=>{for(const key in values)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];};}
function database(initial={}){
 const tables={customer_garage_accounts:[{...account}],customer_garage_sessions:[],customer_garage_challenges:[],customer_garage_vehicles:[{...vehicle}],customer_garage_push:[],customer_app_subscriptions:[],customer_portal_events:[],customers:[],jobs:[{...job}],invoices:[],workshop_settings:[],...structuredClone(initial)},writes=[];
 const db=async(path,options={})=>{
  const [table,query]=path.split('?'),p=new URLSearchParams(query);assert.ok(tables[table],table);const rows=tables[table];
  const matches=row=>[...p].every(([key,value])=>{if(['select','order','offset','limit','on_conflict','or'].includes(key))return true;const dot=value.indexOf('.'),op=value.slice(0,dot),v=value.slice(dot+1),actual=row[key];if(op==='eq')return String(actual)===v;if(op==='is')return v==='null'?actual==null:false;if(op==='gt')return actual>v;if(op==='gte')return actual>=v;if(op==='lt')return actual<v;if(op==='lte')return actual<=v;if(op==='in')return v.slice(1,-1).split(',').includes(String(actual));if(op==='ilike'){const pattern=v.replace(/\\([_%])/g,'$1').replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*');return new RegExp('^'+pattern+'$','i').test(String(actual||''));}throw Error(op);});
  if(options.method){const body=options.body?JSON.parse(options.body):null;writes.push({table,method:options.method,body});if(options.method==='POST'){const conflict=p.get('on_conflict');const exists=conflict&&rows.find(r=>r[conflict]===body[conflict]);if(exists){if(options.headers?.Prefer?.includes('ignore-duplicates'))return [];Object.assign(exists,body);return [structuredClone(exists)];}const row={id:randomUUID(),attempts:0,created_at:new Date(now).toISOString(),...body};rows.push(row);return [structuredClone(row)];}const chosen=rows.filter(matches);if(options.method==='PATCH'){chosen.forEach(r=>Object.assign(r,body));return structuredClone(chosen);}if(options.method==='DELETE'){tables[table]=rows.filter(r=>!matches(r));return structuredClone(chosen);}throw Error(options.method);}
  let result=rows.filter(matches);const order=p.get('order');if(order){const [key,dir]=order.split('.');result.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(dir==='desc'?-1:1));}return structuredClone(result.slice(Number(p.get('offset')||0),Number(p.get('offset')||0)+Number(p.get('limit')||100000)));
 };return {db,tables,writes};
}
function signedDatabase(extra={}){const session='s'.repeat(43),store=database({customer_garage_sessions:[{token_hash:garageHash(session),account_id:account.id,expires_at:'2027-05-20T00:00:00Z'}],...extra});return {...store,session};}
test('email challenge is single use; sessions are hashed and email is verified',async()=>{const restore=environment();try{const {db,tables}=database();let mail;const challenge=await requestGarageCode(db,' OWNER@example.com ',{now,send:async value=>{mail=value;}});assert.equal(tables.customer_garage_challenges[0].email,account.email);assert.notEqual(tables.customer_garage_challenges[0].code_hash,mail.code);const issued=await verifyGarageCode(db,{challenge:challenge.challenge,code:mail.code},{now});assert.equal(issued.session.length,43);assert.notEqual(tables.customer_garage_sessions[0].token_hash,issued.session);assert.equal((await garageAccount(db,issued.session,{now})).email,account.email);await assert.rejects(verifyGarageCode(db,{challenge:challenge.challenge,code:mail.code},{now}),/expired/);await assert.rejects(garageAccount(db,issued.session,{now:now+200*86400000}),/sign in/i);}finally{restore();}});
test('five wrong codes lock challenge; expired codes and hourly email abuse are refused',async()=>{const restore=environment();try{const {db,tables}=database();let code;const c=await requestGarageCode(db,account.email,{now,send:async m=>{code=m.code;}});const wrong=code==='000000'?'111111':'000000';for(let i=0;i<5;i++)await assert.rejects(verifyGarageCode(db,{challenge:c.challenge,code:wrong},{now}));await assert.rejects(verifyGarageCode(db,{challenge:c.challenge,code},{now}),/expired/);for(let i=1;i<5;i++)await requestGarageCode(db,account.email,{now:now+i*60000,send:async()=>{}});await assert.rejects(requestGarageCode(db,account.email,{now:now+5*60000,send:async()=>{}}),/Too many/);assert.equal(tables.customer_garage_sessions.length,0);}finally{restore();}});
test('preview blocks sign-in emails, pushes and official vehicle refresh',async()=>{const restore=environment({VERCEL_ENV:'preview'});try{const bad=()=>{throw Error('No IO permitted');};await assert.rejects(requestGarageCode(bad,account.email,{send:bad}),/preview/);assert.deepEqual(await runGarageAlerts(bad,{send:bad}),{disabled:true});await refreshGarageDueDates(bad,{lookup:bad});}finally{restore();}});
test('family vehicle management cannot access another account or delete workshop records',async()=>{const restore=environment();try{const {db,tables,session,writes}=signedDatabase();await assert.rejects(customerGarageAction(db,{action:'garage-remove',session,vehicle_id:randomUUID()},{now}),/not in your garage/);await customerGarageAction(db,{action:'garage-add',session,registration:'FG34 HIJ',family:true,nickname:'Family car'},{now,lookup:async()=>({vehicle:'Nissan Qashqai',mot_tests:[]})});assert.equal(tables.customer_garage_vehicles[1].family,true);await assert.rejects(customerGarageAction(db,{action:'garage-add',session,registration:'FG34HIJ'},{now}),/already/);await customerGarageAction(db,{action:'garage-remove',session,vehicle_id:vehicle.id},{now});assert.equal(tables.jobs.length,1);assert.ok(writes.every(w=>!['jobs','invoices','workshop_settings'].includes(w.table)));}finally{restore();}});
test('same registration does not grant private job or document access',async()=>{const {db}=database({jobs:[{...job,customer_email:'somebody@example.com'}],invoices:[{id:randomUUID(),job_id:job.id,registration:vehicle.registration,status:'paid'}],workshop_settings:[{id:'service:'+vehicle.registration,value:{registration:vehicle.registration,job_id:job.id,html:'<div class="servicePrint">Private</div>'}}]});assert.equal((await accountJobs(db,account,{registration:vehicle.registration})).length,0);await assert.rejects(garageDocument(db,account,vehicle,{type:'service',document_id:'service:'+vehicle.registration}),/unavailable/);});
test('customer-id fallback only authorises jobs without a conflicting email',async()=>{const id=randomUUID(),{db}=database({customers:[{id,email:account.email}],jobs:[{...job,customer_id:id,customer_email:'different@example.com'},{...job,id:randomUUID(),customer_id:id,customer_email:null}]});const jobs=await accountJobs(db,account);assert.equal(jobs.length,1);assert.equal(jobs[0].customer_email,null);});
test('history excludes mismatched canonical sheets and draft or wrong-vehicle invoices',async()=>{const good='service:'+vehicle.registration+':'+job.id,{db}=database({workshop_settings:[{id:good,value:{registration:vehicle.registration,job_id:job.id,html:'<div class="servicePrint">Own</div>'}},{id:'service:'+vehicle.registration,value:{registration:vehicle.registration,job_id:randomUUID(),html:'Other'}}],invoices:[{id:randomUUID(),job_id:job.id,registration:vehicle.registration,status:'draft'},{id:randomUUID(),job_id:job.id,registration:'ZZ99ZZZ',status:'paid'}]});const result=await garageHistory(db,account,vehicle);assert.equal(result.bookings[0].documents.length,1);assert.equal(result.bookings[0].documents[0].id,good);});
test('vehicle dates reject invalid dates; leap service dates clamp and API exposes only public fields',()=>{for(const value of ['2026-99-99','2026-02-30','tomorrow','2026-1-2'])assert.equal(garageDay(value),null);assert.equal(annualServiceDate('2024-02-29'),'2025-02-28');const data=publicVehicleData({customer_email:'private',motExpiryDate:'2027-01-05',motTests:[{completedDate:'2026.01.05',testResult:'PASSED',defects:[{type:'ADVISORY',text:'Tyre worn'}]}]});assert.equal(data.customer_email,undefined);assert.equal(data.mot_due,'2027-01-05');assert.equal(data.mot_tests[0].defects[0].type,'ADVISORY');assert.equal(data.mot_tests[0].date,'2026-01-05');});
test('reminders cover all four types, respect preference, SORN and existing bookings',()=>{const v={...vehicle,mot_due:'2026-11-22',tax_due:'2026-11-16',service_due:'2026-11-15',insurance_due:'2026-11-14'};const items=garageReminderItems([v],{now});assert.deepEqual(items.map(i=>i.bucket),[7,1,0,0]);assert.equal(new Set(items.map(i=>i.key)).size,4);assert.equal(garageReminderItems([{...v,reminders:false}],{now}).length,0);assert.equal(garageReminderItems([{...v,vehicle_data:{tax_status:'SORN'},upcoming:[{date:'2026-11-20',work:'MOT'}]}],{now}).length,2);});
test('service PDF uses inert saved selections and does not claim unticked checks were completed',async()=>{const record={registration:'AB12CDE',title:'Full Service',service_date:'2026-11-14',html:'<div class="servicePrint"><section class="ssSection"><h2 class="ssTitle">Brakes</h2><table><tr><td>Pads</td><td><span class="ssCheck selected"></span></td><td><span class="ssCheck"></span></td><td><i class="ssRagDot green"></i><i class="ssRagDot amber selected"></i><i class="ssRagDot red"></i></td></tr></table><script>secret()</script></section></div>'};const text=JSON.stringify(serviceSheetSections(record));assert.match(text,/Ticked/);assert.match(text,/Not ticked/);assert.match(text,/Amber/);assert.doesNotMatch(text,/Completed|secret/);const pdf=await customerServicePdf(record);assert.equal(Buffer.from(pdf).subarray(0,4).toString(),'%PDF');});
test('all garage tables require service role; direct client access is denied',async()=>{const db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(fs.readFileSync('supabase/migrations/20261115192103_customer_garage_accounts.sql','utf8'));const rows=(await db.query("select relname,relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon,has_table_privilege('authenticated',oid,'INSERT') authenticated,has_table_privilege('service_role',oid,'SELECT') service from pg_class where relname like 'customer_garage_%' and relkind='r'")).rows;assert.equal(rows.length,5);for(const row of rows){assert.equal(row.relrowsecurity,true);assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);}}finally{await db.close();}});
test('embedded website accepts prefill only from its same-origin parent for the selected car, once',()=>{const listeners={},sent=[],form={registration:'AB12 CDE'},parent={postMessage:(...args)=>sent.push(args)},window={parent,location:{origin:'https://www.vectamotors.co.uk',search:'?app=1'},addEventListener:(n,fn)=>listeners[n]=fn,removeEventListener(){}};vm.runInNewContext(fs.readFileSync('public/js/vecta-garage-booking.js','utf8'),{window,URLSearchParams});let renders=0;const bridge=window.VectaGarageBooking.connect({getForm:()=>form,render:()=>renders++}),data={type:'vecta-garage-prefill',registration:'AB12CDE',profile:{name:'Alex',email:account.email,phone:'07700000000'}};listeners.message({origin:'https://bad.test',source:parent,data});listeners.message({origin:window.location.origin,source:{},data});listeners.message({origin:window.location.origin,source:parent,data:{...data,registration:'XX99XXX'}});assert.equal(renders,0);listeners.message({origin:window.location.origin,source:parent,data});assert.equal(form.customer_name,'Alex');assert.equal(form.email,account.email);form.customer_name='Edited';listeners.message({origin:window.location.origin,source:parent,data});assert.equal(form.customer_name,'Edited');bridge.confirmed();assert.equal(sent[0][0].type,'vecta-booking-ready');assert.equal(sent[1][0].type,'vecta-booking-confirmed');});
test('garage alert delivery retries failures, sends due bucket once, and ignores historic collection states',async()=>{const restore=environment();try{const push={id:'push',account_id:account.id,last_seq:'0',ready_jobs:[],reminder_receipts:{},next_check_at:new Date(now-1000).toISOString(),subscription:{endpoint:'https://web.push.apple.com/example'}},oldJob={...job,booking_date:'2026-01-01'};const {db,tables}=database({jobs:[oldJob],customer_garage_push:[push],customer_garage_vehicles:[{...vehicle,tax_due:'2026-11-16',refresh_after:'2026-11-16T00:00:00Z'}]});let calls=0;await runGarageAlerts(db,{now,send:async()=>{calls++;throw Error('transient');}});assert.equal(calls,1);assert.deepEqual(tables.customer_garage_push[0].reminder_receipts,{});const sent=[];await runGarageAlerts(db,{now:now+301000,send:async(s,p)=>sent.push(p)});assert.equal(sent.length,1);assert.match(sent[0].body,/Vehicle tax/);assert.doesNotMatch(sent[0].body,/ready to collect|AB12|owner@/);await runGarageAlerts(db,{now:now+602000,send:async(s,p)=>sent.push(p)});assert.equal(sent.length,1);}finally{restore();}});
test('manual MOT/tax dates survive official refresh; deleted cars are absent from refresh queue',async()=>{const restore=environment();try{const {db,tables}=database({customer_garage_vehicles:[{...vehicle,mot_due:'2027-03-01',tax_due:'2027-02-01',mot_manual:true,tax_manual:false,refresh_after:'2026-11-01T00:00:00Z'}]});let calls=0;await refreshGarageDueDates(db,{now,lookup:async()=>{calls++;return {mot_due:'2027-06-01',tax_due:'2027-07-01'};}});assert.equal(tables.customer_garage_vehicles[0].mot_due,'2027-03-01');assert.equal(tables.customer_garage_vehicles[0].tax_due,'2027-07-01');tables.customer_garage_vehicles=[];await refreshGarageDueDates(db,{now:now+86400000,lookup:async()=>{calls++;}});assert.equal(calls,1);}finally{restore();}});
test('prefill uses verified saved account details, never the selected vehicle’s former owner',async()=>{const restore=environment();try{const {db,session}=signedDatabase({jobs:[{...job,customer_name:'Someone else',customer_phone:'0123456789',customer_email:'different@example.com'}],customers:[{id:randomUUID(),name:'Former owner',phone:'0123456789',email:'different@example.com'}]});const result=await customerGarageAction(db,{action:'garage-booking-prefill',session,vehicle_id:vehicle.id},{now});assert.deepEqual(result.profile,{name:account.name,phone:account.phone,email:account.email});assert.equal(result.registration,vehicle.registration);}finally{restore();}});


test('full history export pages through own records and excludes another customer’s work',async()=>{const jobs=Array.from({length:115},(_,i)=>({...job,id:randomUUID(),work_required:'Own recorded visit '+i}));jobs.push({...job,id:randomUUID(),customer_email:'another@example.com',work_required:'PRIVATE FORMER OWNER WORK'});const {db}=database({jobs});let rendered;const result=await garageHistoryReport(db,account,{...vehicle,vehicle_data:{mot_tests:[{date:'2026-06-12',result:'PASSED',mileage:'42150',unit:'mi',defects:[{type:'ADVISORY',text:'Tyre worn'}]}]}},{now,renderPdf:async record=>{rendered=record;return Buffer.from('%PDF-test');}});assert.match(rendered.html,/115 visits/);assert.match(rendered.html,/Own recorded visit 114/);assert.doesNotMatch(rendered.html,/PRIVATE FORMER/);assert.match(rendered.html,/ADVISORY: Tyre worn/);assert.match(rendered.html,/42150/);assert.equal(result.filename,'Vecta-AB12CDE-history.pdf');});

const loyaltyDates={startsOn:'2026-11-01',today:'2026-11-15'};
const loyaltyInvoice=(patch={})=>({id:randomUUID(),job_id:job.id,registration:vehicle.registration,status:'saved',payment_method:'card',total:100,invoice_number:'123',lines:[{invoice_paid_date:'2026-11-10'}],...patch});
test('5% loyalty uses paid inclusive totals, counts MOT and small visits, and deduplicates invoice IDs',()=>{
 const invoice=loyaltyInvoice({total:199.99}),result=loyaltyFromInvoices([job],[invoice,invoice],loyaltyDates);
 assert.equal(result.paid_spend_pence,19999);assert.equal(result.earned_bonus_pence,1000);assert.equal(result.payments.length,1);
 assert.equal(loyaltyFromInvoices([{...job,job_type:'MOT'}],[loyaltyInvoice({total:50})],loyaltyDates).earned_bonus_pence,250);
 assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice({total:0.10})],loyaltyDates).earned_bonus_pence,1);
 for(const method of ['card','cash','bacs'])assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice({payment_method:method,total:90})],loyaltyDates).earned_bonus_pence,450);
});
test('loyalty excludes unpaid, incomplete, cancelled, refunded, corporate and mismatched records',()=>{
 for(const change of [{status:'cancelled'},{status:'booked'},{source:'NMUK'},{source:'Contractor'},{deleted_at:'2026-11-12'}])assert.equal(loyaltyFromInvoices([{...job,...change}],[loyaltyInvoice()],loyaltyDates).earned_bonus_pence,0);
 for(const change of [{payment_method:''},{status:'draft'},{status:'part_paid'},{status:'refunded'},{status:'part_refunded'},{status:'void'},{fleet_customer:'Company'},{source:'fleet_eom'},{eom_month:'2026-11'},{registration:'XY12ZZZ'},{job_id:randomUUID()}])assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice(change)],loyaltyDates).earned_bonus_pence,0);
 assert.throws(()=>loyaltyFromInvoices([job],[loyaltyInvoice({total:'not a price'})],loyaltyDates),/workshop check/);
});
test('loyalty uses confirmed payment dates from launch, never invoice dates or update times',()=>{
 for(const date of ['', '2026-10-31','2026-11-16','2026-02-30'])assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice({lines:[{invoice_paid_date:date}],invoice_date:'2026-11-10',updated_at:'2026-11-10T10:00:00Z'})],loyaltyDates).earned_bonus_pence,0);
 for(const date of ['2026-11-01','2026-11-15'])assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice({lines:[{invoice_paid_date:date}],invoice_date:'2026-01-01'})],loyaltyDates).earned_bonus_pence,500);
 assert.equal(loyaltyFromInvoices([job],[loyaltyInvoice({lines:[{invoice_paid_date:'2026-11-01'},{invoice_paid_date:'2026-11-02'}]})],loyaltyDates).earned_bonus_pence,0);
});
test('loyalty stays at zero before launch and reads only the verified customer’s paid invoices',async()=>{
 const invoice=loyaltyInvoice(),otherJob={...job,id:randomUUID(),customer_email:'other@example.com'},config={id:'customer_loyalty_v1',value:{starts_on:'2026-11-01'}};
 const pending=database({invoices:[invoice]});let result=await garageRewards(pending.db,account,{now});assert.equal(result.active,false);assert.equal(result.earned_bonus_pence,0);assert.equal(result.rate_percent,5);
 const active=database({workshop_settings:[config],jobs:[job,otherJob],invoices:[invoice,loyaltyInvoice({job_id:otherJob.id,total:900})]});result=await garageRewards(active.db,account,{now});assert.equal(result.active,true);assert.equal(result.earned_bonus_pence,500);assert.equal(result.paid_spend_pence,10000);assert.equal(result.payments.length,1);assert.equal(result.redemption_enabled,false);assert.deepEqual(active.writes,[]);
 const future=database({workshop_settings:[{...config,value:{starts_on:'2027-01-01'}}],invoices:[invoice]});assert.equal((await garageRewards(future.db,account,{now})).active,false);
});

test('loyalty offer is visible without signing in and sign-out removes the private bonus',async()=>{
 const boot=(signedIn=false)=>{
  const {document,window:dom}=parseHTML(fs.readFileSync('public/app/home.html','utf8')),requests=[],$=id=>document.getElementById(id);
  let focused=false;
  $('modal').close=()=>{};$('signin').scrollIntoView=()=>{};$('email').focus=()=>{focused=true;};
  const context={document,window:{addEventListener(){}},navigator:{onLine:true,userAgent:'test',platform:'test'},matchMedia:()=>({matches:false}),localStorage:{getItem:()=>signedIn?'session':null,removeItem(){}},requestAnimationFrame:fn=>fn(),AbortSignal,setTimeout,clearTimeout,URL,URLSearchParams,fetch:async(url,options)=>{const {action}=JSON.parse(options.body);requests.push(action);return {ok:true,json:async()=>action==='garage-status'?{email:'owner@example.com',vehicles:[],suggestions:[],profile:{name:'Alex'}}:action==='garage-rewards'?{active:true,starts_on:'2026-11-01',earned_bonus_pence:1250,paid_spend_pence:25000,payments:[],terms:'5%'}:{ok:true}};}};
  vm.runInNewContext(fs.readFileSync('public/app/garage.js','utf8'),context);
  return {$,document,dom,requests,focused:()=>focused};
 };
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const guest=boot();await flush();
 assert.equal(guest.$('loyaltyBox').closest('[hidden]'),null);
 assert.equal(guest.$('loyaltyAmount').textContent,'5%');
 assert.equal(guest.$('accountFooter').hidden,true);
 guest.$('viewLoyalty').onclick({currentTarget:guest.$('viewLoyalty')});
 assert.equal(guest.focused(),true);assert.deepEqual(guest.requests,[]);
 const customer=boot(true);await flush();
 assert.equal(customer.$('loyaltyBox').closest('[hidden]'),null);
 assert.equal(customer.$('loyaltyAmount').textContent,'£12.50');
 customer.$('viewLoyalty').onclick({currentTarget:customer.$('viewLoyalty')});await flush();
 assert.equal(customer.$('view-rewards').hidden,false);
 assert.equal(customer.$('loyaltyBox').hidden,true);
 customer.$('signout').onclick({currentTarget:customer.$('signout')});await flush();
 assert.equal(customer.$('loyaltyBox').closest('[hidden]'),null);
 assert.equal(customer.$('loyaltyAmount').textContent,'5%');
 assert.equal(customer.$('accountFooter').hidden,true);
 assert.doesNotMatch(customer.document.body.textContent,/£12\.50/);
});


test('new cars get a calculated first MOT while official MOT and tax dates take precedence',()=>{
 const raw={firstUsedDate:'2024-11-28',motTests:[],taxDueDate:'2027-11-01'};
 const data=publicVehicleData(raw);assert.equal(data.mot_due,'2027-11-27');assert.equal(data.tax_due,'2027-11-01');assert.match(data.mot_date_source,/calculated/);
 assert.equal(publicVehicleData({...raw,motExpiryDate:'2027-06-03'}).mot_due,'2027-06-03');
 assert.equal(publicVehicleData({...raw,motExpiryDate:'bad',dvlaMotExpiryDate:'2027-06-04'}).mot_due,'2027-06-04');
 assert.equal(publicVehicleData({...raw,motTests:[{testResult:'FAILED'}]}).mot_due,null);
 assert.equal(publicVehicleData({...raw,lookupPartial:true}).mot_due,null);
 assert.equal(publicVehicleData({...raw,dvlaMotStatus:'Exempt'}).mot_due,null);
 assert.equal(firstGarageMotDate('2024-02-30'),null);assert.equal(firstGarageMotDate('2024-02-29'),'2027-02-28');
});
test('adding a new car saves looked-up dates immediately, including its first MOT reminder',async()=>{
 const {db,tables,session}=signedDatabase({customer_garage_vehicles:[]});
 await customerGarageAction(db,{action:'garage-add',session,registration:'AB12 CDE'},{now,lookup:async()=>publicVehicleData({firstUsedDate:'2024-11-28',taxDueDate:'2027-11-01',fetchedAt:new Date(now).toISOString()})});
 assert.equal(tables.customer_garage_vehicles[0].mot_due,'2027-11-27');assert.equal(tables.customer_garage_vehicles[0].tax_due,'2027-11-01');
});
test('service reminder follows the nearest active booking, rescheduling and completed visit date',()=>{
 const booked={...job,status:'booked',booking_date:'2026-11-20'},options={today:'2026-11-16'};
 let schedule=garageServiceSchedule(vehicle,[job,{...booked,booking_date:'2026-11-30'},booked],options);
 assert.equal(schedule.service_due,'2026-11-20');assert.equal(schedule.service_booked,true);
 assert.equal(garageServiceSchedule(vehicle,[job,{...booked,booking_date:'2026-11-25'}],options).service_due,'2026-11-25');
 for(const status of ['cancelled','canceled','provisional'])assert.equal(garageServiceSchedule(vehicle,[job,{...booked,status}],options).service_due,'2027-11-14');
 assert.equal(garageServiceSchedule(vehicle,[{...job,completed_at:'2026-11-15T00:00:00Z'}],options).service_due,'2027-11-14','booking date anchors the annual reminder');
 assert.equal(garageServiceSchedule(vehicle,[{...job,job_type:'6 month safety service'}],options).service_due,null);
 assert.equal(garageServiceSchedule({...vehicle,service_due:'2027-03-01'},[booked],options).service_due,'2027-03-01');
 assert.equal(garageReminderItems([{...vehicle,...schedule}],{now}).some(item=>item.label==='Annual service'),false,'a booked service does not request another booking');
});
test('automatic service date survives preference saves and updates when the booking changes',async()=>{
 const {db,tables,session}=signedDatabase({jobs:[{...job,status:'booked',booking_date:'2026-11-20'}]});
 let status=await customerGarageAction(db,{action:'garage-status',session},{now});assert.equal(status.vehicles[0].service_due,'2026-11-20');
 await customerGarageAction(db,{action:'garage-save',session,vehicle_id:vehicle.id,service_due:'2026-11-20',service_automatic:true,reminders:true},{now});
 assert.equal(tables.customer_garage_vehicles[0].service_due,null);
 tables.jobs[0].booking_date='2026-11-25';status=await customerGarageAction(db,{action:'garage-status',session},{now});assert.equal(status.vehicles[0].service_due,'2026-11-25');
 tables.jobs[0]={...job,completed_at:'2026-11-15T00:00:00Z'};status=await customerGarageAction(db,{action:'garage-status',session},{now});assert.equal(status.vehicles[0].service_due,'2027-11-14');
 await customerGarageAction(db,{action:'garage-save',session,vehicle_id:vehicle.id,service_due:'2027-02-01',service_automatic:false,reminders:true},{now});status=await customerGarageAction(db,{action:'garage-status',session},{now});assert.equal(status.vehicles[0].service_due,'2027-02-01');
});
test('service dates only use the account’s bookings, including when other cars fill the first history page',async()=>{
 const jobs=Array.from({length:102},()=>({...job,id:randomUUID(),registration:'XY99ZZZ',booking_date:'2027-01-01'}));jobs.push({...job});jobs.push({...job,id:randomUUID(),customer_email:'someone@example.com',booking_date:'2026-11-15'});
 const {db}=database({jobs});const snapshot=await garageSnapshot(db,account,{now});assert.equal(snapshot.vehicles[0].service_due,'2027-11-14');
});
function insuranceStore(){const objects=new Map(),calls=[];return {objects,calls,upload:async(path,bytes)=>{calls.push(['upload',path]);objects.set(path,Buffer.from(bytes));return {data:{path}};},download:async path=>{calls.push(['download',path]);return objects.has(path)?{data:new Blob([objects.get(path)])}:{error:true};},remove:async paths=>{calls.push(['remove',paths]);paths.forEach(path=>objects.delete(path));return {data:paths};}};}
async function insuranceJpeg(){const {default:sharp}=await import('sharp');return 'data:image/jpeg;base64,'+(await sharp({create:{width:60,height:100,channels:3,background:'#fff'}}).jpeg().toBuffer()).toString('base64');}
test('private insurance photo upload, view, replacement and removal are scoped to the owned car',async()=>{
 const {db,tables,session}=signedDatabase(),storage=insuranceStore(),options={now,insuranceStorage:storage};const call=(action,extra={})=>customerGarageAction(db,{action,session,vehicle_id:vehicle.id,...extra},options),image=await insuranceJpeg();
 await call('garage-insurance-upload',{image});const first=tables.customer_garage_vehicles[0].insurance_document_id;assert.ok(first);assert.equal(storage.objects.size,1);
 assert.ok([...storage.objects.keys()][0].startsWith(account.id+'/'+vehicle.id+'/'));
 const viewed=await call('garage-insurance-view');assert.equal(viewed.content_type,'image/jpeg');assert.ok(viewed.base64.length>20);assert.equal(viewed.url,undefined);
 const snapshot=await call('garage-status');assert.equal(snapshot.vehicles[0].insurance_document_id,undefined);assert.equal(snapshot.vehicles[0].insurance_cleanup,undefined);assert.ok(snapshot.vehicles[0].insurance_uploaded_at);
 await call('garage-insurance-upload',{image});assert.notEqual(tables.customer_garage_vehicles[0].insurance_document_id,first);assert.equal(storage.objects.size,1,'old photo removed');
 tables.customer_garage_vehicles[0].insurance_due='2027-01-01';await call('garage-insurance-remove');assert.equal(storage.objects.size,0);assert.equal(tables.customer_garage_vehicles[0].insurance_due,'2027-01-01');await assert.rejects(call('garage-insurance-view'),/no insurance photo/);
 await call('garage-insurance-upload',{image});await call('garage-remove');assert.equal(storage.objects.size,0);assert.equal(tables.customer_garage_vehicles.length,0);assert.equal(tables.jobs.length,1);
});
test('insurance actions reject unauthenticated or foreign car access before touching storage',async()=>{
 const {db,session}=signedDatabase({customer_garage_vehicles:[{...vehicle,account_id:randomUUID()}]}),storage=insuranceStore();
 for(const action of ['garage-insurance-upload','garage-insurance-view','garage-insurance-remove']){
  await assert.rejects(customerGarageAction(db,{action,session,vehicle_id:vehicle.id,image:'anything'},{now,insuranceStorage:storage}),/not in your garage/);
  await assert.rejects(customerGarageAction(db,{action,vehicle_id:vehicle.id},{now,insuranceStorage:storage}),/Sign in/);
 }assert.deepEqual(storage.calls,[]);
});
test('invalid insurance images cannot replace the saved document; storage failures leave it recoverable',async()=>{
 const {db,tables,session}=signedDatabase(),storage=insuranceStore(),options={now,insuranceStorage:storage},body={session,vehicle_id:vehicle.id};
 await customerGarageAction(db,{...body,action:'garage-insurance-upload',image:await insuranceJpeg()},options);const before=structuredClone(tables.customer_garage_vehicles[0]);
 for(const image of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YmFk', 'data:image/jpeg;base64,'+'A'.repeat(2400004)])await assert.rejects(customerGarageAction(db,{...body,action:'garage-insurance-upload',image},options));
 assert.deepEqual(tables.customer_garage_vehicles[0],before);
 storage.remove=async()=>({error:true});await assert.rejects(customerGarageAction(db,{...body,action:'garage-insurance-remove'},options),/could not be removed/);assert.equal(tables.customer_garage_vehicles[0].insurance_document_id,before.insurance_document_id);
 await customerGarageAction(db,{...body,action:'garage-insurance-upload',image:await insuranceJpeg()},options);assert.deepEqual(tables.customer_garage_vehicles[0].insurance_cleanup,[before.insurance_document_id]);
});
test('simultaneous insurance replacements keep one active photo and remove a losing upload',async()=>{
 const {db,tables,session}=signedDatabase(),storage=insuranceStore(),image=await insuranceJpeg();let release;const gate=new Promise(r=>release=r),upload=storage.upload;let count=0;
 storage.upload=async(...args)=>{const result=await upload(...args);if(++count===2)release();await gate;return result;};
 const results=await Promise.allSettled([1,2].map(()=>customerGarageAction(db,{action:'garage-insurance-upload',session,vehicle_id:vehicle.id,image},{now,insuranceStorage:storage})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(storage.objects.size,1);assert.ok(tables.customer_garage_vehicles[0].insurance_document_id);
});
test('insurance migration preserves existing records and gives no public table or bucket access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);');
  await db.exec(fs.readFileSync('supabase/migrations/20261115192103_customer_garage_accounts.sql','utf8'));
  await db.exec("insert into customer_garage_accounts(id,email) values ('"+account.id+"','owner@example.com');insert into customer_garage_vehicles(id,account_id,registration,tax_due) values ('"+vehicle.id+"','"+account.id+"','AB12CDE','2027-11-01');");
  await db.exec(fs.readFileSync('supabase/migrations/20261116075950_customer_garage_insurance.sql','utf8'));
  const row=(await db.query("select tax_due::text,insurance_document_id,insurance_cleanup from customer_garage_vehicles")).rows[0];assert.equal(row.tax_due,'2027-11-01');assert.equal(row.insurance_document_id,null);assert.deepEqual(row.insurance_cleanup,[]);
  const bucket=(await db.query("select * from storage.buckets")).rows[0];assert.equal(bucket.public,false);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg']);
  const access=(await db.query("select relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon,has_table_privilege('authenticated',oid,'UPDATE') authenticated from pg_class where relname='customer_garage_vehicles'")).rows[0];assert.equal(access.relrowsecurity,true);assert.equal(access.anon,false);assert.equal(access.authenticated,false);
 }finally{await db.close();}
});


test('NEVOS preference is per owned car, survives refresh and is returned to a new booking',async()=>{
 const {db,tables,session,writes}=signedDatabase({customer_garage_vehicles:[{...vehicle},{...vehicle,id:randomUUID(),registration:'XY99ZZZ'},{...vehicle,id:randomUUID(),account_id:randomUUID()}]});
 const call=(action,extra={})=>customerGarageAction(db,{action,session,vehicle_id:vehicle.id,...extra},{now,lookup:async()=>({vehicle:'Nissan Juke',tax_due:'2027-01-01'})});
 assert.equal((await call('garage-booking-prefill')).nevos_vehicle,null);
 for(const choice of ['yes','no']){
  await call('garage-nevos-save',{nevos_vehicle:choice});await call('garage-refresh');
  const prefill=await call('garage-booking-prefill');assert.equal(prefill.nevos_vehicle,choice);assert.equal(prefill.vehicle_id,vehicle.id);
  assert.equal((await call('garage-status')).vehicles[0].nevos_vehicle,choice);
 }
 assert.equal(tables.customer_garage_vehicles[1].nevos_vehicle,undefined);
 await assert.rejects(call('garage-nevos-save',{nevos_vehicle:'yes',vehicle_id:tables.customer_garage_vehicles[2].id}),/not in your garage/);
 await assert.rejects(call('garage-booking-prefill',{vehicle_id:tables.customer_garage_vehicles[2].id}),/not in your garage/);
 for(const bad of ['',null,true,'YES','maybe'])await assert.rejects(call('garage-nevos-save',{nevos_vehicle:bad}),/Yes or No/);
 await call('garage-save',{nevos_vehicle:'yes',nickname:'Mine'});assert.equal((await call('garage-booking-prefill')).nevos_vehicle,'yes');
 await call('garage-save',{nickname:'Old app save'});assert.equal((await call('garage-booking-prefill')).nevos_vehicle,'yes','older app does not erase the preference');
 assert.ok(writes.every(w=>w.table==='customer_garage_vehicles'));
});
test('only an explicit answer in the verified customer’s own history supplies a missing NEVOS preference',async()=>{
 const {db,session}=signedDatabase({jobs:[{...job,work_required:'NEVOS vehicle: NO\n\nMOT'}, {...job,id:randomUUID(),booking_date:'2026-11-16',customer_email:'someone@example.com',work_required:'NEVOS vehicle: YES'}]});
 const prefill=await customerGarageAction(db,{action:'garage-booking-prefill',session,vehicle_id:vehicle.id},{now});assert.equal(prefill.nevos_vehicle,'no');
 assert.equal(garageNevosStatus({...vehicle,nevos_vehicle:'yes'},[{...job,work_required:'NEVOS vehicle: NO'}]),'yes');
 assert.equal(garageNevosStatus(vehicle,[{...job,work_required:'NEVOS servicing enquiry'}]),null);
 assert.equal(garageNevosStatus(vehicle,[{...job,registration:'XY99ZZZ',work_required:'NEVOS vehicle: YES'}]),null);
 assert.equal(garageNevosStatus(vehicle,[{...job,work_required:'NEVOS vehicle: YES'},{...job,booking_date:'2026-11-16',work_required:'NEVOS vehicle: NO'}]),'no');
});
test('NEVOS migration upgrades existing vehicles without defaulting to No or granting browser access',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
  await db.exec(fs.readFileSync('supabase/migrations/20261115192103_customer_garage_accounts.sql','utf8'));
  await db.exec("insert into customer_garage_accounts(id,email) values ('"+account.id+"','owner@example.com');insert into customer_garage_vehicles(id,account_id,registration,tax_due) values ('"+vehicle.id+"','"+account.id+"','AB12CDE','2027-11-01');");
  await db.exec(fs.readFileSync('supabase/migrations/20261117072241_customer_garage_nevos.sql','utf8'));
  const row=(await db.query('select nevos_vehicle,tax_due::text from customer_garage_vehicles')).rows[0];assert.equal(row.nevos_vehicle,null);assert.equal(row.tax_due,'2027-11-01');
  for(const choice of ['yes','no'])await db.query('update customer_garage_vehicles set nevos_vehicle=$1',[choice]);
  await assert.rejects(db.query('update customer_garage_vehicles set nevos_vehicle=$1',['maybe']),/check constraint/);
  const access=(await db.query("select relrowsecurity,has_table_privilege('anon',oid,'SELECT') anon,has_table_privilege('authenticated',oid,'UPDATE') authenticated from pg_class where relname='customer_garage_vehicles'")).rows[0];assert.equal(access.relrowsecurity,true);assert.equal(access.anon,false);assert.equal(access.authenticated,false);
 }finally{await db.close();}
});

test('first booking email requires the matching security code before the pending booking opens',async t=>{
 const restore=environment({RESEND_API_KEY:'fixture'});t.after(restore);
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const {requestTrackingPath}=await import('../../lib/job-progress.js');
 const {default:handler}=await import('../../lib/job-progress-handler.js');
 const date=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
 const request={id:randomUUID(),email:account.email,registration:'TEST123',vehicle:'Test car',preferred_date_1:date,status:'awaiting_review',work_required:'Full service'};
 const {db,tables}=database({website_booking_requests:[request],jobs:[]});
 const token=requestTrackingPath(request).split('#')[1],mail=[];
 globalThis.fetch=async(url,options)=>{
  if(url==='https://api.resend.com/emails'){mail.push(JSON.parse(options.body));return Response.json({id:'test-email'});}
  const path=String(url).split('/rest/v1/')[1];
  if(!path)throw Error('Unexpected destination');
  const table=path.split('?')[0];
  if(!Object.hasOwn(tables,table))return Response.json([]);
  return Response.json(await db(path,options.method==='GET'?{}:options));
 };
 async function call(action,body={}){
  const response={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
  await handler({method:'POST',headers:{host:'www.vectamotors.co.uk',origin:'https://www.vectamotors.co.uk','content-type':'application/json'},body:{action,token,...body}},response);
  return response;
 }
 assert.equal((await call('status')).code,401);
 assert.equal((await call('portal-request-code',{email:'other@example.invalid'})).code,403);
 assert.equal(mail.length,0);
 const issued=await call('portal-request-code',{email:account.email});assert.equal(issued.code,200);
 assert.deepEqual(mail[0].to,[account.email]);const code=mail[0].text.match(/\b\d{6}\b/)[0];
 const challenge=issued.data.challenge;
 assert.equal((await call('garage-verify',{challenge,code:code==='000000'?'111111':'000000'})).code,401);
 const verified=await call('garage-verify',{challenge,code});assert.equal(verified.code,200);
 assert.equal((await call('garage-verify',{challenge,code})).code,401);
 const session=verified.data.session;
 assert.equal((await call('portal-access',{session})).code,200);
 const pending=await call('status',{session});assert.equal(pending.code,200);assert.equal(pending.data.title,'Waiting for workshop approval');assert.equal(pending.data.job_description,'Full service');
 tables.customer_garage_accounts[0].email='different@example.invalid';assert.equal((await call('portal-status',{session})).code,403);
});
test('a verified booking customer gets the approval alert without adding a garage vehicle',async()=>{
 const restore=environment();try{
  const saved={...job,status:'booked'},push={id:'test',account_id:account.id,last_seq:'0',ready_jobs:[],reminder_receipts:{},next_check_at:new Date(now).toISOString(),subscription:{}};
  const {db}=database({customer_garage_push:[push],customer_garage_vehicles:[],jobs:[saved],customer_portal_events:[{actor:'workshop',kind:'booking_confirmed',seq:1,job_id:job.id,registration:'AB12CDE',customer_email:account.email}]});
  const sent=[],send=async(_,payload)=>sent.push(payload.body);
  await runGarageAlerts(db,{now,send});await runGarageAlerts(db,{now:now+300000,send});
  assert.deepEqual(sent,['Good news, your booking is confirmed! Open VECTA for the details.']);
 }finally{restore();}
});
