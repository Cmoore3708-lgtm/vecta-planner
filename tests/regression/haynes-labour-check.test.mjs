import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createHaynesLabourCheck} from '../../workers/repair-quotes/haynes-labour-check.mjs';
import {lookupGeneralHaynes} from '../../workers/repair-quotes/general-haynes.mjs';
import {lookupHaynesChoices} from '../../workers/repair-quotes/guided-haynes.mjs';
import {captureHaynesDiagnostics} from '../../workers/repair-quotes/haynes-page.mjs';
import {promptHaynesLabourChoice} from '../../workers/repair-quotes/checker-input.mjs';
import {repairRequest} from '../../lib/repair-quote.js';
const base='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId=t_123&groupId=QUICKGUIDES';
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator'});
const row=(label,time,id='1FX00000002')=>'<tr><td>Follow-up</td><td>'+id+'</td><td>'+label+'</td><td>+'+time+'</td></tr>';
function fixture(initial=row('Renew the radiator','1.90')){
 let current=base,registration='',rows=initial,value='';const calls=[];
 const document=()=>parseHTML('<html><body><p>Total time (H)</p><header>customer@example.com PRIVATE</header><form><div><input placeholder="Search job"><button>Search</button></div><table>'+(new URL(current).searchParams.has('searchedKey')?rows:'')+'</table></form></body></html>').document;
 const frame={url:()=>current,evaluate:async(fn,input)=>fn(input,document()),locator:()=>({fill:async text=>{value=text;calls.push(['search',text]);},click:async()=>{const u=new URL(current);u.searchParams.set('searchedKey',value);current=u.href;}})};
 const vehicle={registration,typeId:'t_123',make:'Fixture',model:'Model',variant:'Engine'};
 const page={url:()=>current,goto:async target=>{calls.push(['navigate',target]);current=target;},frames:()=>[frame],waitForTimeout:async()=>{},evaluate:async()=>({...vehicle,registration}),
  locator:selector=>selector==='a[href]'?{evaluateAll:async()=>[base]}:selector==='#licencePlateBtn'?{count:async()=>1,click:async()=>{}}:{count:async()=>1,fill:async text=>{registration=text;}}};
 return {page,calls,setRows:text=>{rows=text;},redirect:url=>{current=url;}};
}
async function choicesFrom(read,choices){let result;await assert.rejects(read(choices),e=>{result=e.result;return e.code==='CHOICE_REQUIRED';});return result;}

test('diagnostic uses the shared explicit chooser when exact wording would reject a supplier badge',async()=>{
 const old=fixture();await assert.rejects(lookupGeneralHaynes(old.page,request),e=>e.detail==='REPLACEMENT_SCOPE_MISMATCH');
 const f=fixture(),read=await createHaynesLabourCheck(f.page,request);
 const choice=await choicesFrom(read);assert.equal(choice.stage,'HAYNES_LABOUR');assert.equal(choice.options[0].hoursMilli,1900);
 assert.match(choice.options[0].label,/Follow-up.*Renew the radiator/);assert.equal(choice.selectedPart,undefined);assert.equal(choice.request.choices,undefined);
 const answer=await read({labour:choice.options[0].id});assert.equal(answer.labour.hoursMilli,1900);assert.equal(answer.labour.scopeConfirmed,true);
 assert.equal(answer.parts,undefined);assert.equal(answer.quote,undefined);assert.equal(f.calls.filter(c=>c[0]==='navigate').length,2);
 const diagnostics=await captureHaynesDiagnostics(f.page,'radiator');
 assert.equal(diagnostics.frames[0].matchingLabels.length,0);assert.equal(diagnostics.frames[0].operations[0].hoursMilli,1900);
 assert.match(diagnostics.frames[0].operations[0].label,/Renew the radiator/);assert.ok(!JSON.stringify(diagnostics).includes('PRIVATE'));
});

test('a changed live time requires another choice and a changed vehicle cannot reuse a selection',async()=>{
 const f=fixture(),read=await createHaynesLabourCheck(f.page,request),choice=await choicesFrom(read),selected={labour:choice.options[0].id};
 f.setRows(row('Renew the radiator','2.10'));const changed=await choicesFrom(read,selected);assert.equal(changed.options[0].hoursMilli,2100);assert.notEqual(changed.options[0].id,selected.labour);
 f.redirect(base.replace('t_123','t_999'));await assert.rejects(read(selected),e=>e.detail==='VEHICLE_CHANGED');
});

test('the labour-only diagnostic supports alternate terminology and multiple operations without a parts list',async()=>{
 for(const part of ['coolant radiator','brake pads','generator','starter motor','suspension arm','shock absorber','coolant pump','thermostat','fuel pressure regulator','air conditioning compressor','clutch slave cylinder','window regulator','wiper motor','ignition coil','ABS sensor','door lock actuator']){
  const f=fixture(row('Renew the '+part,'1.20')+row('Renew the '+part+' assembly','2.40','1FX00000003'));
  const work=part==='brake pads'?'front brake pads':part,read=await createHaynesLabourCheck(f.page,{registration:'AB12CDE',work:'Supply and fit '+work});
  const result=await choicesFrom(read);assert.equal(result.options.length,2,part);
  const answer=await read({labour:result.options[1].id});assert.equal(answer.labour.hoursMilli,result.options[1].hoursMilli,part);
 }
});

test('pricing still requires a GSF selection; diagnostic choices cannot enter its request protocol',async()=>{
 await assert.rejects(lookupHaynesChoices({},request,{}),e=>e.detail==='PART_SELECTION_REQUIRED');
 assert.throws(()=>repairRequest({...request,flow:'guided-v1',choices:{labour:'a'.repeat(32)}}),e=>e.code==='INVALID_REQUEST');
});

test('labour-only prompt handles invalid choices, refinement, cancellation and group selections',async()=>{
 const result={stage:'HAYNES_LABOUR',options:[{id:'a'.repeat(32),label:'Renew the radiator'}]},answers=['','9','1'],logs=[];
 const selected=await promptHaynesLabourChoice({question:async()=>answers.shift()},{labourSearch:'coolant radiator'},result,{log:v=>logs.push(v)});
 assert.equal(selected.labour,result.options[0].id);assert.equal(logs.length,2);
 assert.deepEqual(await promptHaynesLabourChoice({question:async()=> 'generator'},selected,result),{labourSearch:'generator'});
 assert.equal(await promptHaynesLabourChoice({question:async()=> 'Q'},selected,result),null);
 assert.deepEqual(await promptHaynesLabourChoice({question:async()=> '1'},{labour:'old'},{stage:'HAYNES_MENU',options:[{label:'Cooling'}]}),{menus:['Cooling'],labour:undefined});
});
