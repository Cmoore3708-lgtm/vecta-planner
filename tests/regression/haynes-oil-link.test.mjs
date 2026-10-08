import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSchedule } from '../../workers/haynes/service-dom.mjs';

test('oil links inside the operation and in separate supplier rows are found', () => {
  const href='https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_200000087';
  for (const position of ['inside','sibling','page']) {
    const operation={querySelector(selector){if(selector==='h3')return {textContent:'Renew the engine oil'};return position==='inside'?{href}:null;},nextElementSibling:{querySelector(){return position==='sibling'?{href}:null;}}};
    globalThis.document={querySelector(){return null;},querySelectorAll(selector){if(selector==='li')return [operation];if(selector.startsWith('a['))return [{href},{href}];return [];}};
    try {assert.equal(readSchedule().oilLink,href);} finally {delete globalThis.document;}
  }
});

test('unrelated multiple lubricant links are not guessed', () => {
  globalThis.document={querySelector(){return null;},querySelectorAll(selector){return selector.startsWith('a[')?[{href:'https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_1'},{href:'https://www.workshopdata.com/touch/site/layout/lubricants?typeId=t_2'}]:[];}};
  try {assert.equal(readSchedule().oilLink,'');} finally {delete globalThis.document;}
});
