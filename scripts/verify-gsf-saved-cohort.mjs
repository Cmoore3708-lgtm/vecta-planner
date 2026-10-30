// Offline receipt audit. Never upgrades a review/skip to a pass or invents evidence.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const paths=process.argv.slice(2);
assert(paths.length>=2,'Supply previous and current receipt JSON files');
const load=path=>{const raw=JSON.parse(readFileSync(path));const rows=Array.isArray(raw)?raw:raw.cases;assert(Array.isArray(rows),'Expected case array');return rows;};
const previous=load(paths[0]),current=load(paths[1]);
assert.equal(current.length,600);assert.equal(previous.length,600);
const positions=new Set(),registrations=new Set(),counts={},transitions={},regressions=[],causes={};
const before=new Map(previous.map(row=>[row.position,row]));
assert.equal(before.size,600,'Duplicate previous position');
for(const row of current){
 assert(!positions.has(row.position),'Duplicate current position');positions.add(row.position);registrations.add(row.registration);
 const old=before.get(row.position);assert(old,'Missing previous position');
 assert.equal(row.registration,old.registration,'Cohort changed');assert.equal(row.operation,old.operation,'Operation changed');
 assert(['PASSED','FAILED','REVIEW_REQUIRED','SKIPPED'].includes(row.status),'Unfinished case');
 counts[row.status]=(counts[row.status]||0)+1;
 const transition=old.status+' -> '+row.status;transitions[transition]=(transitions[transition]||0)+1;
 if(old.status==='PASSED'&&row.status!=='PASSED')regressions.push({registration:row.registration,operation:row.operation,reason:row.reason});
 if(['FAILED','REVIEW_REQUIRED'].includes(row.status)){const key=[row.reason,row.evidence?.stage,row.evidence?.category].join(' / ');(causes[key]??=[]).push({registration:row.registration,operation:row.operation});}
 if(row.status==='PASSED')assert.equal(row.reason,'SUPPLIER_CHECKS_PASSED','Unproven pass');
}
assert.equal(registrations.size,100);
assert.equal([...current].sort((a,b)=>a.position-b.position)[0].registration,'CM14KEL');
console.log(JSON.stringify({counts,transitions,regressions,causes},null,2));
