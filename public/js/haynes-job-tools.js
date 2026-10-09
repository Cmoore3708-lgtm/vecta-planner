(function(root){
'use strict';
const reg=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const make=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const image=v=>/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(v||'')?v:'';
function vehicleLink(v){
 if(!/^t_\d+$/.test(v?.typeId||''))return '';
 return 'https://www.workshopdata.com/touch/site/layout/modelDetail?typeId='+encodeURIComponent(v.typeId);
}
const KEY='vecta_haynes_vehicle_snapshots_v1',TTL=86400000,cache=new Map(),pending=new Map(),failed=new Map(),failStatus=new Map();
let dailyBlockedUntil=0;
try{for(const v of JSON.parse(root.localStorage?.getItem(KEY)||'[]'))remember(v,false);}catch{}
function valid(v,registration,expectedMake){return !!(v&&reg(v.registration)===reg(registration)&&vehicleLink(v)&&v.make&&v.model&&v.variant&&(!expectedMake||make(v.make)===make(expectedMake))&&Number.isFinite(Date.parse(v.fetchedAt))&&Date.now()-Date.parse(v.fetchedAt)>=0&&Date.now()-Date.parse(v.fetchedAt)<TTL);}
function remember(v,persist=true){
 if(!valid(v,v?.registration))return;
 const clean={registration:reg(v.registration),make:String(v.make).slice(0,100),model:String(v.model).slice(0,180),variant:String(v.variant).slice(0,180),engineCode:String(v.engineCode||'').slice(0,100),modelYears:String(v.modelYears||'').slice(0,100),typeId:v.typeId,imageUrl:image(v.imageUrl),fetchedAt:v.fetchedAt};
 cache.set(clean.registration,clean);while(cache.size>300)cache.delete(cache.keys().next().value);
 if(persist)try{root.localStorage?.setItem(KEY,JSON.stringify([...cache.values()].filter(x=>valid(x,x.registration))));}catch{}
 return clean;
}
function snapshot(registration,expectedMake){const v=cache.get(reg(registration));return valid(v,registration,expectedMake)?v:null;}
// Generic artwork is a visual hint only; it has no registration or technical ID.
const modelImages=[
 {make:'Nissan',model:'Qashqai',imageUrl:'https://www.haynespro-assets.com/workshop/images/319004648.svgz'},
 {make:'Ford',model:'Transit',imageUrl:'https://www.haynespro-assets.com/workshop/images/319118141.svgz'}
];
const words=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function genericImage(description){
 if(!description||description.no_vehicle)return null;
 const text=' '+words(description.model||description.vehicle)+' ',expectedMake=make(description.make);
 const candidates=[...modelImages,...cache.values()].filter(v=>image(v.imageUrl)).map(v=>({make:v.make,model:String(v.model).split(/[(/]/)[0].trim(),imageUrl:v.imageUrl})).sort((a,b)=>b.model.length-a.model.length);
 for(const v of candidates){const model=words(v.model);if(model&&text.includes(' '+model+' ')&&(!expectedMake||make(v.make)===expectedMake))return {make:v.make,model:v.model,imageUrl:v.imageUrl,generic:true};}
 return null;
}
async function lookup(registration,expectedMake){
 const requested=reg(registration),hit=snapshot(requested,expectedMake);if(hit)return hit;
 if(Date.now()<dailyBlockedUntil){failStatus.set(requested,'DAILY_LIMIT');return null;}
 if(!/^[A-Z0-9]{2,8}$/.test(requested)||root.navigator?.onLine===false||Date.now()-(failed.get(requested)||0)<300000)return null;
 if(!pending.has(requested)){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  pending.set(requested,(async()=>{try{const r=await root.fetch('/api/haynes-vehicle?reg='+encodeURIComponent(requested),{signal:controller.signal,cache:'no-store'}),d=await r.json();if(!r.ok||d.status!=='MATCHED'||!valid(d.vehicle,requested))throw Error(['NOT_CONFIGURED','OFFLINE','LOGIN_REQUIRED','VERIFICATION_REQUIRED','BUSY','DAILY_LIMIT'].includes(d.status)?d.status:'UNAVAILABLE');failStatus.delete(requested);return remember(d.vehicle);}catch(e){if(e.message==='DAILY_LIMIT')dailyBlockedUntil=(Math.floor(Date.now()/TTL)+1)*TTL;failed.set(requested,Date.now());failStatus.set(requested,e.message);while(failed.size>300){const oldest=failed.keys().next().value;failed.delete(oldest);failStatus.delete(oldest);}return null;}finally{clearTimeout(timer);pending.delete(requested);}})());
 }
 const v=await pending.get(requested);return valid(v,requested,expectedMake)?v:null;
}
function thumbnail(v,className){const src=image(v?.imageUrl);if(!src)return null;const img=document.createElement('img');img.src=src;img.className=className;img.alt=(v.generic?'Generic model image: ':'Representative ')+v.make+' '+v.model;img.title=v.generic?'Generic model image — appearance may differ':img.alt;img.dataset.generic=String(!!v.generic);img.onerror=()=>img.remove();img.draggable=false;return img;}
let dashboardTail=Promise.resolve();
const dashboardRequests=new Map();
const colourKey='vecta_dashboard_vehicle_colours_v1',colourCache=new Map(),colourFailures=new Map();
try{for(const entry of JSON.parse(root.localStorage?.getItem(colourKey)||'[]'))if(/^[A-Z0-9]{2,8}$/.test(entry.registration)&&Date.now()-entry.at<TTL)colourCache.set(entry.registration,entry);}catch{}
function dashboardColour(job){
 const registration=reg(job.registration),vehicle=registration?(root.app?.vehicles||[]).find(v=>reg(v.registration)===registration):null;
 const fleet=registration?(root.fleetVehicles||[]).find(v=>reg(v.registration)===registration):null;
 const saved=colourCache.get(registration),cached=saved&&Date.now()-saved.at<TTL&&(!job.make||make(saved.make)===make(job.make))?saved.colour:'';
 const supplied=job.vehicle_colour||job.colour||vehicle?.colour||fleet?.colour||cached||'';
 return root.VectaVehicleImage?.resolveColour(registration,supplied)||supplied;
}
async function lookupDashboardColour(job){
 const registration=reg(job.registration);
 if(!root.VectaVehicleImage||root.VectaVehicleImage.colourHex(dashboardColour(job))||! /^[A-Z0-9]{5,8}$/.test(registration)||root.navigator?.onLine===false||Date.now()-(colourFailures.get(registration)||0)<300000)return;
 try{
  const response=await root.fetch('/api/vehicle-lookup?reg='+encodeURIComponent(registration),{cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();
  if(!response.ok||reg(data.registration)!==registration||(job.make&&make(data.make)!==make(job.make))||!root.VectaVehicleImage.colourHex(data.primaryColour))throw Error('Colour unavailable');
  colourCache.set(registration,{registration,make:data.make,colour:data.primaryColour,at:Date.now()});while(colourCache.size>300)colourCache.delete(colourCache.keys().next().value);
  try{root.localStorage?.setItem(colourKey,JSON.stringify([...colourCache.values()]));}catch{}
 }catch{colourFailures.set(registration,Date.now());while(colourFailures.size>300)colourFailures.delete(colourFailures.keys().next().value);}
}
// Object-fit can leave unused space to the left of right-aligned artwork.
// Reserve its rendered width, not the full 162px image element.
const timedArtwork=new WeakSet();
function trackTimedArtwork(card,img){
 if(!card.matches('.job')||timedArtwork.has(img))return;
 timedArtwork.add(img);
 let observer;
 const update=()=>{
  if(!img.isConnected){observer?.disconnect();return;}
  const box=img.getBoundingClientRect();
  if(!img.naturalWidth||!img.naturalHeight||!box.width||!box.height)return;
  const drawnWidth=Math.min(box.width,box.height*img.naturalWidth/img.naturalHeight);
  card.style.setProperty('--planner-vehicle-text-inset',Math.ceil(drawnWidth+12)+'px');
 };
 img.addEventListener('load',update);
 if(root.ResizeObserver){observer=new root.ResizeObserver(update);observer.observe(img);}
 update();
}
root.enrichHaynesDashboard=function(container,jobs){
 if(!container)return;const byId=new Map((jobs||[]).filter(j=>!j.no_vehicle&&j.card_type!=='mini_task').map(j=>[String(j.id),j]));
 const groups=new Map();
 for(const card of container.querySelectorAll('.job:not(.miniPlannerTask)[data-job-id],.mobileJob[data-open-job],.unallocatedSideJob[data-open-unallocated]')){
  const j=byId.get(card.dataset.jobId||card.dataset.openJob),target=card.matches('.mobileJob,.unallocatedSideJob')?card:card.querySelector('.plannerJobHeader');if(!j||!target)continue;
  const key=reg(j.registration)+'|'+make(j.make)+'|'+words(j.model||j.vehicle)+'|'+words(dashboardColour(j));if(!groups.has(key))groups.set(key,{job:j,targets:[]});groups.get(key).targets.push({card,target});
 }
 const attach=(v,targets,j)=>{for(const {card,target} of targets){if(!card.isConnected||!v)continue;const colour=dashboardColour(j);let img=card.querySelector('.haynesDashboardImage');if(img&&(img.dataset.haynesSource!==v.imageUrl||img.dataset.colour!==colour)){img.remove();img=null;}img=img||thumbnail(v,'haynesDashboardImage');if(img){img.dataset.haynesSource=v.imageUrl;img.dataset.colour=colour;img.dataset.vehicleName=[v.make,v.model].join(' ');img.setAttribute('data-vehicle-image','');target.appendChild(img);target.classList.add('hasHaynesDashboardImage');trackTimedArtwork(card,img);root.VectaVehicleImage?.mount(target);}}};
 for(const [key,group] of groups){
  const j=group.job,hit=snapshot(j.registration,j.make),fallback=genericImage(j);attach(hit?.imageUrl?hit:fallback,group.targets,j);if((hit&&(!root.VectaVehicleImage||root.VectaVehicleImage.colourHex(dashboardColour(j))))||! /^[A-Z0-9]{2,8}$/.test(reg(j.registration)))continue;
  const existing=dashboardRequests.get(key);if(existing){existing.targets=group.targets;continue;}
  dashboardRequests.set(key,group);
  dashboardTail=dashboardTail.then(async()=>{try{if(!group.targets.some(x=>x.card.isConnected))return;await lookupDashboardColour(j);const v=hit?.imageUrl?hit:fallback?.imageUrl?fallback:await lookup(j.registration,j.make);attach(v?.imageUrl?v:genericImage(j),group.targets,j);}finally{dashboardRequests.delete(key);}}).catch(()=>{});
 }
};
root.enrichHaynesInvoice=function(sheet,invoice){
 const strip=sheet?.querySelector('.printInvoiceVehicle');if(!strip||!invoice||sheet.querySelector('.haynesInvoiceImage'))return;
 const matched=snapshot(invoice.registration,invoice.make),v=matched?.imageUrl?matched:genericImage(invoice);if(!v)return;const img=thumbnail(v,'haynesInvoiceImage');if(img){
  const header=sheet.querySelector('.invoicePrintHeader');
  if(header){
   const picture=document.createElement('div');picture.className='haynesInvoiceHeaderVehicle';
   const linked=(root.app?.jobs||[]).find(j=>String(j.id)===String(invoice.job_id));
   const vehicle=Object.assign({},linked||{},invoice,{registration:invoice.registration||linked?.registration});
   img.setAttribute('data-vehicle-image','');img.dataset.registration=reg(vehicle.registration);
   img.dataset.colour=dashboardColour(vehicle);img.dataset.vehicleName=[v.make,v.model].join(' ');
   picture.appendChild(img);header.insertBefore(picture,header.querySelector('.printTitle'));
   sheet.invoiceVehicleReady=root.VectaVehicleImage?.mount(picture);
  }
 }
 if(!matched)return;const cells=strip.querySelectorAll('.printVehicleCell'),vehicleCell=cells[1];if(vehicleCell){const old=vehicleCell.querySelector('b');if(old)old.textContent=[matched.make,matched.model,matched.variant].join(' ');const extra=document.createElement('small');extra.className='haynesInvoiceDetails';extra.textContent=[matched.engineCode,matched.modelYears].filter(Boolean).join(' · ');vehicleCell.appendChild(extra);}
};
root.initHaynesJobTools=function(modal){
 const section=modal?.querySelector('.jobVehicleSection'),input=modal?.querySelector('#job_registration');
 if(!section||!input||section.querySelector('.haynesJobTools'))return;
 const panel=document.createElement('div');panel.className='haynesJobTools';
 panel.innerHTML='<button type="button" class="btn">Find vehicle in HaynesPro</button><span role="status" aria-live="polite"></span><div class="haynesJobVehicle"></div>';
 section.appendChild(panel);
 const button=panel.querySelector('button'),status=panel.querySelector('[role="status"]'),body=panel.querySelector('.haynesJobVehicle'),noVehicle=modal.querySelector('#job_no_vehicle');
 let sequence=0,refreshTimer;
 function showGeneric(){if(noVehicle?.checked)return;const v=genericImage({make:modal.querySelector('#job_make')?.value,model:modal.querySelector('#job_model')?.value,vehicle:modal.querySelector('#job_vehicle')?.value}),img=thumbnail(v,'haynesJobGenericImage');if(img){body.replaceChildren(img);return true;}return false;}
 const current=()=>reg(input.value);
 function clear(){sequence++;clearTimeout(refreshTimer);body.replaceChildren();status.textContent='';button.disabled=!!noVehicle?.checked;button.textContent='Find vehicle in HaynesPro';if(showGeneric())status.textContent='Generic model image — appearance may differ.';}
 function changed(){clear();if(!noVehicle?.checked&&/^[A-Z0-9]{2,8}$/.test(current()))refreshTimer=setTimeout(()=>button.onclick(),750);}
 input.addEventListener('input',changed);input.addEventListener('change',changed);for(const selector of ['#job_vehicle','#job_model','#job_make']){const field=modal.querySelector(selector);field?.addEventListener('change',changed);}noVehicle?.addEventListener('change',changed);clear();
 button.onclick=async(event)=>{
  if(!panel.isConnected)return;clear();if(event){failed.delete(current());}
const requested=current(),expectedMake=make(modal.querySelector('#job_make')?.value);
  if(noVehicle?.checked||! /^[A-Z0-9]{2,8}$/.test(requested)){status.textContent='Enter a vehicle registration first.';return;}
  const run=sequence;
  button.disabled=true;status.textContent='Looking up vehicle…';
  try{
   const v=await lookup(requested,expectedMake);
   if(run!==sequence||!panel.isConnected||current()!==requested||noVehicle?.checked)return;
   if(!v||reg(v?.registration)!==requested||!v?.model||!v?.variant||!v?.make||!vehicleLink(v)||(expectedMake&&make(v.make)!==expectedMake))throw Error('UNAVAILABLE');
   remember(v);const link=document.createElement('a');link.className='btn dark';link.href=vehicleLink(v);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open this vehicle in HaynesPro';
   const details=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');
   title.textContent=[v.make,v.model,v.variant].join(' ');note.textContent=[v.engineCode,v.modelYears].filter(Boolean).join(' · ');details.append(title,note);
   body.replaceChildren();const src=image(v.imageUrl);if(src){const img=document.createElement('img');img.src=src;img.alt=(v.generic?'Generic model image: ':'Representative ')+v.make+' '+v.model;img.title=v.generic?'Generic model image — appearance may differ':img.alt;img.dataset.generic=String(!!v.generic);img.onerror=()=>img.remove();body.appendChild(img);}
   const times=document.createElement('a');times.className='btn';times.href='https://www.workshopdata.com/touch/site/layout/repairTimes?typeId='+encodeURIComponent(v.typeId)+'&groupId=QUICKGUIDES';times.target='_blank';times.rel='noopener noreferrer';times.textContent='Repair times';
   if(!src)showGeneric();body.append(details,link,times);status.textContent='Matched vehicle — check the variant before using technical data.';button.textContent='Refresh HaynesPro vehicle';
  }catch{if(run===sequence&&panel.isConnected&&current()===requested)status.textContent=({NOT_CONFIGURED:'HaynesPro lookup is not configured for this preview.',OFFLINE:'The workshop HaynesPro worker is offline.',LOGIN_REQUIRED:'The workshop HaynesPro login needs renewing.',VERIFICATION_REQUIRED:'HaynesPro needs verification on the workshop PC.',BUSY:'HaynesPro is busy. Try again shortly.',DAILY_LIMIT:'The daily HaynesPro lookup limit has been reached.'}[failStatus.get(requested)]||'HaynesPro unavailable or vehicle match uncertain.')+' You can still save this job.';}
  finally{if(run===sequence)button.disabled=!!noVehicle?.checked;}
 };
 if(!noVehicle?.checked&&/^[A-Z0-9]{2,8}$/.test(current()))button.onclick();
};
document.addEventListener('DOMContentLoaded',()=>{if(root.view==='planner')root.enrichHaynesDashboard(document.getElementById('content'),root.app?.jobs);});
root.VectaHaynesJobTools={vehicleLink,safeImage:image,remember,snapshot,lookup,genericImage,dashboardColour,lookupDashboardColour};
})(window);

/* Dashboard registration lookup: read-only until a job/quote form is saved. */
(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalise=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const messages={SERVICE_TIMEOUT:'The service request timed out. Check the workshop worker and retry.',TimeoutError:'The connection timed out. Please retry.',OFFLINE:'The workshop HaynesPro worker is offline.',LOGIN_REQUIRED:'Renew the HaynesPro login on the workshop PC.',VERIFICATION_REQUIRED:'HaynesPro needs verification on the workshop PC.',NOT_CONFIGURED:'HaynesPro is not configured.',BUSY:'HaynesPro is busy. Please retry.',DAILY_LIMIT:'The workshop’s internal daily lookup allowance has been reached. Cached vehicles may still be available.',AMBIGUOUS:'HaynesPro could not identify a unique vehicle.',SCHEDULE_REQUIRED:'Select a service schedule in HaynesPro.',WORKER_UPDATE_REQUIRED:'The workshop HaynesPro worker needs updating.'};
let active=null;
async function open(registration){
 const reg=normalise(registration);if(!/^[A-Z0-9]{2,8}$/.test(reg))return;
 active?.abort();const controller=new AbortController();active=controller;
 document.getElementById('haynesLookupPage')?.remove();
 const page=document.createElement('dialog');page.id='haynesLookupPage';page.className='haynesLookupPage';
 page.innerHTML='<header><div><small>VEHICLE LOOKUP</small><h2>'+esc(reg)+'</h2></div><button type="button" data-close aria-label="Close vehicle lookup">Close</button></header><p role="status" data-status>Looking up vehicle in HaynesPro…</p><section data-identity></section><div class="haynesLookupMot"><b>Mileage at last MOT</b><strong data-mot-mileage>Loading…</strong><small data-mot-date></small></div><form data-schedule-form><label>Current mileage <input name="mileage" type="number" min="1" max="2000000" step="1" required></label><label>Service interval <select name="period"><option value="">Automatic from mileage</option></select></label><button type="submit">Load service data</button></form><section data-service></section><footer><button type="button" data-create="quote" disabled>Create Quote</button><button type="button" data-create="job" disabled>Create Job</button></footer>';
 document.body.appendChild(page);page.showModal();
 const status=page.querySelector('[data-status]'),identity=page.querySelector('[data-identity]'),service=page.querySelector('[data-service]'),form=page.querySelector('form');let vehicle=null,government=null,serviceRun=0;
 const close=()=>{controller.abort();page.remove();document.getElementById('haynesDashboardRegistration')?.focus();};page.querySelector('[data-close]').onclick=close;page.addEventListener('cancel',e=>{e.preventDefault();close();});
 const isCurrent=()=>!controller.signal.aborted&&page.isConnected;
 async function json(url){const requestController=new AbortController(),abort=()=>requestController.abort();controller.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,15000);try{const r=await root.fetch(url,{cache:'no-store',signal:requestController.signal});const d=await r.json();if(!r.ok)throw Error(d.status||d.error||'UNAVAILABLE');return d;}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort);}}
 form.onsubmit=async e=>{e.preventDefault();const mileage=Number(form.elements.mileage.value);if(!Number.isSafeInteger(mileage)||mileage<=0||mileage>2000000)return;const run=++serviceRun;service.textContent='Loading service schedule…';const selected=form.elements.period.value,query=new URLSearchParams({haynes:'service',reg,mileage:String(mileage),period:selected});let id='';try{const until=Date.now()+95000;let d;do{if(id)query.set('id',id);d=await json('/api/availability?'+query);if(!isCurrent()||run!==serviceRun)return;if(d.status!=='PENDING')break;id=d.id||id;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<until);if(d.status==='PENDING')throw Error('SERVICE_TIMEOUT');if(d.status!=='MATCHED')throw Error(d.status);const result=d.result;if(normalise(result?.vehicle?.registration)!==reg||result.mileage!==mileage)throw Error('MISMATCH');form.elements.period.innerHTML='<option value="">Automatic from mileage</option>'+(result.periods||[]).map(p=>'<option value="'+esc(p.id)+'"'+(p.id===selected?' selected':'')+'>'+esc(p.label)+'</option>').join('');const list=(title,items)=>'<article><h3>'+title+'</h3>'+(items?.length?'<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<p>No items returned.</p>')+'</article>';service.innerHTML='<h3>'+esc(result.schedule)+'</h3><p>'+esc(result.conditions)+'</p><div class="haynesLookupSections"><article><h3>Engine oil</h3>'+(result.oil||[]).map(x=>'<p><b>'+esc(x.applicability)+'</b><br>'+esc(x.specification)+'<br>'+esc(x.capacity)+'</p>').join('')+'</article>'+list('Scheduled parts and filters',result.parts)+list('Additional work',result.additional)+'</div><small>HaynesPro · '+esc(result.fetchedAt)+' · Check replacement history before authorising work.</small>';}catch(err){if(isCurrent()&&run===serviceRun)service.textContent=messages[err.message]||'Service data unavailable. Retry with the correct mileage.';}};
 page.querySelectorAll('[data-create]').forEach(button=>button.onclick=()=>{if(!vehicle)return;const preset={registration:reg,make:vehicle.make,model:vehicle.model,vehicle:[vehicle.make,vehicle.model].join(' '),mileage:Number(form.elements.mileage.value)||null,engine_code:vehicle.engineCode||'',technician:'Unallocated',status:button.dataset.create==='quote'?'quote':'booked',mot_due:government?.motDueDate||null,tax_due:government?.taxDueDate||null,vehicle_colour:government?.primaryColour||''};close();root.openJobModal(null,preset);});
 function paintLookupVehicle(){const img=identity.querySelector('img');if(!isCurrent()||!vehicle||!img||!root.VectaVehicleImage)return;img.dataset.registration=reg;img.dataset.colour=root.VectaVehicleImage.resolveColour(reg,government?.primaryColour||'');img.dataset.vehicleName=vehicle.make+' '+vehicle.model;img.setAttribute('data-vehicle-image','');root.VectaVehicleImage.mount(identity);}
 const motLookup=(async()=>{
 try{government=await json('/api/vehicle-lookup?reg='+encodeURIComponent(reg));if(normalise(government.registration)!==reg)government=null;const raw=String(government?.latestMileage??'').replace(/[, ]/g,''),available=/^\d+$/.test(raw),unit=String(government?.latestMileageUnit||'').toLowerCase();if(isCurrent()){paintLookupVehicle();page.querySelector('[data-mot-mileage]').textContent=available?Number(raw).toLocaleString('en-GB')+' '+(unit==='mi'?'miles':unit==='km'?'km':unit||'units'):'Not available';page.querySelector('[data-mot-date]').textContent=(government?.lastMotTestDate?'MOT date: '+String(government.lastMotTestDate).slice(0,10)+'. ':'')+'Historical MOT reading; enter current mileage separately.';}}catch{if(isCurrent())page.querySelector('[data-mot-mileage]').textContent='Not available';}
 })();
 try{const cached=root.VectaHaynesJobTools.snapshot?.(reg);const d=cached?{status:'MATCHED',vehicle:cached}:await json('/api/haynes-vehicle?reg='+encodeURIComponent(reg));if(!isCurrent())return;if(d.status!=='MATCHED'||normalise(d.vehicle?.registration)!==reg)throw Error(d.status);vehicle=root.VectaHaynesJobTools.remember(d.vehicle);if(!vehicle)throw Error('MISMATCH');identity.innerHTML='<div><h2>'+esc(vehicle.make+' '+vehicle.model)+'</h2><p>'+esc(vehicle.variant)+'</p><dl>'+[['Engine code',vehicle.engineCode],['Model years',vehicle.modelYears]].map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(v||'Not supplied')+'</dd>').join('')+'</dl><a target="_blank" rel="noopener noreferrer" href="'+esc(root.VectaHaynesJobTools.vehicleLink(vehicle))+'">Open full HaynesPro vehicle data</a></div>';
 const src=root.VectaHaynesJobTools.safeImage(vehicle.imageUrl);if(src){const img=document.createElement('img');img.src=src;img.alt=vehicle.make+' '+vehicle.model;img.onerror=()=>img.remove();identity.prepend(img);}paintLookupVehicle();status.textContent='Vehicle matched. Enter the current mileage to load its service schedule.';page.querySelectorAll('[data-create]').forEach(b=>b.disabled=false);

 }catch(err){if(isCurrent())status.textContent=messages[err.message]||'Vehicle match unavailable. Check the registration and retry.';}
 await motLookup;
}
function install(){const top=document.querySelector('.top'),search=top?.querySelector('.plannerGlobalSearchWrap');if(!search||document.getElementById('haynesDashboardLookup'))return;const form=document.createElement('form');form.id='haynesDashboardLookup';form.className='haynesDashboardLookup';form.setAttribute('aria-label','HaynesPro vehicle lookup');form.innerHTML='<span aria-hidden="true">GB</span><input id="haynesDashboardRegistration" aria-label="Vehicle registration for HaynesPro lookup" autocomplete="off" maxlength="10" required pattern="[A-Za-z0-9 ]{2,10}"><button type="submit" aria-label="Look up vehicle">⌕</button>';search.before(form);form.onsubmit=e=>{e.preventDefault();const value=normalise(form.querySelector('input').value);if(value.length<2||value.length>8){form.querySelector('input').setCustomValidity('Enter a valid vehicle registration.');form.reportValidity();return;}form.querySelector('input').setCustomValidity('');open(value);};form.querySelector('input').oninput=e=>{e.target.value=e.target.value.toUpperCase();e.target.setCustomValidity('');};}
root.VectaHaynesDashboardLookup={open,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
