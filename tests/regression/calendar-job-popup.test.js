import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('returning from an offline popup merges its queued job without touching the original editor or newer records',async()=>{
 const original={id:'parent',work_required:'Saved original',updated_at:'2026-11-16T08:00:00Z'};
 const app={jobs:[original,{id:'child',work_required:'Old',updated_at:'2026-11-16T08:00:00Z'},{id:'newer',updated_at:'2026-11-16T11:00:00Z'}]};
 const pending={child:{operation:'upsert',payload:{id:'child',work_required:'Saved in popup',updated_at:'2026-11-16T10:00:00Z'}},newer:{operation:'upsert',payload:{id:'newer',updated_at:'2026-11-16T09:00:00Z'}},removed:{operation:'delete',payload:{id:'parent'}}};
 const baseline={id:'parent',job:structuredClone(original)};let refreshed=0;
 const popupSource=readFileSync('public/js/calendar-job-popup.js','utf8');
 const helpers=popupSource.slice(popupSource.indexOf(' function mergeQueuedJobs('),popupSource.indexOf(' function formState('));
 const root={__vectaJobEditorBaseline:baseline,vectaCalendarPopupState:()=>({jobs:app.jobs,queued:pending,decode:x=>x,normalise:x=>x,newer:(item,row)=>Date.parse(item.payload.updated_at)>Date.parse(row.updated_at)}),vectaRefreshPortalJobs:async()=>{refreshed++;return false;}};
 const ctx={root};vm.runInNewContext(helpers,ctx);
 assert.equal(await ctx.refreshCalendar({preview:{isConnected:false}}),false);
 assert.equal(refreshed,1);assert.equal(app.jobs[0],original);assert.equal(root.__vectaJobEditorBaseline,baseline);
 assert.equal(app.jobs[1].work_required,'Saved in popup');assert.equal(app.jobs[2].updated_at,'2026-11-16T11:00:00Z');assert.equal(app.jobs.length,3);
});
