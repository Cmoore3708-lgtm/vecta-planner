import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.js',import.meta.url),'utf8');
const url='https://www.haynespro-assets.com/workshop/images/319004648.svgz';
function setup(vehicles,tools={},saved=true,offscreen=false){const {window}=parseHTML('<html><body>'+vehicles.map(v=>'<button data-fleet-image="'+v.id+'"></button>').join('')+'</body></html>');for(const cell of window.document.querySelectorAll('[data-fleet-image]'))cell.getBoundingClientRect=()=>({top:offscreen?1200:10,bottom:offscreen?1240:50,width:100,height:40});let observer;let calls=0;const root={innerHeight:800,__vectaFleetState:()=>({vehicles,save:async()=>{calls++;return saved},render:()=>{}}),VectaHaynesJobTools:{safeImage:x=>x===url?x:'',...tools}};vm.runInNewContext(source,{window:root,document:window.document,MutationObserver:class{constructor(callback){observer=callback}observe(){}},setTimeout,queueMicrotask,CSS:{escape:v=>v}});return {api:root.VectaFleetImages,document:window.document,calls:()=>calls,root,observe:records=>observer(records)};}
test('matched Haynes images render via live state bridge, with colour preserved',async()=>{const v={id:'internal',fleetGroup:'Nissan Internal',model:'Qashqai'};const {api,document,calls}=setup([v],{genericImage:()=>({imageUrl:url})});assert.equal(document.querySelector('img').src,url);assert.equal(document.querySelector('svg'),null);await api.saveColour('internal','Blue');api.mount();assert.equal(calls(),1);assert.equal(document.querySelector('img').dataset.colour,'Blue');});
test('road vehicle lookup populates the same-model internal image without looking up an internal registration',async()=>{const regs=[];const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',registration:'MTC 2',model:'NV 200'},{id:'pool',fleetGroup:'Nissan Pool Cars',registration:'VN68 FPJ',model:'NV200'}];const {document}=setup(vehicles,{lookup:async reg=>{regs.push(reg);return {imageUrl:url}}});await new Promise(r=>setTimeout(r,10));assert.deepEqual(regs,['VN68 FPJ']);assert.equal(document.querySelectorAll('img').length,2);});
test('unmatched on-site equipment uses a local cart fallback without a registration lookup',async()=>{let lookups=0;const {document}=setup([{id:'internal',fleetGroup:'Nissan Internal',registration:'TCS 1',model:'Golf Buggy'}],{lookup:async()=>{lookups++}});await new Promise(r=>setTimeout(r,10));assert.equal(lookups,0);assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('svg').getAttribute('aria-label'),/Golf Buggy/);assert.equal(document.querySelector('svg g').getAttribute('transform'),'translate(210 0) scale(-1 1)');});
test('colour writes reject pool vehicles and invalid values and report cloud failure',async()=>{const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',model:'Leaf'},{id:'pool',fleetGroup:'Nissan Pool Cars',model:'Leaf'}];const {api,calls}=setup(vehicles,{},false);await assert.rejects(api.saveColour('pool','Blue'));await assert.rejects(api.saveColour('internal','invalid'));assert.equal(calls(),0);await assert.rejects(api.saveColour('internal','Green'),/has not synced/);assert.equal(vehicles[0].colour,'Green');});
test('contact email is inserted in all three list variants using the inherited email resolver',()=>{const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');assert.match(html,/function fleetContactEmailCell\(v\)\{var email=fleetEffectiveContactEmail\(v\)/);const body=html.slice(html.indexOf('function fleetMaintenanceHtml(){'),html.indexOf('function fleetHtml()'));assert.equal((body.match(/fleetContactEmailCell\(v\)/g)||[]).length,3);assert.match(body,/<span>Fleet \/ customer<\/span><span>Contact email<\/span><span>/);});
test('internal picker button stays on row one and image assets are cache-versioned',()=>{const css=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.css',import.meta.url),'utf8');assert.match(css,/\.fleetPanel \.fleetRow\.due30Columns>\*\{grid-row:1\}/);const build=fs.readFileSync(new URL('../../scripts/split-built-html.mjs',import.meta.url),'utf8');assert.match(build,/'vecta-fleet-images.js','vecta-fleet-images.css'/);});

test('offscreen Fleet rows do not start Haynes lookups or repaint until visible',async()=>{let lookups=0;const {api,document}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{lookup:async()=>{lookups++;return null}},true,true);await new Promise(r=>setTimeout(r,10));const cell=document.querySelector('[data-fleet-image]');api.mount();assert.equal(cell.children.length,0);assert.equal(lookups,0);cell.getBoundingClientRect=()=>({top:20,bottom:60,width:100,height:40});api.mount();await new Promise(r=>setTimeout(r,10));assert.equal(lookups,1);assert.ok(cell.querySelector('svg'));});
test('unrelated mutations and image painting do not schedule a Fleet rescan',async()=>{let snapshots=0;const {document,observe}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{snapshot:()=>{snapshots++;return {imageUrl:url}}});const before=snapshots;const unrelated=document.createElement('p');observe([{target:document.body,addedNodes:[unrelated]}]);const cell=document.querySelector('[data-fleet-image]');observe([{target:cell,addedNodes:[cell.querySelector('img')]}]);await new Promise(r=>setTimeout(r,130));assert.equal(snapshots,before);});
test('repeated mounts reuse artwork without rewriting local storage',()=>{let writes=0;const {api,root}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{snapshot:()=>({imageUrl:url})});root.localStorage={setItem:()=>writes++};api.mount();api.mount();assert.equal(writes,0);});

test('unavailable supplier images revert to a colour matched local drawing after bounded retries',()=>{const {document}=setup([{id:'road',model:'Navara',colour:'Blue'}],{snapshot:()=>({imageUrl:url})});const img=document.querySelector('img');img.onerror();img.onerror();img.onerror();assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('svg').outerHTML,/#235b9a/);assert.match(document.querySelector('svg').getAttribute('aria-label'),/Navara/);});

test('Fleet personalisation uses a local placeholder rather than starting a second supplier download',()=>{
 const {api,root,document}=setup([{id:'road',model:'Leaf',registration:'AB12CDE',colour:'Blue'}],{snapshot:()=>({imageUrl:url})});
 const sources=[];root.VectaVehicleImage={mount:cell=>sources.push(cell.querySelector('img').dataset.vehicleSource)};
 document.querySelector('[data-fleet-image]').dataset.imageKey='';api.mount();
 assert.deepEqual(sources,[url]);assert.match(document.querySelector('img').src,/^data:image\/svg/);assert.match(decodeURIComponent(document.querySelector('img').src),/#235b9a/);
});

test('large visible fleets paint in small batches and stop detached generations',async()=>{
 const vehicles=Array.from({length:12},(_,i)=>({id:String(i),model:'Leaf',registration:'AB12CDE'}));
 const {api,document}=setup(vehicles,{snapshot:()=>({imageUrl:url})});
 assert.equal(document.querySelectorAll('img').length,3);
 await new Promise(r=>setTimeout(r,100));assert.equal(document.querySelectorAll('img').length,12);
 for(const cell of document.querySelectorAll('[data-fleet-image]')){cell.replaceChildren();delete cell.dataset.imageKey;}
 api.mount();assert.equal(document.querySelectorAll('img').length,3);
 for(const cell of document.querySelectorAll('[data-fleet-image]'))cell.remove();
 api.mount();await new Promise(r=>setTimeout(r,60));assert.equal(document.querySelectorAll('img').length,0);
});

 test('MLG1 Qashqai rejects an NV200 registration image without poisoning other Qashqais',()=>{
 const van='https://www.haynespro-assets.com/workshop/images/123456.svgz';
 const vehicles=[{id:'mlg',registration:'MLG1',model:'Qashqai'},{id:'other',registration:'MLG2',model:'Qashqai'}];
 const {api,document}=setup(vehicles,{safeImage:x=>x,snapshot:r=>r==='MLG1'?{make:'Nissan',model:'NV200 Evalia (M20)',imageUrl:van}:null,genericImage:()=>({make:'Nissan',model:'Qashqai',imageUrl:url})});
 assert.equal(api.drawingFor(vehicles[0]).imageUrl,url);
 assert.equal(api.drawingFor(vehicles[1]).imageUrl,url);
 assert.equal(document.querySelector('img').src,url);
 });
 test('NV 200 still accepts NV200 Evalia saved artwork',()=>{
 const v={id:'van',registration:'MTC2',model:'NV 200'};
 const {api}=setup([v],{snapshot:()=>({model:'NV200 Evalia (M20)',imageUrl:url})});
 assert.equal(api.drawingFor(v).imageUrl,url);
 });

 test('manual artwork and colour are saved per internal vehicle, including blank registrations',async()=>{
 const a={id:'a',registration:'',fleetGroup:'Nissan Internal',model:'Internal car'},b={id:'b',registration:'',fleetGroup:'Nissan Internal',model:'Internal car'};
 const drawing={make:'Nissan',model:'Qashqai',imageUrl:url};const {api,calls}=setup([a,b],{storedArtwork:()=>[drawing]});
 await api.saveArtwork('a',drawing,'Red');assert.equal(calls(),1);assert.equal(api.drawingFor(a).imageUrl,url);assert.equal(a.colour,'Red');assert.equal(b.artwork,undefined);assert.equal(b.colour,undefined);
 const reload=setup([JSON.parse(JSON.stringify(a)),b],{storedArtwork:()=>[]});assert.equal(reload.api.drawingFor(a).imageUrl,url);
 await assert.rejects(api.saveArtwork('b',{...drawing,imageUrl:'https://evil.example/a.svg'},'Blue'));
 });

test('internal image picker previews a stored car and colour before saving both',async()=>{
 const v={id:'blank',registration:'',fleetGroup:'Nissan Internal',model:'Internal car'};const drawing={make:'Nissan',model:'Qashqai',imageUrl:url};const {api,document,calls}=setup([v],{storedArtwork:()=>[drawing]});
 const create=document.createElement.bind(document);document.createElement=name=>{const node=create(name);if(name==='dialog')node.showModal=()=>{};return node;};
 await api.openArtwork('blank');const dialog=document.querySelector('dialog');assert.ok(dialog);assert.equal(calls(),0);
 dialog.querySelector('.fleetStoredImageChoice').onclick();dialog.querySelector('[data-colour="Blue"]').onclick();assert.equal(calls(),0);assert.equal(dialog.querySelector('[data-colour="Blue"]').getAttribute('aria-pressed'),'true');
 await dialog.querySelector('[data-save-image]').onclick();assert.equal(calls(),1);assert.equal(v.artwork.imageUrl,url);assert.equal(v.colour,'Blue');assert.equal(document.querySelector('dialog'),null);
});
