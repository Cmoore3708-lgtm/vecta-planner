import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');

test('MOT appointment list ends with Tomorrow followed by Vic Young',()=>{
  assert.match(html,/function halfHourMotTimeOptions\(val\)[\s\S]*?times\.concat\(\['Tomorrow','Vic Young'\]\)/);
});

test('special MOT appointment choices are preserved when jobs are saved and reopened',()=>{
  assert.match(html,/function normaliseMotTime\(value\)[\s\S]*?'tomorrow':'Tomorrow'[\s\S]*?'vic young':'Vic Young'/);
  assert.match(html,/function motTimeFromJob\(j\)[\s\S]*?normaliseMotTime\(j\.mot_time\)/);
  assert.match(html,/function setMotTimeOnNote\(note,time\)[\s\S]*?normaliseMotTime\(time\)/);
});
