import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse=traverseModule.default||traverseModule;
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const names=new Set(['quoteJobs','allJobsForDate','financeValidJob']);
let source='';
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)){
  if(![...names].some(name=>match[1].includes('function '+name+'(')))continue;
  traverse(parse(match[1],{sourceType:'script'}),{FunctionDeclaration(path){
    if(names.has(path.node.id.name))source+=match[1].slice(path.node.start,path.node.end)+'\n';
  }});
}
const quote={id:'quote-1',status:'quote',amount_quoted:250,registration:'AB12 CDE',booking_date:'2026-09-29',technician:'Alfie'};
const booked={id:'job-1',status:'booked',amount_quoted:250,registration:'XY12 ZZZ',booking_date:'2026-09-29',technician:'Alfie'};
const context={app:{jobs:[quote,booked]},selectedIso:()=> '2026-09-29',vectaJobIsDeletedForLists:()=>false,isVehicleTaxJob:()=>false,isUnallocatedJob:()=>false,financeBaseJob:j=>j};
vm.createContext(context);vm.runInContext(source,context);

test('quotes appear in their own list and cannot occupy a planner day or finance job list',()=>{
  assert.deepEqual(Array.from(context.quoteJobs(),j=>j.id),['quote-1']);
  assert.deepEqual(Array.from(context.allJobsForDate(),j=>j.id),['job-1']);
  assert.equal(context.financeValidJob(quote),false);
  assert.equal(context.financeValidJob(booked),true);
});
test('quote actions retain a distinct save and convert path',()=>{
  assert.match(html,/id="createQuote">Create Quote/);
  assert.match(html,/id="convertQuote">Create Job/);
  assert.match(html,/function convertQuoteToJob\(id\)[\s\S]*?status\.value='booked'/);
  assert.match(html,/function saveQuote\(id\)[\s\S]*?saveJob\(id\)/);
});
