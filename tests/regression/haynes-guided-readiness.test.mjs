import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {readHaynesRepairPage,readRepairMenus,captureHaynesDiagnostics} from '../../workers/repair-quotes/haynes-page.mjs';
import {lookupHaynesChoices} from '../../workers/repair-quotes/guided-haynes.mjs';
import {repairRequest,cleanRepairChoices} from '../../lib/repair-quote.js';
const origin='https://www.workshopdata.com',url=origin+'/touch/site/layout/repairTimes?typeId=t_123&groupId=QUICKGUIDES';
const doc=html=>parseHTML('<html><body>'+html+'</body></html>').document;
const request=repairRequest({registration:'AB12CDE',work:'Supply and fit radiator',flow:'guided-v1',choices:{part:'a'.repeat(32)}});
const vehicle={typeId:'t_123',make:'Fixture',model:'Model',variant:'Engine'},selectedPart={description:'Radiator',brand:'Fixture',sku:'R123',costPence:5000,inStock:false};
const tree=label=>'<ul><li role="treeitem" aria-expanded="false"><div><span>'+label+'</span></div></li></ul>';
const operation='<p>Total time (H)</p><ul><li><span>Renew radiator</span> <span>1BR1234567</span> <span>0.70</span></li></ul>';

test('nested tree and label nodes are one menu, but separate identically named groups remain distinct',()=>{
 const d=doc(tree('Cooling'));assert.deepEqual(readRepairMenus(d).map(m=>m.label),['Cooling']);
 const s=readHaynesRepairPage(d);assert.equal(s.menus[0].expanded,false);assert.equal(d.querySelector(s.menus[0].selector).textContent,'Cooling');
 assert.equal(readRepairMenus(doc(tree('Cooling')+tree('Cooling'))).length,2);
 assert.deepEqual(readRepairMenus(doc('<h3><button><span>Radiator</span></button></h3>')).map(m=>m.label),['Radiator']);
});
test('repair menus exclude navigation, hidden rows, operations and mutating or external links',()=>{
 const d=doc('<nav>'+tree('Cooling')+'</nav><header><h3>Account</h3></header><aside>'+tree('Private')+'</aside>'+tree('Cooling')+'<ul><li hidden><span>Secret</span></li><li><a href="https://other.example/">External</a></li><li><a href="/touch/site/layout/estimate">Estimate</a></li><li><span>Add to estimate</span></li><li><span>Renew radiator</span></li><li><span>Print</span></li><li><span>Buy now</span></li></ul>');
 assert.deepEqual(readRepairMenus(d).map(m=>m.label),['Cooling']);
});
test('observed Jobs and note headings never become repair choices, while actual groups remain readable',()=>{
 const headings='<h2>Jobs</h2><h3>Note</h3><h4>Important note</h4><h3>Total time (H)</h3>';
 assert.deepEqual(readRepairMenus(doc(headings)),[]);
 assert.deepEqual(readRepairMenus(doc(headings+tree('Cooling'))).map(m=>m.label),['Cooling']);
});

function fixture({delay=4,empty=false,login=false,search=false,alreadyExpanded=false,duplicate=false}={}){
 let tick=0,clickedAt=-1,current=search?url:url+'&searchedKey=Radiator';const clicks=[];
 const frame={url:()=>current,evaluate:async(fn,input)=>{
  let html=empty?'':tick<delay?'<p>Loading…</p>':tree(duplicate?'Cooling':'Radiator')+(duplicate?tree('Cooling'):'');
  if(search&&clickedAt<0)html='<div><input aria-label="Search repair operations"><button>Search</button></div>';
  if(alreadyExpanded)html=tree('Cooling').replace('false','true')+operation;
  if(clickedAt>=0){html=tree('Radiator').replace('false','true');if(tick-clickedAt>=5)html+=operation;else if(search)html+='<div aria-busy="true">Loading…</div>';}
  if(login)html='<input type="password" value="SECRET">';
  return fn(input,doc(html));
 },locator:selector=>({click:async()=>{clicks.push(selector);clickedAt=tick;if(search)current=url+'&searchedKey=Radiator';},fill:async value=>clicks.push('search:'+value),press:async()=>{clickedAt=tick;}})};
 const foreign={url:()=> 'https://other.example/repairTimes',evaluate:async()=>{throw Error('Foreign frame must not be read');}};
 const page={url:()=>current,frames:()=>[frame,foreign],waitForTimeout:async()=>{tick++;}};
 return {page,frame,clicks,tick:()=>tick,redirect:value=>{current=value;}};
}

