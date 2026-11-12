import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('planner hour labels, lane grid, job heights and start positions keep the same scale',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('public/js/haynes-job-tools.css','utf8');
 const scale=Number(html.match(/var PLANNER_PX_PER_HOUR=([\d.]+)/)[1]),gap=Number(html.match(/var PLANNER_JOB_VISUAL_GAP_PX=([\d.]+)/)[1]);
 const ctx={PLANNER_PX_PER_HOUR:scale,PLANNER_JOB_VISUAL_GAP_PX:gap,plannerStartMinutes:480,clockMinutes:s=>Number(s.slice(0,2))*60+Number(s.slice(3,5))};
 for(const name of ['topFor','heightFor'])vm.runInNewContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],ctx);
 assert.equal(ctx.topFor({drop_time:'09:00'}),scale);
 assert.equal(ctx.heightFor({estimated_hours:1})+gap,scale);
 assert.equal(ctx.topFor({drop_time:'09:30'}),scale*1.5);
 assert.equal(Number(css.match(/\.timeCol \.time\{height:([\d.]+)px/)[1]),scale);
 assert.ok(css.includes('background-size:100% '+scale+'px!important'));
 assert.ok(css.includes('transparent '+(scale-1)+'px,#edf1f5 '+(scale-1)+'px,#edf1f5 '+scale+'px'));
});
