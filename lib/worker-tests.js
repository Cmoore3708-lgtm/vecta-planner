// Diagnostic contracts only. No customer quote or booking writes.
export const DIAGNOSTIC_BUILD = 'gsf-diagnostics-v1';
export const KNOWN_FAILURES = Object.freeze({CM14KEL:Object.freeze({status:'REVIEW_REQUIRED',service:'Major Service',observedAt:'2026-10-29T10:56:19.601514Z',causeConfirmed:false,detail:'Confirmed production lookup failure; the old worker did not retain detailed evidence.'})});
export const OPERATIONS = ['service', 'oil_filter', 'air_filter', 'cabin_filter', 'fuel_filter', 'oil'];
export const PAUSE_CODES = ['LOGIN_REQUIRED', 'PAIRING_REQUIRED', 'SUPPLIER_THROTTLED', 'SUPPLIER_UNAVAILABLE', 'WORKER_CONFIGURATION_REQUIRED'];
export const OUTCOMES = ['PASSED', 'REVIEW_REQUIRED', 'FAILED', 'SKIPPED'];
export const registration = value => String(value || '').toUpperCase().replace(/\s/g, '');
export const validRegistration = value => /^[A-Z0-9]{5,8}$/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value);
export const safeCode = (value, fallback = 'UNKNOWN') => /^[A-Z][A-Z0-9_]{0,79}$/.test(value || '') ? value : fallback;
const bounded = (value, limit = 250) => String(value || '').replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[VIN]');
// Only named product fields cross the relay. Never retain HTML, cookies, arbitrary
// error messages, page-wide text or URLs (including supplier account information).
export function cleanEvidence(raw = {}) {
 const out = {stage:safeCode(raw.stage), reason:safeCode(raw.reason), freshRead:true};
 for (const key of ['expectedDescription','observedDescription','sku','brand','category','fuelType','workerBuild']) if (raw[key] !== undefined) out[key] = bounded(raw[key]);
 for (const key of ['selectedRegistration','fitmentVerified','scopeVerified','oilVerified']) if (typeof raw[key] === 'boolean') out[key] = raw[key];
 for (const key of ['expectedPricePence','observedPricePence','quantityMilli','packQuantityMilli']) if (Number.isSafeInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 10000000) out[key] = raw[key];
 if (Array.isArray(raw.headings)) out.headings = raw.headings.slice(0,15).map(x => bounded(x,160));
 if (Array.isArray(raw.skus)) out.skus = raw.skus.slice(0,30).map(x => bounded(x,80));
 if (Array.isArray(raw.items)) out.items = raw.items.slice(0,16).map(item => ({kind:bounded(item.kind,40),sku:bounded(item.sku,80),brand:bounded(item.brand,80),description:bounded(item.description,160),quantityMilli:Number.isSafeInteger(item.quantityMilli)?item.quantityMilli:null}));
 return out;
}
export function cleanCompletion(body) {
 if (!/^[a-f0-9-]{36}$/.test(body.id || '') || !/^[a-f0-9-]{36}$/.test(body.lease || '')) throw Error('INVALID_REQUEST');
 const reason = safeCode(body.reason);
 if (!OUTCOMES.includes(body.outcome) && !PAUSE_CODES.includes(reason)) throw Error('INVALID_REQUEST');
 return {id:body.id,lease:body.lease,outcome:PAUSE_CODES.includes(reason)?'PAUSED':body.outcome,reason,evidence:cleanEvidence({...body.evidence,reason}),durationMs:Number.isSafeInteger(body.durationMs)?Math.max(0,Math.min(body.durationMs,300000)):0};
}
// Confirmed non-vehicle fixture identifiers from the first saved cohort. Never silently
// remove them from historical runs; exclude only when selecting a future cohort.
export const NON_VEHICLE_FIXTURES = new Set(['AXLE1','BUGGY3','KAIZEN1','LUBE1','MAINSEC2','MSGTEST1','PURCH1','RDTEST2','TECH1','TEST1']);
export function selectCohort(rows, count = 100) {
 if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('INVALID_COUNT');
 const unique = new Map();
 for (const row of rows) {
  const reg = registration(row.registration);
  if (!validRegistration(reg) || NON_VEHICLE_FIXTURES.has(reg) || unique.has(reg)) continue;
  unique.set(reg, {registration:reg,make:bounded(row.make,60),model:bounded(row.model,80),year:bounded(row.year,10),fuelType:bounded(row.fuel_type ?? row.fuelType,40)});
 }
 const selected = [];
 for (const reg of ['CM14KEL','G4WPC','XJ07WAL','NU67VSE','FV65JTY']) if (unique.has(reg) && selected.length < count) {selected.push(unique.get(reg));unique.delete(reg);}
 const buckets = new Map();
 for (const row of [...unique.values()].sort((a,b) => a.registration.localeCompare(b.registration))) {
  const key = [row.make.toLowerCase(),row.fuelType.toLowerCase(),row.year.slice(0,3)].join('|');
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(row);
 }
 while (selected.length < count && buckets.size) for (const [key,rows] of buckets) {
  selected.push(rows.shift());if (!rows.length) buckets.delete(key);if (selected.length === count) break;
 }
 if (selected.length < count) throw Object.assign(Error('INSUFFICIENT_REGISTRATIONS'), {available:selected.length});
 return selected.map(row=>KNOWN_FAILURES[row.registration]?{...row,baselineFailure:{...KNOWN_FAILURES[row.registration]}}:row);
}
export function testReport(data) {
 const cases = data.cases || [], groups = new Map(), counts = {passed:0,review:0,failed:0,skipped:0,remaining:0,working:0};
 const complete = new Set(), vehicles = new Map();
 for (const row of cases) {
  const list = vehicles.get(row.registration) || [];list.push(row);vehicles.set(row.registration,list);
  const key = {PASSED:'passed',REVIEW_REQUIRED:'review',FAILED:'failed',SKIPPED:'skipped',WORKING:'working'}[row.status];
  if (key) counts[key]++; else counts.remaining++;
  if (['REVIEW_REQUIRED','FAILED'].includes(row.status)) {
   const signature = [row.operation,row.evidence?.stage || 'UNKNOWN',row.reason || 'UNKNOWN'].join(' / ');
   if (!groups.has(signature)) groups.set(signature,{signature,operation:row.operation,stage:row.evidence?.stage,reason:row.reason,registrations:[],caseIds:[]});
   const group=groups.get(signature);if (!group.registrations.includes(row.registration)) group.registrations.push(row.registration);group.caseIds.push(row.id);
  }
 }
 for (const [reg,rows] of vehicles) if (rows.every(x => OUTCOMES.includes(x.status))) complete.add(reg);
 return {...data,baselineFailures:(data.run?.cohort||[]).filter(row=>row.baselineFailure).map(row=>({registration:row.registration,...row.baselineFailure})),coverage:{gsf:'Service validation and five parts categories',haynes:'NOT_TESTED',tyres:'NOT_TESTED',correctFitment:'Automated supplier checks only; ambiguous cases require review'},counts,registrationsCompleted:complete.size,groups:[...groups.values()].sort((a,b)=>b.caseIds.length-a.caseIds.length),complete:data.run?.status==='COMPLETED'};
}
export function compareReports(current, previous) {
 const old=new Map((previous.cases||[]).map(x=>[x.registration+'|'+x.operation,x]));
 return (current.cases||[]).flatMap(row=>{
  const before=old.get(row.registration+'|'+row.operation);
  if (!before || !OUTCOMES.includes(row.status) || before.status===row.status && before.reason===row.reason) return [];
  return [{registration:row.registration,operation:row.operation,before:before.status,after:row.status,reason:row.reason,regression:before.status==='PASSED'&&['FAILED','REVIEW_REQUIRED'].includes(row.status)}];
 });
}
