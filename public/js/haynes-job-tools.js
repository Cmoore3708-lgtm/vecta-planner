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
 if(!/^[A-Z0-9]{2,8}$/.test(requested)||root.navigator?.onLine===false||Date.now()-(failed.get(requested)||0)<300000)return null;
 if(!pending.has(requested)){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  pending.set(requested,(async()=>{try{const r=await root.fetch('/api/haynes-vehicle?reg='+encodeURIComponent(requested),{signal:controller.signal,cache:'no-store'}),d=await r.json();if(!r.ok||d.status!=='MATCHED'||!valid(d.vehicle,requested))throw Error(['NOT_CONFIGURED','OFFLINE','LOGIN_REQUIRED','VERIFICATION_REQUIRED','BUSY','DAILY_LIMIT'].includes(d.status)?d.status:'UNAVAILABLE');failStatus.delete(requested);return remember(d.vehicle);}catch(e){failed.set(requested,Date.now());failStatus.set(requested,e.message);while(failed.size>300){const oldest=failed.keys().next().value;failed.delete(oldest);failStatus.delete(oldest);}return null;}finally{clearTimeout(timer);pending.delete(requested);}})());
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
root.enrichHaynesDashboard=function(container,jobs){
 if(!container)return;const byId=new Map((jobs||[]).filter(j=>!j.no_vehicle&&j.card_type!=='mini_task').map(j=>[String(j.id),j]));
 const groups=new Map();
 for(const card of container.querySelectorAll('.job.plannerJobFull[data-job-id],.mobileJob[data-open-job],.unallocatedSideJob[data-open-unallocated]')){
  const j=byId.get(card.dataset.jobId||card.dataset.openJob),target=card.matches('.mobileJob,.unallocatedSideJob')?card:card.querySelector('.plannerJobHeader');if(!j||!target)continue;
  const key=reg(j.registration)+'|'+make(j.make)+'|'+words(j.model||j.vehicle)+'|'+words(dashboardColour(j));if(!groups.has(key))groups.set(key,{job:j,targets:[]});groups.get(key).targets.push({card,target});
 }
 const attach=(v,targets,j)=>{for(const {card,target} of targets){if(!card.isConnected||!v)continue;const colour=dashboardColour(j);let img=card.querySelector('.haynesDashboardImage');if(img&&(img.dataset.haynesSource!==v.imageUrl||img.dataset.colour!==colour)){img.remove();img=null;}img=img||thumbnail(v,'haynesDashboardImage');if(img){img.dataset.haynesSource=v.imageUrl;img.dataset.colour=colour;img.dataset.vehicleName=[v.make,v.model].join(' ');img.setAttribute('data-vehicle-image','');target.appendChild(img);target.classList.add('hasHaynesDashboardImage');root.VectaVehicleImage?.mount(target);}}};
 for(const [key,group] of groups){
  const j=group.job,hit=snapshot(j.registration,j.make),fallback=genericImage(j);attach(hit?.imageUrl?hit:fallback,group.targets,j);if((hit&&(!root.VectaVehicleImage||root.VectaVehicleImage.colourHex(dashboardColour(j))))||! /^[A-Z0-9]{2,8}$/.test(reg(j.registration)))continue;
  const existing=dashboardRequests.get(key);if(existing){existing.targets=group.targets;continue;}
  dashboardRequests.set(key,group);
  dashboardTail=dashboardTail.then(async()=>{try{if(!group.targets.some(x=>x.card.isConnected))return;await lookupDashboardColour(j);const v=await lookup(j.registration,j.make);attach(v?.imageUrl?v:genericImage(j),group.targets,j);}finally{dashboardRequests.delete(key);}}).catch(()=>{});
 }
};
root.enrichHaynesInvoice=function(sheet,invoice){
 const strip=sheet?.querySelector('.printInvoiceVehicle');if(!strip||!invoice||sheet.querySelector('.haynesInvoiceImage'))return;
 const matched=snapshot(invoice.registration,invoice.make),v=matched?.imageUrl?matched:genericImage(invoice);if(!v)return;const img=thumbnail(v,'haynesInvoiceImage');if(img){strip.prepend(img);strip.classList.add('hasHaynesImage');}
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
root.VectaHaynesJobTools={vehicleLink,safeImage:image,remember,snapshot,lookup,genericImage};
})(window);
