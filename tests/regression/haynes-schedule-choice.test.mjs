import test from 'node:test';
import assert from 'node:assert/strict';
import { normalSchedules, chooseSchedule } from '../../workers/haynes/schedule-choice.mjs';
const options=[
  {value:'ms_1,x',label:'Normal conditions, (01/05/2013 - 02/03/2014), (DAM/RPO 13323 - 13628) (United Kingdom)'},
  {value:'ms_2,x',label:'Normal conditions, (03/03/2014 -), (DAM/RPO 13629) (United Kingdom)'},
  {value:'ms_3,x',label:'Severe conditions (United Kingdom)'}
];
test('extended build labels require an explicit choice and preserve the full supplier value',async()=>{
  assert.equal(normalSchedules(options).length,2);
  await assert.rejects(chooseSchedule(options,{},undefined),e=>e.code==='SCHEDULE_REQUIRED');
  const selected=await chooseSchedule(options,{},async choices=>choices[1].value);
  assert.equal(selected.value,'ms_2,x');assert.equal(selected.system,'ms_2');
  await assert.rejects(chooseSchedule(options,{},async()=>''),e=>e.code==='SCHEDULE_REQUIRED');
  await assert.rejects(chooseSchedule(options,{},async()=>'ms_9'),e=>e.code==='SCHEDULE_REQUIRED');
});
test('single UK normal schedule remains automatic; invalid, severe and foreign options are excluded',async()=>{
  assert.equal((await chooseSchedule([{value:'ms_4',label:'Normal conditions (United Kingdom)'}],{})).system,'ms_4');
  assert.equal(normalSchedules([...options,options[0],{value:'invalid',label:'Normal conditions (United Kingdom)'},{value:'ms_5',label:'Normal conditions (France)'}]).length,2);
});
