import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {captureRepairCatalogue,waitForRepairGroups,readRepairGroups,gsfPartChoices} from '../../workers/repair-quotes/general-gsf.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {readRepairCardDiagnostics} from '../../workers/repair-quotes/catalogue-diagnostics.mjs';

const registration='AB12CDE',category='848';
const card=(price,grade,description,stock)=>`<div><span>£${price}</span><b>${grade}</b><span>${description}</span><span>${stock}</span></div>`;
const group=(sku,cards)=>`<section><h5>Radiator</h5><p>SKU: ${sku}</p><button>Attributes</button><div>${cards}</div><a href="/partdetails/${sku}">Part details</a></section>`;
const priced=card('124.40','Gold','Radiator','NDC');
const document=html=>parseHTML(`<html><body><main>${html}</main></body></html>`).document;
const snapshot=html=>readRepairGroups(document(html));
const good=snapshot(group('FIX123',priced));
function pageFixture({initialCategory=category,states=[good],vehicles=[true]}={}){
 let route='https://trade.gsfcarparts.com/parts/'+initialCategory,tick=0;const events=[];
 const page={url:()=>route,goto:async url=>{route=url;events.push('navigate');},waitForTimeout:async()=>{tick++;events.push('wait');},locator:selector=>({click:async()=>events.push('click:'+selector)}),evaluate:async fn=>{
  if(fn.name==='readServiceCategory')return {status:'CAPTURED_FOR_REVIEW',registration,selectedRegistration:vehicles[Math.min(tick,vehicles.length-1)],visibleText:'Fixture vehicle'};
  if(fn.name==='readRepairGroups')return states[Math.min(tick,states.length-1)];
  throw Error('Unexpected reader');
 }};
 return {page,events,setRoute:path=>{route='https://trade.gsfcarparts.com'+path;}};
}
test('general capture keeps the selected category and vehicle without clearing, reselection or opening dialogs',async()=>{
 const f=pageFixture();const result=await captureRepairCatalogue(f.page,registration,category);
 assert.equal(result.selectedRegistration,true);assert.deepEqual(f.events,[]);
 const other=pageFixture({initialCategory:'914',vehicles:[false,false,true]});
 assert.equal((await captureRepairCatalogue(other.page,registration,category)).selectedRegistration,true);
 assert.deepEqual(other.events,['navigate','wait','wait']);
});
test('missing vehicle evidence is never accepted and sign-in redirects stay explicit',async()=>{
 const f=pageFixture({vehicles:[false]});await assert.rejects(captureRepairCatalogue(f.page,registration,category,{attempts:3}),e=>e.detail==='VEHICLE_NOT_CONFIRMED');
 const g=pageFixture();g.setRoute('/signin');await assert.rejects(waitForRepairGroups(g.page,registration,category),e=>e.code==='LOGIN_REQUIRED');
});
test('catalogue polling waits through empty and changing product lists, including late additional fitments',async()=>{
 const empty={complete:false,groups:[]},second=snapshot(group('FIX123',priced)+group('FIX456',card('152.16','Gold','Radiator','RDC')));
 const f=pageFixture({states:[empty,empty,good,good,second,second,second,second]});
 const result=await waitForRepairGroups(f.page,registration,category);
 assert.equal(result.groups.length,2);assert.equal(f.events.filter(e=>e==='wait').length,7);
 const request={registration},scope=repairScope.resolve('Supply and fit radiator');
 const choices=gsfPartChoices(result.groups.map(group=>({group,option:group.options[0],rows:[],scope})),request,category);
 assert.equal(choices.length,2);assert.notEqual(choices[0].id,choices[1].id);
});
test('late expansion controls are clicked once while the expansion is pending',async()=>{
 const collapsed=snapshot(group('FIX123',priced+'<button>Show More</button>'));
 assert.equal(collapsed.moreSelectors.length,1);
 const f=pageFixture({states:[{complete:false,groups:[]},collapsed,collapsed,collapsed,good,good,good,good]});
 assert.equal((await waitForRepairGroups(f.page,registration,category)).complete,true);
 assert.equal(f.events.filter(e=>e.startsWith('click:')).length,1);
 const unrelated=snapshot(group('FIX123',priced)+'<aside><button>Show More</button></aside>');
 assert.deepEqual(unrelated.moreSelectors,[]);
});
test('incomplete, moving, wrong-vehicle and changed-category results cannot produce choices',async()=>{
 const incomplete={...good,complete:false};
 await assert.rejects(waitForRepairGroups(pageFixture({states:[incomplete]}).page,registration,category,{attempts:5}),e=>e.detail==='CATALOGUE_INCOMPLETE');
 const f=pageFixture({vehicles:[true,true,false]});await assert.rejects(waitForRepairGroups(f.page,registration,category),e=>e.detail==='VEHICLE_CHANGED');
 const g=pageFixture({initialCategory:'914'});await assert.rejects(waitForRepairGroups(g.page,registration,category),e=>e.detail==='CATEGORY_REDIRECTED');
 const shifting=[good,{...good,revision:1},good,{...good,revision:2}];
 await assert.rejects(waitForRepairGroups(pageFixture({states:shifting}).page,registration,category,{attempts:4}),e=>e.detail==='CATALOGUE_INCOMPLETE');
});
test('explicit unavailable zero-price cards are accounted for but never offered as free parts',()=>{
 const html=group('FIX123',priced+card('152.16','Gold','Radiator','RDC')+card('0.00','Bronze','','Out Of Stock')+card('0.00','Bronze','','Out Of Stock'));
 const result=snapshot(html);assert.equal(result.complete,true);assert.equal(result.groups[0].unavailableCount,2);
 assert.deepEqual(result.groups[0].options.map(o=>o.pricePence),[12440,15216]);
 for(const stock of ['Local Branch','RDC','NDC','Unknown',''])assert.equal(snapshot(group('FIX123',priced+card('0.00','Bronze','',stock))).complete,false);
 for(const extra of [card('0.00','Bronze','Radiator','Out Of Stock'),card('9.00','Unknown','Radiator','RDC'),card('9.00','Gold','','RDC')])assert.equal(snapshot(group('FIX123',priced+extra)).complete,false);
});
test('placeholder-only groups do not hide separately available fitment alternatives',()=>{
 const result=snapshot(group('FIX123',card('0.00','Bronze','','Out Of Stock'))+group('FIX456',priced));
 assert.equal(result.complete,true);assert.equal(result.groups.length,2);assert.equal(result.groups[0].options.length,0);assert.equal(result.groups[1].options.length,1);
});
test('diagnostics retain bounded visible price cards without account, input or hidden content',()=>{
 const doc=document('<aside>£1.00 account@example.test</aside><form>£2.00 secret</form>'+group('FIX123',priced+card('0.00','Bronze','','Out Of Stock')+'<div hidden>£3.00 hidden</div>')+'<input value="secret-password"><script>£4.00 secret-code</script>');
 const cards=readRepairCardDiagnostics(doc);
 assert.deepEqual(cards.map(c=>c.text),['£124.40 Gold Radiator NDC','£0.00 Bronze Out Of Stock']);
 assert.equal(JSON.stringify(cards).includes('secret'),false);
 const privateDoc=document(group('FIX123',card('10.00','Gold','test@example.test https://example.test/?token=private WBA12345678901234','RDC')));
 const saved=JSON.stringify(readRepairCardDiagnostics(privateDoc));assert.ok(saved.includes('[email]'));assert.ok(saved.includes('[link]'));assert.ok(saved.includes('[VIN]'));assert.equal(saved.includes('private'),false);
});
