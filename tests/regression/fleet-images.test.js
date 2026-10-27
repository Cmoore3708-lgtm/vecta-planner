import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const source=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.js',import.meta.url),'utf8');
const url='https://www.haynespro-assets.com/workshop/images/319004648.svgz';
function setup(vehicles,tools={},saved=true,offscreen=false){const {window}=parseHTML('<html><body>'+vehicles.map(v=>'<button data-fleet-image="'+v.id+'"></button>').join('')+'</body></html>');for(const cell of window.document.querySelectorAll('[data-fleet-image]'))cell.getBoundingClientRect=()=>({top:offscreen?1200:10,bottom:offscreen?1240:50,width:100,height:40});let observer;let calls=0;const root={innerHeight:800,__vectaFleetState:()=>({vehicles,save:async()=>{calls++;return saved},render:()=>{}}),VectaHaynesJobTools:{safeImage:x=>x===url?x:'',...tools}};vm.runInNewContext(source,{window:root,document:window.document,MutationObserver:class{constructor(callback){observer=callback}observe(){}},setTimeout,queueMicrotask,CSS:{escape:v=>v}});return {api:root.VectaFleetImages,document:window.document,calls:()=>calls,root,observe:records=>observer(records)};}
test('matched Haynes images render via live state bridge, with colour preserved',async()=>{const v={id:'internal',fleetGroup:'Nissan Internal',model:'Qashqai J11'};const {api,document,calls}=setup([v],{storedArtwork:()=>[{make:'Nissan',model:'Qashqai (J11)',imageUrl:url}]});assert.equal(document.querySelector('img').src,url);assert.equal(document.querySelector('svg'),null);await api.saveColour('internal','Blue');api.mount();assert.equal(calls(),1);assert.equal(document.querySelector('img').dataset.colour,'Blue');});
test('Fleet display never looks up a registered donor for a missing internal image',async()=>{const regs=[];const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',registration:'MTC 2',model:'NV 200'},{id:'pool',fleetGroup:'Nissan Pool Cars',registration:'VN68 FPJ',model:'NV200'}];const {document}=setup(vehicles,{lookup:async reg=>{regs.push(reg);return {imageUrl:url}}});await new Promise(r=>setTimeout(r,10));assert.deepEqual(regs,[]);assert.equal(document.querySelectorAll('img').length,0);});
test('unmatched on-site equipment uses a local cart fallback without a registration lookup',async()=>{let lookups=0;const {document}=setup([{id:'internal',fleetGroup:'Nissan Internal',registration:'TCS 1',model:'Golf Buggy'}],{lookup:async()=>{lookups++}});await new Promise(r=>setTimeout(r,10));assert.equal(lookups,0);assert.equal(document.querySelector('img'),null);assert.match(document.querySelector('svg').getAttribute('aria-label'),/Golf Buggy/);assert.equal(document.querySelector('svg g').getAttribute('transform'),'translate(210 0) scale(-1 1)');});
test('colour writes support pool vehicles, reject invalid values and report cloud failure',async()=>{const vehicles=[{id:'internal',fleetGroup:'Nissan Internal',model:'Leaf'},{id:'pool',fleetGroup:'Nissan Pool Cars',model:'Leaf'}];const {api,calls}=setup(vehicles,{},false);await assert.rejects(api.saveColour('pool','Blue'),/not synced/);await assert.rejects(api.saveColour('internal','invalid'));assert.equal(calls(),1);await assert.rejects(api.saveColour('internal','Green'),/not synced/);assert.equal(vehicles[0].colour,'Green');});
test('contact email is inserted in all three list variants using the inherited email resolver',()=>{const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');assert.match(html,/function fleetContactEmailCell\(v\)\{var email=fleetEffectiveContactEmail\(v\)/);const body=html.slice(html.indexOf('function fleetMaintenanceHtml(){'),html.indexOf('function fleetHtml()'));assert.equal((body.match(/fleetContactEmailCell\(v\)/g)||[]).length,3);assert.match(body,/<span>Fleet \/ customer<\/span><span>Contact email<\/span><span>/);});
test('internal picker button stays on row one and image assets are cache-versioned',()=>{const css=fs.readFileSync(new URL('../../public/js/vecta-fleet-images.css',import.meta.url),'utf8');assert.match(css,/\.fleetPanel \.fleetRow\.due30Columns>\*\{grid-row:1\}/);const build=fs.readFileSync(new URL('../../scripts/split-built-html.mjs',import.meta.url),'utf8');assert.match(build,/'vecta-fleet-images.js','vecta-fleet-images.css'/);});

test('offscreen Fleet rows do not start Haynes lookups or repaint until visible',async()=>{let lookups=0;const {api,document}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{lookup:async()=>{lookups++;return null}},true,true);await new Promise(r=>setTimeout(r,10));const cell=document.querySelector('[data-fleet-image]');api.mount();assert.equal(cell.children.length,0);assert.equal(lookups,0);cell.getBoundingClientRect=()=>({top:20,bottom:60,width:100,height:40});api.mount();await new Promise(r=>setTimeout(r,10));assert.equal(lookups,0);assert.ok(cell.querySelector('svg'));});
test('unrelated mutations and image painting do not schedule a Fleet rescan',async()=>{let snapshots=0;const {document,observe}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{snapshot:()=>{snapshots++;return {imageUrl:url}}});const before=snapshots;const unrelated=document.createElement('p');observe([{target:document.body,addedNodes:[unrelated]}]);const cell=document.querySelector('[data-fleet-image]');observe([{target:cell,addedNodes:[cell.querySelector('img')]}]);await new Promise(r=>setTimeout(r,130));assert.equal(snapshots,before);});
test('repeated mounts reuse artwork without rewriting local storage',()=>{let writes=0;const {api,root}=setup([{id:'road',model:'Leaf',registration:'NK75BBX'}],{snapshot:()=>({imageUrl:url})});root.localStorage={setItem:()=>writes++};api.mount();api.mount();assert.equal(writes,0);});

test('unavailable saved images retain their exact image choice after bounded retries',()=>{const {document}=setup([{id:'road',model:'Navara',colour:'Blue'}],{snapshot:()=>({imageUrl:url})});const img=document.querySelector('img');img.onerror();img.onerror();img.onerror();assert.equal(document.querySelector('img'),img);assert.equal(document.querySelector('svg'),null);});

test('Fleet personalisation uses a local placeholder rather than starting a second supplier download',()=>{
 const {api,root,document}=setup([{id:'road',model:'Leaf',registration:'AB12CDE',colour:'Blue'}],{snapshot:()=>({imageUrl:url})});
 const sources=[];root.VectaVehicleImage={mount:cell=>sources.push(cell.querySelector('img').dataset.vehicleSource)};
 document.querySelector('[data-fleet-image]').dataset.imageKey='';api.mount();
 assert.deepEqual(sources,[url]);assert.equal(document.querySelector('img').src,url);
});

test('large visible fleets paint in small batches and stop detached generations',async()=>{
 const vehicles=Array.from({length:12},(_,i)=>({id:String(i),model:'Leaf',registration:'AB12CDE'}));
 const {api,document}=setup(vehicles,{snapshot:()=>({imageUrl:url})});
 assert.equal(document.querySelectorAll('img').length,3);
 // Wait for the observable batch result rather than assuming an unloaded event loop.
 for(let attempt=0;attempt<100&&document.querySelectorAll('img').length<12;attempt++)await new Promise(r=>setTimeout(r,20));
 assert.equal(document.querySelectorAll('img').length,12);
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

test('planner artwork resolves a blank registration by fleet ID without mixing internal cars',()=>{
 const a={id:'a',fleetGroup:'Nissan Internal',registration:'',artwork:{imageUrl:url}},b={id:'b',fleetGroup:'Nissan Internal',registration:''};const {api}=setup([a,b]);
 assert.equal(api.forJob({fleet_vehicle_id:'a'}).drawing.imageUrl,url);assert.equal(api.forJob({registration:''}),null);assert.equal(api.forJob({vehicle_id:'b'}).drawing,null);
});

test('an app vehicle ID does not hide a saved internal fleet image matched by registration',()=>{const v={id:'fleet-a',fleetGroup:'Nissan Internal',registration:'MTC 2',model:'NV200',artwork:{imageUrl:url}};const {api}=setup([v]);assert.equal(api.forJob({vehicle_id:'different-app-id',registration:'MTC2'}).drawing.imageUrl,url);});

const j12='https://www.haynespro-assets.com/workshop/images/319106279.svgz';
test('internal Nissan descriptions match stored generations without a registration or lookup',()=>{
 const vehicles=[{id:'j11',fleetGroup:'Nissan Internal',model:'NISSAN Qashqai J11 Tekna',colour:'Blue'}, {id:'j12',fleetGroup:'Nissan Internal',registration:'RESCUE 2',model:'QASHQAI (J12)',colour:'Green'}];
 let lookups=0;const {api,document}=setup(vehicles,{safeImage:x=>/^https:\/\/www\.haynespro-assets\.com\//.test(x||'')?x:'',lookup:()=>lookups++});
 assert.equal(api.drawingFor(vehicles[0]).imageUrl,url);assert.equal(api.drawingFor(vehicles[1]).imageUrl,j12);
 assert.equal(api.forJob({fleet_vehicle_id:'j12'}).drawing.imageUrl,j12);
 assert.equal(document.querySelectorAll('img')[1].dataset.colour,'Green');assert.equal(lookups,0);
 assert.equal(vehicles[0].artwork,undefined);assert.equal(vehicles[1].artwork,undefined);
});
test('internal model defaults use real drawings when the variant is unspecified',()=>{
 const vehicles=['Qashqai','Juke','Leaf'].map(model=>({id:model,fleetGroup:'Nissan Internal',model}));
 const {api,document}=setup(vehicles,{safeImage:x=>x});
 assert.equal(api.drawingFor(vehicles[0]).imageUrl,url);
 assert.match(api.drawingFor(vehicles[1]).imageUrl,/319004664/);
 assert.match(api.drawingFor(vehicles[2]).imageUrl,/319004630/);
 assert.equal(document.querySelectorAll('img').length,3);
 for(const img of document.querySelectorAll('img'))assert.equal(img.dataset.colour,'White');
 for(const v of vehicles){assert.equal(v.artwork,undefined);assert.equal(v.colour,undefined);}
});
test('one saved choice supplies matching descriptions after reload with independent colours',async()=>{
 const a={id:'a',fleetGroup:'Nissan Internal',model:'Nissan Qashqai',colour:'Red'},b={id:'b',fleetGroup:'Nissan Internal',model:'Qashqai',colour:'Green'};
 const {api}=setup([a,b],{safeImage:x=>x});await api.saveArtwork('a',{make:'Nissan',model:'Qashqai (J12)',imageUrl:j12},'Blue');
 assert.equal(api.drawingFor(b).imageUrl,j12);assert.equal(b.colour,'Green');assert.equal(b.artwork,undefined);
 const reload=setup(JSON.parse(JSON.stringify([a,b])),{safeImage:x=>x});
 assert.equal(reload.api.forJob({fleet_vehicle_id:'b'}).drawing.imageUrl,j12);
 assert.equal(reload.document.querySelectorAll('img')[1].dataset.colour,'Green');
});
test('conflicting variants use a stable same-model drawing and reject other makes',()=>{
 const vehicles=[{id:'a',fleetGroup:'Nissan Internal',model:'Qashqai',artwork:{make:'Nissan',model:'Qashqai J11',imageUrl:url}},{id:'b',fleetGroup:'Nissan Internal',model:'Qashqai',artwork:{make:'Nissan',model:'Qashqai J12',imageUrl:j12}},{id:'c',fleetGroup:'Nissan Internal',model:'Qashqai'},{id:'leaf',fleetGroup:'Nissan Internal',model:'Leaf'}];
 const {api}=setup(vehicles,{safeImage:x=>x,storedArtwork:()=>[{make:'Ford',model:'Leaf',imageUrl:'https://www.haynespro-assets.com/workshop/images/999.svgz'}]});
 assert.equal(api.drawingFor(vehicles[2]).imageUrl,url);assert.match(api.drawingFor(vehicles[3]).imageUrl,/319004630/);assert.equal(api.drawingFor(vehicles[0]).imageUrl,url);assert.equal(api.drawingFor(vehicles[1]).imageUrl,j12);
});
test('colour can still be changed when no stored Nissan model matches',async()=>{
 const v={id:'unknown',fleetGroup:'Nissan Internal',model:'Internal car'};const {api,document,calls}=setup([v]);
 const create=document.createElement.bind(document);document.createElement=name=>{const el=create(name);if(name==='dialog')el.showModal=()=>{};return el;};
 await api.openArtwork(v.id);const dialog=document.querySelector('dialog');assert.equal(dialog.querySelector('[data-save-image]').textContent,'Save colour');
 dialog.querySelector('[data-colour="Green"]').onclick();await dialog.querySelector('[data-save-image]').onclick();
 assert.equal(v.colour,'Green');assert.equal(v.artwork,undefined);assert.equal(calls(),1);
});
test('internal van aliases distinguish e-NV200 from NV200 and permit representative generations',()=>{
 const ev='https://www.haynespro-assets.com/workshop/images/998.svgz',van='https://www.haynespro-assets.com/workshop/images/997.svgz';
 const vehicles=[{id:'ev',fleetGroup:'Nissan Internal',model:'Nissan e-NV 200'},{id:'van',fleetGroup:'Nissan Internal',model:'NV 200'},{id:'old',fleetGroup:'Nissan Internal',model:'Qashqai J10'}];
 const {api}=setup(vehicles,{safeImage:x=>x,storedArtwork:()=>[{make:'Nissan',model:'e-NV200',imageUrl:ev},{make:'Nissan',model:'NV200 Evalia (M20)',imageUrl:van}]});
 assert.equal(api.drawingFor(vehicles[0]).imageUrl,ev);assert.equal(api.drawingFor(vehicles[1]).imageUrl,van);assert.equal(api.drawingFor(vehicles[2]).imageUrl,url);
});

test('road fleet choices remain per vehicle and planner images resolve the same saved choice',async()=>{
 const a={id:'road-a',registration:'AB12CDE',make:'Nissan',model:'Leaf',fleetGroup:'Nissan Pool Cars'},b={id:'road-b',registration:'AB12CDF',model:'Leaf'};
 const drawing={make:'Nissan',model:'Qashqai',imageUrl:url};const {api}=setup([a,b],{storedArtwork:()=>[drawing]});
 await api.saveArtwork(a.id,drawing,'Blue');assert.equal(api.forJob({registration:'AB12CDE'}).drawing.imageUrl,url);assert.equal(b.artwork,undefined);
 const node={dataset:{registration:'AB12 CDE'},closest:()=>null};assert.equal(api.imageVehicle(node).id,a.id);
});
test('nonfleet image selection saves artwork against registration without altering job or invoice records',async()=>{
 let saved;const drawing={make:'Ford',model:'Focus',imageUrl:url};const {api,document}=setup([],{storedArtwork:()=>[drawing],saveManualArtwork:async value=>{saved=value}});
 const v=api.imageVehicle({dataset:{registration:'AB12 CDE',vehicleMake:'Ford',vehicleName:'Focus'},closest:()=>null});
 const create=document.createElement.bind(document);document.createElement=name=>{const node=create(name);if(name==='dialog')node.showModal=()=>{};return node;};
 await api.openArtwork(v.id);assert.equal(document.querySelectorAll('.fleetStoredImageChoice').length,1);
 await api.saveArtwork(v.id,drawing,'Green');assert.equal(saved.registration,'AB12CDE');assert.equal(saved.colour,'Green');assert.equal(saved.imageUrl,url);
 document.querySelector('dialog').remove();
});
test('duplicate fleet references require a fleet ID rather than choosing the first vehicle',()=>{
 const {api}=setup([{id:'a',registration:'TCS1'},{id:'b',registration:'TCS1'}]);assert.equal(api.imageVehicle({dataset:{registration:'TCS1'},closest:()=>null}),null);
});
test('clicking vehicle images in any view opens the picker without opening the containing job',async()=>{
 const {api,document}=setup([]);const create=document.createElement.bind(document);document.createElement=name=>{const node=create(name);if(name==='dialog')node.showModal=()=>{};return node;};
 for(const name of ['planner','invoice','serviceSheet','jobHeader']){
  const image=create('img');image.dataset.registration='AB12CDE';image.className=name;document.body.appendChild(image);
  image.click();assert.ok(document.querySelector('dialog'),name);document.querySelector('dialog').remove();image.remove();
 }
});
test('a service sheet image with a blank registration resolves its containing fleet identity',()=>{
 const v={id:'blank',registration:'',fleetGroup:'Nissan Internal',model:'Leaf'};const {api,document}=setup([v]);const wrapper=document.createElement('div');wrapper.dataset.fleetArtworkId=v.id;wrapper.dataset.vehiclePicker='';const image=document.createElement('img');wrapper.appendChild(image);document.body.appendChild(wrapper);assert.equal(api.imageVehicle(image).id,v.id);
});

// Chris explicitly requested representative model drawings with white defaults.
test('the four reported internal references use model drawings and white defaults',()=>{
 const vehicles=['PROD 1','RESCUE','SERV ENG','TC 1'].map((registration,i)=>({id:'internal-'+i,registration,model:'Qashqai',fleetGroup:'Nissan Internal'}));
 const {api,document,calls}=setup(vehicles,{safeImage:x=>x});
 for(const v of vehicles){assert.equal(api.drawingFor(v).imageUrl,url);assert.equal(api.forJob({fleet_vehicle_id:v.id}).vehicle.colour,'White');}
 assert.equal(document.querySelectorAll('svg').length,0);assert.equal(calls(),0);
});
test('manual images and colours win over model defaults, including corrected model descriptions',()=>{
 const vehicles=[{id:'manual',registration:'MTC 2',fleetGroup:'Nissan Internal',model:'Qashqai',artwork:{make:'Nissan',model:'NV300',imageUrl:j12},colour:'Blue'},{id:'default',fleetGroup:'Nissan Internal',model:'Qashqai',colour:'Red'}];
 const {api,document}=setup(vehicles,{safeImage:x=>x});
 assert.equal(api.drawingFor(vehicles[0]).imageUrl,j12);
 assert.equal(api.forJob({fleet_vehicle_id:'manual'}).vehicle.colour,'Blue');
 assert.equal(document.querySelectorAll('img')[1].dataset.colour,'Red');
});
test('a model default can be overridden and the deliberate choice survives reload',async()=>{
 const v={id:'override',registration:'PROD 1',fleetGroup:'Nissan Internal',model:'Qashqai'};
 const first=setup([v],{safeImage:x=>x});assert.equal(first.api.drawingFor(v).imageUrl,url);
 await first.api.saveArtwork(v.id,{make:'Nissan',model:'Qashqai (J12)',imageUrl:j12},'Green');
 const saved=JSON.parse(JSON.stringify(v)),reload=setup([saved],{safeImage:x=>x});
 assert.equal(reload.api.drawingFor(saved).imageUrl,j12);assert.equal(reload.document.querySelector('img').dataset.colour,'Green');
});
