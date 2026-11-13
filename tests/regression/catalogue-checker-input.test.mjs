import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {repairRequest,repairScope} from '../../lib/repair-quote.js';
import {promptInitialRepairRequest,promptRepairChoice} from '../../workers/repair-quotes/checker-input.mjs';

const registration='AB12CDE',part='a'.repeat(32),labour='b'.repeat(32);
function terminal(answers){
 const prompts=[],messages=[];let i=0;
 return {prompts,messages,options:{log:value=>messages.push(value)},question:async prompt=>{prompts.push(prompt);assert.ok(i<answers.length,'Unexpected additional question');return answers[i++];}};
}
test('repeated ampersands are tolerated only in the supply-and-fit prefix, across part families',()=>{
 for(const component of ['radiator','alternator','front brake pads','front left suspension arm','2 front shock absorbers']){
  const expected=repairScope.resolve('Supply and fit '+component);
  for(const prefix of ['Supply & fit ','Supply && fit ','Supply & & fit ','supply&&fit '])assert.deepEqual(repairScope.resolve(prefix+component),expected);
 }
 for(const work of ['Supply && fit radiator && cap','Supply & & fit radiator and hose','radiator && cap','Supply && fit radiator if leaking','Supply && fit radiator; fit hose'])assert.equal(repairScope.resolve(work).status,'UNSUPPORTED_OPERATION');
 assert.equal(repairScope.resolve('Supply && fit timing belt and water pump kit').status,'SUPPORTED');
});
test('browser and worker grammar both accept the photographed input shape',()=>{
 const source=fs.readFileSync('public/js/vecta-repair-quote.js','utf8'),grammar=fs.readFileSync('lib/repair-scope.js','utf8');assert.ok(source.startsWith(grammar));
 const context=vm.createContext({});vm.runInContext(source.slice(0,grammar.length),context);
 assert.equal(context.VectaRepairScope.resolve('Supply && fit radiator').query,'radiator');
});
test('initial wording mistakes retry while retaining the valid registration',async()=>{
 const t=terminal(['ab12 cde','radiator and hose','','Supply && fit radiator']);
 const result=await promptInitialRepairRequest(t,t.options);
 assert.equal(result.registration,registration);assert.equal(repairScope.resolve(result.work).query,'radiator');
 assert.equal(t.prompts.filter(p=>p.startsWith('Registration')).length,1);assert.equal(t.messages.length,2);
 assert.ok(t.messages.every(m=>!m.includes('UNSUPPORTED_OPERATION')));
});
test('invalid registration retries before asking for the repair',async()=>{
 const t=terminal(['','invalid/reg','AB12 CDE','radiator']);
 assert.equal((await promptInitialRepairRequest(t,t.options)).registration,registration);
 assert.equal(t.prompts.filter(p=>p.startsWith('Registration')).length,3);assert.equal(t.messages.length,2);
});
test('missing axle and invalid brake quantities explain the correction and retry',async()=>{
 const t=terminal([registration,'brake pads','front left brake pads','2 front brake pads','front brake pads']);
 const request=await promptInitialRepairRequest(t,t.options);
 assert.equal(request.quantity,1);assert.equal(repairScope.resolve(request.work).axle,'front');
 assert.match(t.messages[0],/position/);assert.match(t.messages[1],/axle/);assert.match(t.messages[2],/quantity/);
});
test('quitting either initial prompt returns without producing a request',async()=>{
 for(const answers of [['Q'],[registration,'q']]){const t=terminal(answers);assert.equal(await promptInitialRepairRequest(t,t.options),null);}
});
test('invalid numbers and unclear refinements keep the current choices available',async()=>{
 const request=repairRequest({registration,work:'radiator',flow:'guided-v1'}),before=structuredClone(request);
 const result={stage:'GSF_PART',options:[{id:part,work:'Supply and fit radiator'}]};
 const t=terminal(['99','','radiator and hose','1']);
 const next=await promptRepairChoice(t,request,result,t.options);
 assert.equal(next.choices.part,part);assert.equal(t.messages.length,3);assert.deepEqual(request,before);
});
test('correcting the GSF wording clears earlier choices; Haynes refinement retains the selected part',async()=>{
 const request=repairRequest({registration,work:'radiator',flow:'guided-v1',choices:{part,labour}});
 const t=terminal(['Supply && fit radiator']);
 const next=await promptRepairChoice(t,request,{stage:'GSF_PART',options:[]},t.options);assert.deepEqual(next.choices,{});
 const h=terminal(['x'.repeat(151),'renew radiator']);
 const refined=await promptRepairChoice(h,request,{stage:'HAYNES_LABOUR',options:[]},h.options);
 assert.equal(refined.choices.part,part);assert.equal(refined.choices.labour,undefined);assert.equal(refined.choices.labourSearch,'renew radiator');assert.equal(h.messages.length,1);
});
test('numbered category, labour-menu and operation choices retain their intended request transitions',async()=>{
 const base=repairRequest({registration,work:'radiator',flow:'guided-v1'}),category='c'.repeat(32);
 let t=terminal(['1']);const chosen=await promptRepairChoice(t,base,{stage:'GSF_CATEGORY',options:[{work:'Supply and fit radiator fan',categoryChoice:category}]},t.options);
 assert.equal(chosen.choices.gsfCategory,category);assert.equal(repairScope.resolve(chosen.work).part,'radiator fan');
 const selected=repairRequest({...chosen,choices:{gsfCategory:category,part}});
 t=terminal(['1']);const menu=await promptRepairChoice(t,selected,{stage:'HAYNES_MENU',options:[{label:'Cooling'}]},t.options);assert.deepEqual(menu.choices.menus,['Cooling']);assert.equal(menu.choices.part,part);
 t=terminal(['1']);const operation=await promptRepairChoice(t,menu,{stage:'HAYNES_LABOUR',options:[{id:labour}]},t.options);assert.equal(operation.choices.labour,labour);
 t=terminal(['Q']);assert.equal(await promptRepairChoice(t,operation,{stage:'HAYNES_LABOUR',options:[]},t.options),null);
});
