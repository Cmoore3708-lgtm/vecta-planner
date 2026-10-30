import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function renderer(name){
 const source=html.split('\n').find(line=>line.startsWith('function '+name+'('));
 const context={fleetEomLineItems:()=>[{description:'6 Month Safety Check',price:90},{description:'Supply & fit front suspension drop link',price:70},{description:'Pre MOT check',price:30}],fleetEomWorkText:()=> '6 Month Safety Check | Supply & fit front suspension drop link | Pre MOT check',esc:x=>String(x),niceDate:x=>x,fleetEomRegistrationHtml:()=> 'VN68FPJ',fleetEomRegistrationText:()=> 'VN68FPJ',fleetNmukTypeForJob:()=> 'Pool',money:x=>'£'+Number(x).toFixed(2)};
 vm.createContext(context);vm.runInContext(source,context);return context[name];
}
for(const name of ['fleetEomItemisedRowsHtml','fleetEomPreviewItemisedRowsHtml']){
 test(name+' combines NMUK work and uses one authoritative job total',()=>{
 const render=renderer(name),row={date:'2026-10-21',amount:190,job:{id:'test',registration:'VN68FPJ'}},result=render(row,true);
 assert.equal((result.match(/VN68FPJ/g)||[]).length,1);
 assert.match(result,/6 Month Safety Check \| Supply & fit front suspension drop link \| Pre MOT check/);
 assert.equal((result.match(/£190.00/g)||[]).length,1);
 assert.doesNotMatch(result,/£90.00|£70.00|£30.00|eomPreviewContinuation|eomContinuation/);
 assert.match(render({...row,amount:185},true),/£185.00/);
 });
 test(name+' retains contractor itemisation',()=>{
 const result=renderer(name)({date:'2026-10-21',amount:190,job:{id:'test'}},false);
 for(const amount of ['90','70','30'])assert.ok(result.includes('£'+amount+'.00'));
 assert.ok(!result.includes('£190.00'));
 });
}
