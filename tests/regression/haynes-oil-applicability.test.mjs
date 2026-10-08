import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readOil } from '../../workers/haynes/service-dom.mjs';

test('climate-labelled engine oil retains specifications, capacity and applicability', () => {
  const row=(label,values)=>({querySelector(){return {textContent:label};},querySelectorAll(){return values.map(textContent=>({textContent}));}});
  const block=(heading,hidden=false)=>({hidden,querySelector(){return {textContent:heading};},querySelectorAll(selector){return selector==='li.note'?[{textContent:'Engine sump, including filter 3.75 (l)'},{textContent:'Engine oil drain plug 34 (Nm)'}]:[row('Engine oil',['SAE 5W-30','PSA B71 2290']),row('Gear oil',['SAE 75W-80'])];}});
  globalThis.document={querySelectorAll(){return [block('Cold and temperate climates'),block('Hot climates'),block('Engine',true)];}};
  globalThis.getComputedStyle=()=>({display:'block'});
  try {assert.deepEqual(readOil(),['Cold and temperate climates','Hot climates'].map(applicability=>({applicability,specification:'SAE 5W-30 · PSA B71 2290',capacity:'Engine sump, including filter 3.75 (l)'})));}
  finally {delete globalThis.document;delete globalThis.getComputedStyle;}
});
