(function(root){
'use strict';
const palette={White:'#f5f5f2',Black:'#191b20',Silver:'#bfc3c8',Grey:'#626970',Blue:'#235b9a',Red:'#ac1727',Green:'#296145',Yellow:'#e5ba20',Orange:'#d56b22',Brown:'#77513b',Beige:'#c1ac88',Gold:'#b59a50',Purple:'#654282'};
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function kind(model){const s=String(model||'').toLowerCase();return /buggy|golf|elec.*cart/.test(s)?'cart':/pick.?up|ranger|navara|hilux/.test(s)?'pickup':/nv\s?200|ev\s?200|nv\s?400|interstar|primastar|transit|van|vito|sprinter|master|trafic|partner|berlingo/.test(s)?'van':/qashqai|juke|ariya|pathfinder|x.?trail|suv|defender/.test(s)?'suv':'car';}
function artwork(model,colour){const type=kind(model),paint=palette[Object.keys(palette).find(c=>c.toLowerCase()===String(colour||'').toLowerCase())]||'#bfc3c8';const body={car:'M24 72 L40 48 Q45 41 58 41 H115 L148 66 L181 73 Q190 77 190 88 V99 H18 V82 Z',suv:'M22 71 L40 34 H129 L155 65 L185 72 V103 H18 V82 Z',van:'M20 30 H134 L157 61 L182 69 V103 H18 Z',pickup:'M22 68 L41 35 H97 L123 68 H184 V103 H18 Z',cart:'M30 76 H132 L161 86 V103 H25 Z'}[type];const windows=type==='cart'?'<path d="M40 76 V29 H124 V76 M29 27 H136" fill="none" stroke="#475569" stroke-width="6"/><path d="M60 76 V60 H88 V76" fill="#475569"/>':type==='van'?'<path d="M104 38 H129 L148 64 H104 Z" fill="#b8d5e6"/>':type==='pickup'?'<path d="M47 43 H91 L109 65 H38 Z" fill="#b8d5e6"/>':'<path d="M48 49 H113 L136 66 H36 Z" fill="#b8d5e6"/>';
return '<svg viewBox="0 0 210 130" role="img" aria-label="Generic '+esc(model||type)+' illustration" xmlns="http://www.w3.org/2000/svg"><g transform="translate(210 0) scale(-1 1)"><ellipse cx="104" cy="113" rx="91" ry="7" fill="#0f172a" opacity=".10"/><path d="'+body+'" fill="'+paint+'" stroke="#475569" stroke-width="2"/>'+windows+'<path d="M20 94 H188" stroke="#64748b" stroke-width="3"/><rect x="170" y="77" width="14" height="8" rx="2" fill="#fff2bd"/>'+[49,154].map(x=>'<circle cx="'+x+'" cy="101" r="16" fill="#20252c"/><circle cx="'+x+'" cy="101" r="9" fill="#b5bcc4"/><circle cx="'+x+'" cy="101" r="3" fill="#475569"/>').join('')+'</g></svg>';}

const cacheKey='vecta_fleet_haynes_artwork_v2',catalog=new Map();
// Model/asset pairs already verified by the drawing audit. The usual permanent
// source cache serves these too; displaying one never opens the Haynes worker.
const nissanCatalogue=[['Qashqai (J11)','319004648'],['Qashqai (J12)','319106279'],['Pulsar','319004637'],['Juke','319004664']].map(([model,asset])=>({make:'Nissan',model,imageUrl:'https://www.haynespro-assets.com/workshop/images/'+asset+'.svgz'}));
const modelKey=v=>String(v||'').toUpperCase().replace(/\b(NISSAN|FORD|MERCEDES(?: BENZ)?|INFINITI|CITROEN|RENAULT)\b/g,'').replace(/[^A-Z0-9]/g,'');
try{for(const entry of JSON.parse(root.localStorage?.getItem(cacheKey)||'[]'))if(entry.model&&/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(entry.imageUrl))catalog.set(modelKey(entry.model),entry);}catch{}
function compatible(v,drawing){
 if(root.VectaHaynesJobTools?.compatibleArtwork)return root.VectaHaynesJobTools.compatibleArtwork(drawing,{make:v.make,model:v.model});
 if(!drawing)return false;
 const expected=modelKey(v.model),actual=modelKey(String(drawing.model||'').split(/[(/]/)[0]);
 if(expected&&actual&&expected!==actual&&!(/^[A-Z]+\d+$/.test(expected)&&actual.startsWith(expected)&&!/^\d/.test(actual.slice(expected.length))))return false;
 return !v.make||!drawing.make||String(v.make).toUpperCase().replace(/[^A-Z0-9]/g,'')===String(drawing.make).toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function remember(v,drawing){if(drawing?.manual)return;if(!compatible(v,drawing))return;if(!root.VectaHaynesJobTools?.safeImage(drawing?.imageUrl))return;const key=modelKey(v.model);if(catalog.get(key)?.imageUrl===drawing.imageUrl)return;catalog.set(key,{model:v.model,imageUrl:drawing.imageUrl,make:drawing.make||'',source:'HaynesPro'});try{root.localStorage?.setItem(cacheKey,JSON.stringify([...catalog.values()]));}catch{}}
function modelArtwork(model){return catalog.get(modelKey(model))||null;}
// Internal fleet references are not road registrations. Match their description
// against saved Nissan drawings instead, and never choose between generations.
function nissanDescription(model){
 const text=String(model||'').toUpperCase().replace(/\bNISSAN\b/g,'').replace(/\b(E|NV|NT)\s*-?\s*(\d+)/g,'$1$2').replace(/\bX\s*-?\s*TRAIL\b/g,'XTRAIL').replace(/[^A-Z0-9]+/g,' ').trim();
 const family=text.match(/\b(QASHQAI|JUKE|LEAF|MICRA|NOTE|PULSAR|ALMERA|PRIMERA|ARIYA|NAVARA|PATHFINDER|XTRAIL|NV200|E\s?NV200|NV300|NV400|NT400|PRIMASTAR|INTERSTAR|TOWNSTAR|350Z|370Z|GTR)\b/)?.[0];
 const codes=text.match(/\b(?:J1[012]|F1[056]|K1[0-4]|E1[12]|ZE[01]|D2[23]|T3[0-3]|M20|C13|P12)\b/g)||[];
 return {text,family:family?.replace(/\s/g,''),codes};
}
function internalMatch(v){
 const expected=nissanDescription(v.model);if(!expected.family)return {drawing:null,status:'missing'};
 const tools=root.VectaHaynesJobTools,safe=x=>tools?.safeImage(x?.imageUrl),nissan=x=>/^NISSAN$/i.test(String(x?.make||'').trim());
 // A deliberate selection for the same description acts as a reusable template.
 // Conflicting selections remain ambiguous and are never resolved by list order.
 const chosen=(state().vehicles||[]).filter(x=>x.fleetGroup==='Nissan Internal'&&modelKey(x.model)===modelKey(v.model)&&safe(x.artwork)).map(x=>x.artwork);
 const exact=tools?.artworkSnapshot?.(v.registration,'Nissan',v.model);
 const entries=[...storedChoices(),...(safe(exact)?[exact]:[])];
 const candidates=entries.filter(x=>nissan(x)&&nissanDescription(x.model).family===expected.family&&(!expected.codes.length||expected.codes.every(code=>nissanDescription(x.model).codes.includes(code))));
 const distinct=items=>[...new Map(items.map(x=>[x.imageUrl,x])).values()];
 const templates=distinct(chosen.filter(x=>nissan(x)&&nissanDescription(x.model).family===expected.family));
 const matches=templates.length?templates:distinct(candidates);
 return {drawing:matches.length===1?matches[0]:null,status:matches.length>1?'ambiguous':'missing'};
}
function drawingFor(v){if(root.VectaHaynesJobTools?.safeImage(v.artwork?.imageUrl))return {...v.artwork,manual:true};if(v.fleetGroup==='Nissan Internal'){if(root.VectaHaynesJobTools?.safeImage(v.artwork?.imageUrl))return v.artwork;return internalMatch(v).drawing;}const tools=root.VectaHaynesJobTools,hit=tools?.artworkSnapshot?.(v.registration,v.make,v.model)||tools?.snapshot?.(v.registration,v.make,v.model);if(hit?.imageUrl&&(hit.manual||compatible(v,hit))){remember(v,hit);return hit;}const saved=catalog.get(modelKey(v.model));return (saved&&compatible(v,saved)?saved:null)||tools?.genericImage?.({make:v.make,model:v.model})||null;}
function paint(cell,v,drawing){if(cell.matches?.('button[data-fleet-image]')&&v.fleetGroup==='Nissan Internal'){cell.setAttribute('aria-label','Choose image and colour for '+(v.registration||v.model||'internal vehicle'));cell.title=drawing?.imageUrl?'Click to change image or colour':'Choose image once — description needs a saved Nissan image';}const key=[v.model,v.colour,v.color,drawing?.imageUrl].join('|');if(cell.dataset.imageKey===key)return;cell.dataset.imageKey=key;cell.replaceChildren();const fallback=()=>{cell.innerHTML=artwork(v.model,v.colour||v.color||root.VectaHaynesJobTools?.dashboardColour?.({registration:v.registration}));};if(!drawing?.imageUrl){fallback();return;}
 const img=document.createElement('img');img.alt='HaynesPro '+(v.model||'vehicle');img.dataset.vehicleSource=drawing.imageUrl;img.src=root.VectaVehicleImage&&root.VectaHaynesJobTools?.artworkUrl?root.VectaHaynesJobTools.artworkUrl(drawing.imageUrl):drawing.imageUrl;img.loading='lazy';img.dataset.vehicleImage='';img.dataset.vehicleCrop='tight';img.dataset.vehicleLogo='separate';img.dataset.registration=v.registration||'';img.dataset.colour=v.colour||v.color||root.VectaHaynesJobTools?.dashboardColour?.({registration:v.registration})||'';img.dataset.vehicleName=[drawing.make||v.make,drawing.model||v.model].filter(Boolean).join(' ');let retries=0;img.onerror=()=>{if(retries>=2){img.title='Saved vehicle image is temporarily unavailable; its stored choice has been retained.';return;}setTimeout(()=>{if(!img.isConnected||img.dataset.personalised)return;if(!root.VectaVehicleImage)img.src=drawing.imageUrl;delete img.dataset.personalising;root.VectaVehicleImage?.mount(cell);},++retries===1?1500:5000);};cell.appendChild(img);root.VectaVehicleImage?.mount(cell);
}
function state(){return root.__vectaFleetState?.()||{vehicles:root.fleetVehicles||[],save:root.saveFleet,render:root.render};}
const contexts=new Map(),normalReg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function vehicle(id){return (state().vehicles||[]).find(v=>String(v.id)===String(id))||contexts.get(String(id));}
function imageVehicle(node){
 const fleetId=node.closest?.('[data-fleet-image]')?.dataset.fleetImage||node.closest?.('[data-fleet-artwork-id]')?.dataset.fleetArtworkId;
 if(fleetId&&vehicle(fleetId))return vehicle(fleetId);
 const registration=normalReg(node.dataset.registration);if(!registration)return null;
 const matches=(state().vehicles||[]).filter(v=>normalReg(v.registration)===registration);
 if(matches.length===1)return matches[0];if(matches.length>1)return null;
 const drawing=root.VectaHaynesJobTools?.artworkSnapshot?.(registration)||root.VectaHaynesJobTools?.snapshot?.(registration);
 const id='registration:'+registration,v={id,registration,make:drawing?.make||node.dataset.vehicleMake||'',model:drawing?.model||node.dataset.vehicleName||'Vehicle',colour:root.VectaHaynesJobTools?.dashboardColour?.({registration})||node.dataset.colour||'',transient:true};contexts.set(id,v);return v;
}
async function persistChoice(v){
 if(!v.transient){if(v.fleetGroup!=='Nissan Internal'&&normalReg(v.registration)&&v.artwork?.imageUrl)await root.VectaHaynesJobTools?.saveManualArtwork?.({registration:v.registration,make:v.make||v.artwork.make,model:v.model||v.artwork.model,imageUrl:v.artwork.imageUrl,colour:v.colour});if(await state().save()===false)throw Error('The image and colour are saved on this device, but have not synced yet. Please retry.');return;}
 const drawing=v.artwork||drawingFor(v);if(!drawing?.imageUrl)throw Error('Select a stored image before saving.');
 await root.VectaHaynesJobTools.saveManualArtwork({registration:v.registration,make:v.make||drawing.make,model:v.model||drawing.model,imageUrl:drawing.imageUrl,colour:v.colour});
}
function refreshImages(v){
 const drawing=drawingFor(v);if(!drawing?.imageUrl)return;
 for(const wrapper of document.querySelectorAll('[data-vehicle-picker]')){if(wrapper.querySelector('img')||wrapper.closest('.fleetColourPicker'))continue;const target=imageVehicle(wrapper);if(target?.id!==v.id)continue;const img=document.createElement('img');img.dataset.registration=v.registration||'';if(!v.transient)img.dataset.fleetArtworkId=v.id;img.alt='Saved vehicle image';wrapper.replaceChildren(img);}
 for(const previous of document.querySelectorAll('img[data-registration],img[data-fleet-artwork-id]')){
  let img=previous;
  if(img.closest('.fleetColourPicker'))continue;
  const match=img.dataset.fleetArtworkId?String(img.dataset.fleetArtworkId)===String(v.id):normalReg(v.registration)&&normalReg(img.dataset.registration)===normalReg(v.registration);
  if(!match)continue;
  // Detach pending old renders so a late supplier response cannot undo this choice.
  img=previous.cloneNode(false);previous.replaceWith(img);
  img.dataset.vehicleSource=drawing.imageUrl;img.dataset.haynesSource=drawing.imageUrl;img.dataset.colour=v.colour;img.setAttribute('data-vehicle-image','');delete img.dataset.personalised;delete img.dataset.personalising;img.src=root.VectaHaynesJobTools?.artworkUrl?.(drawing.imageUrl)||drawing.imageUrl;root.VectaVehicleImage?.mount(img.parentElement);
 }
}

function visible(cell){if(!cell.isConnected||document.hidden)return false;if(!cell.getBoundingClientRect)return true;const box=cell.getBoundingClientRect();return box.width>0&&box.height>0&&box.bottom>=0&&box.top<root.innerHeight;}
let mountGeneration=0;
function mount(){
 accessibleImages();
 const loading=root.VectaHaynesJobTools?.hydrateSharedArtwork?.();if(loading)loading.then(ok=>{if(ok)mount();});
 const generation=++mountGeneration,vehicles=new Map((state().vehicles||[]).map(v=>[String(v.id),v]));
 // Read geometry before painting: alternating reads and writes forces layout
 // once per vehicle. Yield between small batches so controls stay responsive.
 const cells=Array.from(document.querySelectorAll('[data-fleet-image]')).filter(visible);
 let offset=0;
 function batch(){if(generation!==mountGeneration)return;const end=Math.min(offset+3,cells.length);
  for(;offset<end;offset++){const cell=cells[offset];if(!cell.isConnected)continue;const v=vehicles.get(cell.dataset.fleetImage);if(!v)continue;const drawing=drawingFor(v);paint(cell,v,drawing);}
  if(offset<cells.length)setTimeout(batch,16);
 }
 batch();
}
async function saveColour(id,colour){const v=vehicle(id);if(!v||!palette[colour])throw Error('Choose a valid vehicle colour.');v.colour=colour;v.updated_at=new Date().toISOString();await persistChoice(v);refreshImages(v);return v;}
function forJob(job){const all=(state().vehicles||[]).filter(v=>v.fleetGroup==='Nissan Internal'||v.artwork),id=job.fleet_vehicle_id||job.vehicle_id,registration=String(job.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'');const ids=id?all.filter(v=>String(v.id)===String(id)):[],matches=ids.length?ids:all.filter(v=>registration&&String(v.registration||'').toUpperCase().replace(/[^A-Z0-9]/g,'')===registration);if(matches.length!==1)return null;const v=matches[0];return {vehicle:v,drawing:v.artwork?{...v.artwork,manual:true}:drawingFor(v)};}
function storedChoices(){const entries=[...(root.VectaHaynesJobTools?.storedArtwork?.()||[]),...catalog.values(),...nissanCatalogue];const unique=new Map();for(const entry of entries)if(root.VectaHaynesJobTools?.safeImage(entry.imageUrl))unique.set(entry.imageUrl,entry);return [...unique.values()];}
async function saveArtwork(id,drawing,colour){
 const v=vehicle(id);if(!v||!palette[colour]||!root.VectaHaynesJobTools?.safeImage(drawing?.imageUrl))throw Error('Choose a stored vehicle image and colour.');
 if(!storedChoices().some(x=>x.imageUrl===drawing.imageUrl)&&v.artwork?.imageUrl!==drawing.imageUrl)throw Error('This image is no longer in the stored catalogue.');
 v.artwork={make:String(drawing.make||''),model:String(drawing.model||''),imageUrl:drawing.imageUrl};v.colour=colour;v.updated_at=new Date().toISOString();
 await persistChoice(v);refreshImages(v);
 // Internal IDs can be blank/shared. Keep the choice on this fleet record only.
 return v;
}
async function openArtwork(id){
 const v=vehicle(id);if(!v)return;
 document.getElementById('fleetColourPicker')?.remove();const dialog=document.createElement('dialog');dialog.id='fleetColourPicker';dialog.className='fleetColourPicker';
 dialog.innerHTML='<header><div><small>VEHICLE IMAGE & COLOUR</small><h2>'+esc(v.registration||v.model||'Internal vehicle')+'</h2></div><button type="button" data-close aria-label="Close image picker">×</button></header><div class="fleetColourPreview"></div><label>Find a stored vehicle<input type="search" data-image-search placeholder="Search make or model"></label><div class="fleetStoredImages" role="group" aria-label="Stored vehicle images"></div><div class="fleetColourChoices">'+Object.entries(palette).map(([name,hex])=>'<button type="button" data-colour="'+name+'"><i style="background:'+hex+'"></i>'+name+'</button>').join('')+'</div><p role="status">Loading stored images…</p><button class="primary" type="button" data-save-image>Save image & colour</button>';
 document.body.appendChild(dialog);dialog.showModal();let selected=drawingFor(v),colour=Object.keys(palette).find(c=>c.toLowerCase()===String(v.colour||v.color||'').toLowerCase())||'Silver',choices=[];
 const preview=()=>{const cell=dialog.querySelector('.fleetColourPreview');delete cell.dataset.imageKey;paint(cell,{...v,colour,color:colour},selected);dialog.querySelectorAll('[data-colour]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.colour===colour)));dialog.querySelector('[data-save-image]').textContent=selected?.imageUrl?'Save image & colour':'Save colour';};
 const paintChoices=()=>{const text=dialog.querySelector('[data-image-search]').value.toLowerCase();const list=dialog.querySelector('.fleetStoredImages');list.innerHTML='';for(const drawing of choices.filter(x=>[x.make,x.model].join(' ').toLowerCase().includes(text)).slice(0,24)){const button=document.createElement('button');button.type='button';button.className='fleetStoredImageChoice';button.setAttribute('aria-label',[drawing.make,drawing.model].join(' '));button.setAttribute('aria-pressed',String(selected?.imageUrl===drawing.imageUrl));const picture=document.createElement('span');button.appendChild(picture);paint(picture,{...v,colour},drawing);const label=document.createElement('span');label.textContent=[drawing.make,drawing.model].join(' ');button.appendChild(label);button.onclick=()=>{selected=drawing;preview();paintChoices();};list.appendChild(button);} };
 const close=()=>{dialog.remove();document.querySelector('[data-fleet-image="'+CSS.escape(String(id))+'"]')?.focus();};dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.querySelector('[data-image-search]').oninput=paintChoices;dialog.querySelectorAll('[data-colour]').forEach(b=>b.onclick=()=>{colour=b.dataset.colour;preview();});
 dialog.querySelector('[data-save-image]').onclick=async()=>{const save=dialog.querySelector('[data-save-image]');save.disabled=true;try{if(selected?.imageUrl)await saveArtwork(id,selected,colour);else await saveColour(id,colour);state().render?.();close();}catch(error){dialog.querySelector('[role="status"]').textContent=error.message;save.disabled=false;}};
 preview();try{await root.VectaHaynesJobTools?.hydrateSharedArtwork?.({refresh:true});if(!dialog.isConnected)return;choices=storedChoices();if(v.fleetGroup==='Nissan Internal')choices=choices.filter(x=>/^NISSAN$/i.test(String(x.make||'').trim()));const family=nissanDescription(v.model).family;choices.sort((a,b)=>Number(nissanDescription(b.model).family===family)-Number(nissanDescription(a.model).family===family));selected=selected||drawingFor(v);preview();paintChoices();dialog.querySelector('[role="status"]').textContent=selected?.imageUrl?'Image matched. Choose a colour or select a different image.':internalMatch(v).status==='ambiguous'?'Several images match. Choose the correct model once; matching descriptions will reuse it.':choices.length?'Choose a stored vehicle image and colour.':'No stored image matches yet. Search for another model.';}catch{dialog.querySelector('[role="status"]').textContent='Stored images could not be loaded. Please retry.';}
}
function open(id){return openArtwork(id);}
function activateImage(e){
 if(e.target.closest?.('.fleetColourPicker'))return;
 const node=e.target.closest?.('[data-fleet-image],[data-vehicle-picker],img[data-registration],img[data-fleet-artwork-id]');if(!node)return;
 const v=imageVehicle(node);if(!v)return;e.preventDefault();e.stopImmediatePropagation();openArtwork(v.id);
}
document.addEventListener('click',activateImage,true);
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('[data-vehicle-picker],img[data-registration],img[data-fleet-artwork-id]'))activateImage(e);},true);
function accessibleImages(){for(const img of document.querySelectorAll('[data-vehicle-picker],img[data-registration],img[data-fleet-artwork-id]')){if(img.closest('.fleetColourPicker')||img.matches('[data-vehicle-picker]')&&img.querySelector('img')||(!img.dataset.registration&&!img.dataset.fleetArtworkId))continue;img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Change vehicle image and colour '+(img.dataset.registration||''));img.title='Click to change vehicle image and colour';}}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;mount();},100);}
new MutationObserver(records=>{if(records.some(record=>!record.target.closest?.('[data-fleet-image],.fleetColourPreview')&&Array.from(record.addedNodes||[]).some(node=>node.nodeType===1&&(node.matches?.('[data-fleet-image],[data-vehicle-picker],img[data-registration],img[data-fleet-artwork-id]')||node.querySelector?.('[data-fleet-image],[data-vehicle-picker],img[data-registration],img[data-fleet-artwork-id]')))))schedule();}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('scroll',schedule,{capture:true,passive:true});root.addEventListener?.('resize',schedule,{passive:true});document.addEventListener('visibilitychange',schedule);mount();
root.VectaFleetImages={imageVehicle,refreshImages,forJob,storedChoices,saveArtwork,openArtwork,kind,artwork,modelKey,modelArtwork,drawingFor,saveColour,mount};
})(window);
