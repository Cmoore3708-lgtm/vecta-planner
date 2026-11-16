import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const start=html.indexOf('window.vectaRefreshCalendarJobs=');
const source=html.slice(start,html.indexOf('// A separate document',start));
test('returning from an offline popup merges its queued job without touching the original editor or newer records',async()=>{
 const original={id:'parent',work_required:'Saved original',updated_at:'2026-11-16T08:00:00Z'};
 const app={jobs:[original,{id:'child',work_required:'Old',updated_at:'2026-11-16T08:00:00Z'},{id:'newer',updated_at:'2026-11-16T11:00:00Z'}]};
 const pending={child:{operation:'upsert',payload:{id:'child',work_required:'Saved in popup',updated_at:'2026-11-16T10:00:00Z'}},newer:{operation:'upsert',payload:{id:'newer',updated_at:'2026-11-16T09:00:00Z'}},removed:{operation:'delete',payload:{id:'parent'}}};
 const baseline={id:'parent',job:structuredClone(original)};let refreshed=0;
 const window={__vectaJobEditorBaseline:baseline,vectaRefreshPortalJobs:async()=>{refreshed++;return false;}};
 vm.runInNewContext(source,{window,app,vectaQueuedJobOperations:()=>pending,fromRemote:x=>x,normaliseCompletedJobState:x=>x,vectaPendingUpsertIsNewerThanCloud:(item,row)=>Date.parse(item.payload.updated_at)>Date.parse(row.updated_at)});
 assert.equal(await window.vectaRefreshCalendarJobs(),false);
 assert.equal(refreshed,1);assert.equal(app.jobs[0],original);assert.equal(window.__vectaJobEditorBaseline,baseline);
 assert.equal(app.jobs[1].work_required,'Saved in popup');assert.equal(app.jobs[2].updated_at,'2026-11-16T11:00:00Z');assert.equal(app.jobs.length,3);
});
