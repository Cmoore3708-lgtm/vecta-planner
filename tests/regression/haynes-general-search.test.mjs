import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {readHaynesRepairPage} from '../../workers/repair-quotes/haynes-page.mjs';
import {haynesSearchUrl,searchHaynesRepair} from '../../workers/repair-quotes/haynes-search.mjs';
import {readAlternatorTime} from '../../workers/repair-quotes/repair-time-reader.mjs';
import {lookupHaynesChoices} from '../../workers/repair-quotes/guided-haynes.mjs';
import {lookupGeneralHaynes} from '../../workers/repair-quotes/general-haynes.mjs';
import {repairRequest,repairScope} from '../../lib/repair-quote.js';
const url='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId=t_123&groupId=QUICKGUIDES';
const vehicle={typeId:'t_123',make:'Fixture',model:'Model',variant:'Engine'};
const doc=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const controls='<div><input type="text"><button>Search</button><button>Reset</button></div>';
const row=(id,operation,time)=>'<li><span>'+id+'</span> <span>'+operation+'</span> <span>'+time+'</span></li>';
const screen=rows=>'<p>Total time (H)</p><ul>'+rows+'</ul>';
const pattern='\\b(?:Renew|Replace|Remove\\s+and\\s+refit)\\b';

test('unlabelled repair field is paired with its Search button, excluding nav and password controls',()=>{
 const d=doc('<nav>'+controls+'</nav><input type="password">'+controls);
 const searches=readHaynesRepairPage(d).searches;assert.equal(searches.length,1);
 assert.equal(d.querySelector(searches[0].selector).tagName,'INPUT');assert.equal(d.querySelector(searches[0].submitSelector).textContent,'Search');
 assert.equal(readHaynesRepairPage(doc('<div><input><input><button>Search</button></div>')).searches.length,0);
 assert.equal(readHaynesRepairPage(doc(controls+controls)).searches.length,2);
});

test('observed search destination encodes arbitrary wording and preserves only the verified vehicle route',()=>{
 const result=new URL(haynesSearchUrl(url,'t_123','timing belt & water pump kit'));
 assert.equal(result.searchParams.get('searchedKey'),'timing belt & water pump kit');assert.equal(result.searchParams.get('typeId'),'t_123');
 for(const changed of [url.replace('t_123','t_999'),url.replace('repairTimes','costEstimate'),url.replace('www.workshopdata.com','other.example'),url.replace('QUICKGUIDES','OTHER')])assert.throws(()=>haynesSearchUrl(changed,'t_123','radiator'),/LABOUR_REVIEW_REQUIRED/);
});

function pageFixture({initial=controls,rows='',delay=3}={}){
 let current=url,value='',tick=0,searchedAt=-1;const calls=[];
 const frame={url:()=>current,evaluate:async(fn,input)=>fn(input,doc(searchedAt<0?initial:tick-searchedAt<delay?'<p>Loading…</p>':screen(rows))),locator:selector=>({fill:async text=>{value=text;calls.push(['fill',text]);},click:async()=>{assert.equal(doc(initial).querySelector(selector)?.textContent,'Search');calls.push(['click','Search']);current=haynesSearchUrl(current,vehicle.typeId,value);searchedAt=tick;}})};
 const page={url:()=>current,frames:()=>[frame],goto:async target=>{calls.push(['goto',target]);current=target;searchedAt=tick;},waitForTimeout:async()=>{tick++;}};
 return {page,calls};
}

test('search fills the part and clicks Search; missing controls use the observed GET destination',async()=>{
 const f=pageFixture();await searchHaynesRepair(f.page,'t_123','radiator');assert.deepEqual(f.calls,[['fill','radiator'],['click','Search']]);
 const fallback=pageFixture({initial:'<h2>Jobs</h2><h3>Important note</h3>'});await searchHaynesRepair(fallback.page,'t_123','starter motor');
 assert.equal(fallback.calls.length,1);assert.equal(new URL(fallback.calls[0][1]).searchParams.get('searchedKey'),'starter motor');
 const ambiguous=pageFixture({initial:controls+controls});await assert.rejects(searchHaynesRepair(ambiguous.page,'t_123','radiator'),e=>e.detail==='HAYNES_SEARCH_CONTROL_AMBIGUOUS');assert.equal(ambiguous.calls.length,0);
});

test('plus-prefixed Renew time stays with its own row, excluding Check/Clean/Repair and their times',()=>{
 const rows=row('1FX00000001','Check the radiator','0.20')+row('1FX00000002','FOLLOW UP Renew the radiator','+1.90')+row('1FX00000003','Clean the radiator','+0.10')+row('1FX00000004','Repair the radiator','+0.50');
 const [result]=readAlternatorTime({operationPattern:pattern,allowMultiple:true},doc(screen(rows)));
 assert.equal(result.operationId,'1FX00000002');assert.equal(result.hoursMilli,1900);
 for(const time of ['+ 1.90','+1,90','1.90'])assert.equal(readAlternatorTime({operationPattern:pattern},doc(screen(row('1FX00000002','Renew the radiator',time)))).hoursMilli,1900);
 assert.throws(()=>readAlternatorTime({operationPattern:pattern},doc(screen(row('1FX00000002','Renew the radiator','-1.90')))),/INVALID_TIME/);
 assert.throws(()=>readAlternatorTime({operationPattern:pattern},doc(screen(row('1FX00000001','Check the radiator','0.20')+row('1FX00000002','Renew the radiator','')))),/TIME_NOT_FOUND/);
 assert.throws(()=>readAlternatorTime({operationPattern:pattern},doc('<p>Total time (H) 3.50</p><ul>'+row('1FX00000002','Renew the radiator','')+'</ul>')),/TIME_NOT_FOUND/);
});