test('delayed menu loading and delayed operation insertion yield real choices after one expansion',async()=>{
 const f=fixture();let result;
 await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>{result=cleanRepairChoices(e.result,request);return e.code==='CHOICE_REQUIRED'&&result.stage==='HAYNES_LABOUR';});
 assert.equal(result.options.length,1);assert.equal(result.options[0].hoursMilli,700);assert.equal(result.selectedPart.inStock,false);assert.equal(f.clicks.length,1);assert.ok(f.tick()>=11);
 const r=repairRequest({...request,choices:{...request.choices,labour:result.options[0].id}}),again=fixture();
 const answer=await lookupHaynesChoices(again.page,r,{vehicle,selectedPart});assert.equal(answer.labour.hoursMilli,700);assert.equal(answer.labour.choiceId,result.options[0].id);
});
test('repair search works inside its same-origin frame and waits for returned operations',async()=>{
 const f=fixture({search:true});await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.code==='CHOICE_REQUIRED'&&e.result.stage==='HAYNES_LABOUR');
 assert.equal(f.clicks[0],'search:Radiator');assert.equal(f.clicks.length,2);assert.ok(f.tick()>=7);
});
test('already expanded user groups are not toggled closed',async()=>{
 const f=fixture({alreadyExpanded:true}),r=repairRequest({...request,choices:{...request.choices,menus:['Cooling']}});
 await assert.rejects(lookupHaynesChoices(f.page,r,{vehicle,selectedPart}),e=>e.code==='CHOICE_REQUIRED'&&e.result.stage==='HAYNES_LABOUR');assert.equal(f.clicks.length,0);
});
test('empty, ambiguous, login and changed-vehicle pages cannot become empty successful choices',async()=>{
 let f=fixture({empty:true});await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.detail==='HAYNES_REPAIR_TREE_NOT_READABLE');assert.equal(f.clicks.length,0);
 f=fixture({duplicate:true});await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.detail==='HAYNES_NO_SELECTABLE_REPAIR_GROUP');assert.equal(f.clicks.length,0);
 f=fixture({login:true});await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.code==='LOGIN_REQUIRED');
 f=fixture();f.redirect(url.replace('t_123','t_999'));await assert.rejects(lookupHaynesChoices(f.page,request,{vehicle,selectedPart}),e=>e.detail==='VEHICLE_CHANGED');
});
test('Haynes diagnostics explain missing rows without input values, account text, foreign frames or URL queries',async()=>{
 const document=doc('<header>Account balance customer@example.com SECRET</header><input id="numberPlate" value="PRIVATE-PLATE"><input placeholder="Search repair operations" value="PRIVATE-SEARCH"><aside><p>Radiator private account</p></aside>'+tree('Cooling')+'<p>Radiator W0L00000000000000 contact@example.com https://example.com/?token=SECRET</p>');
 const frame={url:()=>url+'&token=SECRET',evaluate:async(fn,input)=>fn(input,document)},foreign={url:()=> 'https://elsewhere.example/?token=SECRET'};
 const result=await captureHaynesDiagnostics({frames:()=>[frame,foreign]},'radiator'),encoded=JSON.stringify(result);
 assert.equal(result.skippedFrames,1);assert.equal(result.frames[0].menuCount,1);assert.equal(result.frames[0].operationReadError,'OPERATION_NOT_VISIBLE');assert.equal(result.frames[0].searches.length,1);
 for(const value of ['SECRET','PRIVATE-PLATE','PRIVATE-SEARCH','customer@example','contact@example','W0L00000000000000','private account','token=','https://'])assert.ok(!encoded.includes(value),value);
 assert.match(encoded,/\[email\]/);assert.match(encoded,/\[VIN\]/);
});
test('unfinished checker reports inspect Haynes and direct manual review to the failed supplier',()=>{
 const source=fs.readFileSync('workers/repair-quotes/check-catalogue.mjs','utf8');assert.match(source,/report\.lastHaynesPage=await captureHaynesDiagnostics/);assert.match(source,/report\.supplier==='Haynes'/);assert.match(source,/manualHaynesReview/);
});
