import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const context={uid:()=> 'part-1'};
vm.createContext(context);
for(const name of ['jobParts','noteWithJobParts'])vm.runInContext(html.split('\n').find(line=>line.startsWith('function '+name+'(')),context);
test('part cost survives saving, reopening and arrival updates',()=>{
 const initial=[{id:'p',description:'Oil filter',quantity:2,cost_price:12.35,ordered:false,arrived:false}];
 let rows=context.jobParts({customer_note:context.noteWithJobParts('Customer instruction',initial)});
 assert.equal(rows[0].cost_price,12.35);
 rows[0].arrived=true;
 rows=context.jobParts({customer_note:context.noteWithJobParts('Customer instruction',rows)});
 assert.equal(rows[0].cost_price,12.35);
 assert.equal(rows[0].arrived,true);
});
test('legacy parts keep an empty cost; zero is preserved',()=>{
 for(const value of [undefined,null,0]){
 const rows=context.jobParts({customer_note:context.noteWithJobParts('',[{description:'Part',cost_price:value}])});
 assert.equal(rows[0].cost_price,value===0?0:null);
 }
});