test('Haynes-only check uses verified vehicle navigation, searches and reads FOLLOW UP 1.90 without GSF',async()=>{
 const f=pageFixture({rows:row('1FX00000001','Check the radiator','0.20')+row('1FX00000002','FOLLOW UP Renew the radiator','+1.90')});
 let registration='';const goto=f.page.goto;
 f.page.goto=async target=>{await goto(target);};
 f.page.evaluate=async()=>({...vehicle,registration});
 f.page.locator=selector=>selector==='a[href]'?{evaluateAll:async()=>[url]}:selector==='#licencePlateBtn'?{count:async()=>1,click:async()=>{}}:{count:async()=>1,fill:async value=>{registration=value;}};
 // Navigation must reset the page from the makes overview to the empty repair
 // search, as happens before a new search on the workshop PC.
 const realFrames=f.page.frames;
 f.page.frames=()=>realFrames().map(frame=>({...frame,evaluate:async(fn,input)=>fn(input,doc(new URL(f.page.url()).searchParams.has('searchedKey')?screen(row('1FX00000001','Check the radiator','0.20')+row('1FX00000002','FOLLOW UP Renew the radiator','+1.90')):controls))}));
 const result=await lookupGeneralHaynes(f.page,repairRequest({registration:'AB12CDE',work:'Supply and fit radiator'}));
 assert.equal(result.labour.hoursMilli,1900);assert.equal(result.labour.registration,'AB12CDE');assert.equal(result.labour.operationId,'1FX00000002');
 assert.ok(f.calls.some(c=>c[0]==='click'&&c[1]==='Search'));assert.equal(registration,'AB12CDE');
});

test('the same search-to-choice-to-evidence flow works across part families, without a radiator-specific path',async()=>{
 const repairs=['radiator','front brake pads','rear brake discs','alternator','starter motor','front left wishbone','rear shock absorber','water pump','thermostat housing','fuel pressure regulator','air conditioning compressor','clutch slave cylinder','window regulator','wiper motor','ignition coil','ABS sensor'];
 for(const [index,part] of repairs.entries()){
  const request=repairRequest({registration:'AB12CDE',work:'Supply and fit '+part,flow:'guided-v1',choices:{part:'a'.repeat(32)}}),query=repairScope.resolve(request.work).query;
  const selectedPart={description:query,sku:'FIXTURE',brand:'Fixture',costPence:5000,inStock:false};
  const amount=index===0?'1.90':(0.50+index/10).toFixed(2),rows=row('1FX00000001','Check the '+part,'0.20')+row('1FX00000002','Renew the '+part,'+'+amount)+row('1FX00000003','Clean the '+part,'+0.10');
  const f=pageFixture({rows});let choice;
  await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>{choice=e.result;return e.code==='CHOICE_REQUIRED'&&choice.stage==='HAYNES_LABOUR';},part);
  assert.equal(choice.options.length,1,part);assert.equal(choice.options[0].hoursMilli,Math.round(Number(amount)*1000),part);assert.deepEqual(f.calls,[['fill',query],['click','Search']],part);
  const confirmed=repairRequest({...request,choices:{...request.choices,labour:choice.options[0].id}});
  const evidence=await lookupHaynesChoices(f.page,confirmed,{vehicle,selectedPart});assert.equal(evidence.labour.hoursMilli,choice.options[0].hoursMilli,part);
 }
});

test('multiple renew operations are explicit choices and changed hours cannot reuse a selection',async()=>{
 const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1',choices:{part:'a'.repeat(32)}}),selectedPart={description:'radiator'};
 const f=pageFixture({rows:row('1FX00000001','Renew the radiator','+1.90')+row('1FX00000002','Renew the radiator with automatic transmission','+2.40')});let choices;
 await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>{choices=e.result.options;return e.code==='CHOICE_REQUIRED';});assert.equal(choices.length,2);
 const stale=repairRequest({...request,choices:{...request.choices,labour:choices[0].id}}),changed=pageFixture({rows:row('1FX00000001','Renew the radiator','+2.10')});
 await assert.rejects(lookupHaynesChoices(changed.page,stale,{vehicle,selectedPart}),e=>e.code==='CHOICE_REQUIRED'&&e.result.options[0].hoursMilli===2100);
});

test('unpriced or invalid replacement rows do not fall back to unrelated menu choices',async()=>{
 const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1',choices:{part:'a'.repeat(32)}}),selectedPart={description:'radiator'};
 for(const [time,reason] of [['','HAYNES_TIME_NOT_FOUND'],['-1.90','HAYNES_INVALID_TIME_ROW']]){
  const f=pageFixture({rows:row('1FX00000001','Renew the radiator',time)+'<li><span>Cooling system</span></li>'});
  await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.detail===reason);
 }
});
