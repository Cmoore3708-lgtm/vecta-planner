(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mileage=sheet=>{const value=String(sheet.querySelector('.ssMileageEntry')?.textContent||'').replace(/[\s,]/g,'');return /^\d+$/.test(value)&&Number(value)>0&&Number(value)<=2000000?Number(value):0;};
const compactCapacity=value=>{const text=String(value||''),match=text.match(/including filter\s+(\d+(?:[.,]\d+)?)\s*\(l\)/i);return match?match[1]+' L (inc. filter)':text;};
const safeImage=value=>/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(value||'')?value:'';
// Freeze the already personalised screen artwork at print resolution.
root.prepareHaynesServicePrint=async function(scope){
const logo=scope?.querySelector('.ssWebsiteLogo');
 if(logo&&typeof logo.decode==='function')await logo.decode().catch(()=>{});
 const img=scope?.querySelector('.ssHaynesVehicle img, .haynesInvoiceHeaderVehicle img');
 if(!img||!img.src.startsWith('data:image/svg+xml')||img.dataset.printSnapshot)return;
 const original=img.src;if(typeof img.decode==='function')await img.decode();
 const canvas=document.createElement('canvas');canvas.width=Math.max(1200,img.naturalWidth*4);canvas.height=Math.round(canvas.width*img.naturalHeight/img.naturalWidth);
 const context=canvas.getContext('2d');if(!context)return;context.drawImage(img,0,0,canvas.width,canvas.height);
 img.src=canvas.toDataURL('image/png');img.dataset.printSnapshot='1';
 const restore=()=>{if(img.dataset.printSnapshot){img.src=original;delete img.dataset.printSnapshot;}root.removeEventListener('afterprint',restore);};
 root.addEventListener('afterprint',restore,{once:true});
 if(typeof img.decode==='function')await img.decode();
};
root.openServiceResetProcedure=function(){
 const link=document.querySelector('#printSheet .ssHaynesResetLink');
 if(link){link.click();return;}
 root.alert('HaynesPro vehicle details are not loaded yet. Wait for the lookup or retry Haynes, then open the reset instructions.');
};
root.initHaynesServiceSheet=async function(sheet,registration,kind){
 if(!sheet||kind!=='service')return;
 const brand=sheet.querySelector('.ssBrand');
 if(brand&&brand.querySelector('.ssWebsiteLogo')?.getAttribute('src')!=='/assets/vecta-service-logo.webp'){
  const logo=document.createElement('img');logo.className='ssWebsiteLogo';logo.src='/assets/vecta-service-logo.webp';logo.alt='VECTA Vehicle Servicing and repairs';brand.replaceChildren(logo);
 }
 let config;try{config=await fetch('/api/supabase-config',{cache:'no-store'}).then(r=>r.json());}catch{return;}
 if(!sheet.isConnected||!config.haynesServiceTest)return;
 sheet.classList.add('ssHaynesCompact');
 const setResetLink=v=>{
  if(v?.registration!==registration||!/^t_\d+$/.test(v.typeId||''))return;
  let link=sheet.querySelector('.ssHaynesResetLink');
  if(!link){link=document.createElement('a');link.className='ssHaynesResetLink';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Service light reset instructions — HaynesPro';link.title='Open this vehicle in HaynesPro, then select Service indicator reset';sheet.querySelector('.ssDocumentTitle')?.insertAdjacentElement('afterend',link);}
  link.href='https://www.workshopdata.com/touch/site/layout/modelDetail?typeId='+encodeURIComponent(v.typeId);
 };
 setResetLink(root.VectaHaynesJobTools?.snapshot?.(registration));
 const guide=sheet.querySelector('.ssGuide'),health=sheet.querySelector('.ssHealth');
 if(guide&&health)health.appendChild(guide);
 const measures=sheet.querySelector('.ssMeasureGrid'),lower=sheet.querySelector('.ssLower');
 if(measures&&lower&&!sheet.querySelector('.ssHaynesLowerGrid')){
  const compact=document.createElement('div');compact.className='ssHaynesLowerGrid';measures.replaceWith(compact);
  const tyres=measures.children[0],brakes=measures.children[1];
  if(tyres)compact.appendChild(tyres);if(brakes)compact.appendChild(brakes);compact.appendChild(lower);
 }
 const info=sheet.querySelector('.ssInfo');
 if(info){const columns=Array.from(info.children);if(columns.length===3)columns[2].remove();}
 const pre=sheet.querySelector('.ssPre');
 if(pre){for(const cell of Array.from(pre.children)){if(cell.querySelector('.ssPreHead')?.textContent.trim()==='Work Required')cell.remove();}}
 const fluidCells=sheet.querySelectorAll('.ssFluidsHorizontal .ssFluidInline');
 for(const cell of Array.from(fluidCells).slice(2,5)){
  if(cell.querySelector('.ssHaynesTopUp'))continue;
  const field=cell.querySelector('.ssField');if(!field)continue;
  const existing=field.textContent.trim(),tick=document.createElement('span');
  tick.className='ssTickBox ssHaynesTopUp';tick.setAttribute('role','checkbox');tick.setAttribute('tabindex','0');tick.setAttribute('aria-checked','false');tick.setAttribute('aria-label',(cell.querySelector('b')?.textContent||'Fluid')+' topped up');
  tick.setAttribute('onclick',"this.classList.toggle('selected');this.setAttribute('aria-checked',String(this.classList.contains('selected')))");
  field.replaceWith(tick);if(existing){const note=document.createElement('small');note.className='ssHaynesPreviousFluid';note.textContent=existing;cell.appendChild(note);}
 }
 for(const tick of sheet.querySelectorAll('.ssHaynesTopUp'))tick.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();tick.click();}};
 const savedQuantity=sheet.querySelectorAll('.ssFluidsHorizontal .ssField')[1];
 if(savedQuantity&&savedQuantity.getAttribute('data-haynes-auto')===savedQuantity.textContent){const short=compactCapacity(savedQuantity.textContent);savedQuantity.textContent=short;savedQuantity.setAttribute('data-haynes-auto',short);}
 for(const cell of Array.from(fluidCells).slice(2,5)){
  if(cell.querySelector('.ssHaynesReplaced'))continue;
  const top=cell.querySelector('.ssHaynesTopUp');if(!top)continue;
  const group=document.createElement('div');group.className='ssHaynesFluidChecks';
  const topLabel=document.createElement('label');topLabel.textContent='Topped up ';top.replaceWith(group);topLabel.appendChild(top);group.appendChild(topLabel);
  const replaced=document.createElement('span');replaced.className='ssTickBox ssHaynesTopUp ssHaynesReplaced';replaced.setAttribute('role','checkbox');replaced.setAttribute('tabindex','0');replaced.setAttribute('aria-checked','false');replaced.setAttribute('aria-label',(cell.querySelector('b')?.textContent||'Fluid')+' replaced');replaced.setAttribute('onclick',"this.classList.toggle('selected');this.setAttribute('aria-checked',String(this.classList.contains('selected')))");
  const replaceLabel=document.createElement('label');replaceLabel.textContent='Replaced ';replaceLabel.appendChild(replaced);group.appendChild(replaceLabel);
  replaced.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();replaced.click();}};
 }
 let headerInfo=sheet.querySelector('.ssHaynesHeaderInfo');
 if(!headerInfo&&info&&info.children.length===2){headerInfo=info.children[1];headerInfo.classList.add('ssHaynesHeaderInfo');sheet.querySelector('.ssHeader')?.appendChild(headerInfo);}
 let panel=sheet.querySelector('.ssHaynes');
 const archived=!!panel?.querySelector('.ssHaynesColumns');
 for(const row of panel?.querySelectorAll('.ssHaynesConfirm')||[])row.remove();
 for(const heading of panel?.querySelectorAll('.ssHaynesColumns b')||[]){if(heading.textContent==='Engine oil'){while(heading.nextElementSibling?.tagName==='P')heading.nextElementSibling.remove();heading.remove();}}
 for(const footer of panel?.querySelectorAll('.ssHaynesData>small')||[]){if(footer.textContent.startsWith('Retrieved '))footer.remove();}
 if(!panel){panel=document.createElement('section');panel.className='ssSection ssHaynes';panel.innerHTML='<div class="ssTitle">HaynesPro schedule &amp; parts</div><div class="ssHaynesStatus" role="status" aria-live="polite">Enter the current mileage to download service requirements.</div><div class="ssHaynesData"></div>';sheet.querySelector('.ssInfo')?.insertAdjacentElement('afterend',panel);}
 const moveAdditional=()=>{
  const extra=panel.querySelector('.ssHaynesColumns>div:nth-child(2)');
  if(!extra)return;
  let page=sheet.querySelector('.ssHaynesRecommendations');
  if(!page){page=document.createElement('section');page.className='ssSection ssHaynesRecommendations';sheet.appendChild(page);}
  page.innerHTML='<div class="ssTitle">Manufacturer recommendations — check replacement history</div><p class="ssHaynesRecommendationVehicle"></p>';
  page.querySelector('p').textContent=registration+' · '+mileage(sheet).toLocaleString('en-GB')+' miles';
  extra.querySelector('b')?.remove();page.appendChild(extra);
 };
 moveAdditional();
 const fluidsSection=sheet.querySelector('.ssFluidsHorizontal')?.closest('.ssSection');
 if(fluidsSection){fluidsSection.appendChild(panel);panel.classList.add('ssHaynesIntegrated');}
 let picture=sheet.querySelector('.ssHaynesVehicle');
 if(!picture){picture=document.createElement('div');picture.className='ssHaynesVehicle';sheet.querySelector('.ssHeader')?.appendChild(picture);}
 if(headerInfo&&picture.parentNode)picture.parentNode.insertBefore(headerInfo,picture);
 const vehicleJob=()=>{const normalise=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return (root.app?.jobs||[]).find(j=>String(j.id)===sheet.getAttribute('data-job-id'))||(root.app?.jobs||[]).find(j=>normalise(j.registration)===normalise(registration))||{registration};};
 const personalise=img=>{if(!img)return;const source=img.dataset.haynesSource||safeImage(img.getAttribute('src'));if(!source)return;img.src=source;img.dataset.haynesSource=source;img.setAttribute('data-vehicle-image','');img.dataset.registration=registration;img.dataset.vehicleName=img.dataset.vehicleName||vehicleJob().make||sheet.querySelector('.ssHaynesHeaderInfo')?.textContent||'';img.dataset.colour=root.VectaHaynesJobTools?.dashboardColour(vehicleJob())||root.VectaVehicleImage?.resolveColour(registration,'')||'';delete img.dataset.personalising;root.VectaVehicleImage?.mount(picture);};
 const savedImage=picture.querySelector('img');if(savedImage){picture.replaceChildren(savedImage);personalise(savedImage);}else picture.textContent='';
 root.VectaHaynesJobTools?.lookupDashboardColour(vehicleJob()).then(()=>{if(sheet.isConnected)personalise(picture.querySelector('img'));}).catch(()=>{});
 const showVehicle=v=>{if(v?.registration!==registration)return;setResetLink(v);root.VectaHaynesJobTools?.remember(v);const image=safeImage(v.imageUrl);picture.innerHTML=image?'<img data-vehicle-make="'+esc(v.make)+'" data-vehicle-name="'+esc(v.vehicle||[v.make,v.model].filter(Boolean).join(' '))+'" src="'+esc(image)+'" alt="'+esc(v.vehicle)+'">':'';personalise(picture.querySelector('img'));sheet.classList.add('ssHasHaynesVehicle');const rows=sheet.querySelectorAll('.ssInfoRow');for(const row of rows){if(row.querySelector('b')?.textContent.trim()==='Vehicle:'){const value=row.querySelector('span');if(value)value.textContent=v.vehicle;}}};
 if(!archived){
  const tools=root.VectaHaynesJobTools;
  const saved=tools?.snapshot?.(registration)||tools?.artworkSnapshot?.(registration)||tools?.genericImage?.(vehicleJob());
  if(saved?.imageUrl){picture.innerHTML='<img data-vehicle-make="'+esc(saved.make)+'" data-vehicle-name="'+esc([saved.make,saved.model].filter(Boolean).join(' '))+'" src="'+esc(saved.imageUrl)+'" alt="Vehicle illustration">';personalise(picture.querySelector('img'));}
  const request=tools?.lookup?tools.lookup(registration):fetch('/api/haynes-vehicle?reg='+encodeURIComponent(registration),{cache:'no-store'}).then(r=>r.json()).then(d=>d.status==='MATCHED'?d.vehicle:null);
  request.then(v=>{if(sheet.isConnected&&v)showVehicle(v);}).catch(()=>{});
 }
 let guidedFlow=true,menuChoices=[];try{menuChoices=JSON.parse(panel.getAttribute('data-haynes-menu-choices')||'[]');}catch{}
 let sequence=0,timer,period='',system=panel.getAttribute('data-haynes-system')||'';
 const status=panel.querySelector('.ssHaynesStatus'),body=panel.querySelector('.ssHaynesData');
 const fillOil=oil=>{if(!Array.isArray(oil)||oil.length!==1)return;const fields=sheet.querySelectorAll('.ssFluidsHorizontal .ssField');[oil[0].specification,compactCapacity(oil[0].capacity)].forEach((v,i)=>{if(fields[i]&&!fields[i].textContent.trim()&&v){fields[i].textContent=v;fields[i].setAttribute('data-haynes-auto',v);}});panel.setAttribute('data-haynes-oil',JSON.stringify(oil));};
 if(archived){try{fillOil(JSON.parse(panel.getAttribute('data-haynes-oil')||'null'));}catch{}}

 const requiredRows=[];
 const filterNames={ 'air filter':/^(?:air filter|filter,? air)$/i, 'pollen filter':/^(?:pollen filter|cabin (?:air )?filter|filter,? cabin air|interior filter)$/i, 'fuel filter':/^(?:fuel filter|filter,? fuel)$/i, 'oil & filter change':/^(?:engine oil|oil filter|filter,? oil)$/i, 'engine oil and filter change':/^(?:engine oil|oil filter|filter,? oil)$/i, 'spark plugs':/^(?:spark plugs?|plug,? spark)$/i };
 const operations=sheet.querySelector('.ssOps');
 if(operations){for(const [index,row] of Array.from(operations.querySelectorAll('tr')).entries()){
  if(index===0){if(!row.querySelector('.ssHaynesRequiredHead')){const head=document.createElement('th');head.className='ssHaynesRequiredHead';head.textContent='Required';row.insertBefore(head,row.children[1]);}continue;}
  const label=row.children[0];if(label?.textContent.trim().toLowerCase()==='interim service')label.textContent='Oil & filter change';
  let cell=row.querySelector('.ssHaynesRequired');if(!cell){cell=document.createElement('td');cell.className='ssHaynesRequired';row.insertBefore(cell,row.children[1]);}
  const match=filterNames[label?.textContent.trim().toLowerCase()];if(match)requiredRows.push({cell,match,label:label.textContent});
 }}
 const showRequired=parts=>{for(const {cell,match,label} of requiredRows){const required=parts.some(part=>match.test(String(part).trim()));cell.innerHTML='<span class="ssCheck ssHaynesRequiredCheck'+(required?' selected':'')+'" role="checkbox" aria-checked="'+required+'" aria-disabled="true" aria-label="'+esc(label)+' required by HaynesPro">'+(required?'✓':'')+'</span>';cell.setAttribute('data-required',String(required));cell.setAttribute('aria-label',label+(required?' required by HaynesPro':' not marked required'));}};
 const clearRequired=()=>{for(const {cell} of requiredRows){cell.textContent='';cell.removeAttribute('data-required');cell.setAttribute('aria-label','Waiting for HaynesPro schedule');}};
 if(archived){try{showRequired(JSON.parse(panel.getAttribute('data-required-parts')||'null')||body.querySelector('.ssHaynesParts')?.textContent.split(' · ')||[]);}catch{clearRequired();}}
 const clearAuto=()=>sheet.querySelectorAll('[data-haynes-auto]').forEach(e=>{if(e.textContent===e.getAttribute('data-haynes-auto'))e.textContent='';e.removeAttribute('data-haynes-auto');});
 async function load(){
  if(!sheet.isConnected)return;
  const run=++sequence,current=mileage(sheet);sheet.querySelector('.ssHaynesRecommendations')?.remove();clearAuto();clearRequired();body.innerHTML='';panel.removeAttribute('data-confirmed');panel.setAttribute('data-mileage',String(current));
  if(!current){status.textContent='Enter the current mileage to download service requirements.';return;}
  status.textContent='Downloading HaynesPro service requirements…';
  try{
   let id='',d,until=Date.now()+95000;
   do{
    const query=new URLSearchParams({haynes:'service',reg:registration,mileage:String(current),period:guidedFlow?'':period,system:guidedFlow?'':system,scheduleMode:'choose',menuFlow:guidedFlow?'guided':'',menuChoices:JSON.stringify(menuChoices)});if(id)query.set('id',id);
    d=await fetch('/api/availability?'+query,{cache:'no-store'}).then(r=>r.json());
    if(run!==sequence||!sheet.isConnected||mileage(sheet)!==current)return;
    if(d.status!=='PENDING')break;id=d.id||id;await new Promise(r=>setTimeout(r,1000));
   }while(Date.now()<until);
   if(d.status!=='MATCHED')throw Error(d.status);
   const data=d.result;if(data.vehicle.registration!==registration||data.mileage!==current)throw Error('MISMATCH');
   guidedFlow=data.menuFlow==='guided';
   if(data.kind==='manual_step'){status.textContent='Haynes needs a manual step.';body.textContent=data.message;return;}
   if(data.kind==='menu_choice') {
    menuChoices=menuChoices.slice(0,data.resetFrom);panel.setAttribute('data-haynes-menu-choices',JSON.stringify(menuChoices));
    status.textContent='HaynesPro needs a selection to continue.';
    body.innerHTML='<label class="ssHaynesSelect">'+esc(data.menu.label)+'<select data-next-menu aria-label="'+esc(data.menu.label)+'"><option value="">Choose an option…</option>'+data.menu.options.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>').join('')+'</select></label>';
    body.querySelector('[data-next-menu]').onchange=e=>{if(!e.target.value)return;menuChoices.push({menu:data.menu.id,option:e.target.value});panel.setAttribute('data-haynes-menu-choices',JSON.stringify(menuChoices));period='';system='';load();};return;
   }
   const scheduleControl=selected=>'<label class="ssHaynesSelect">Maintenance schedule <select data-schedule aria-label="Haynes maintenance schedule"><option value="">Choose the schedule for this vehicle…</option>'+(data.schedules||[]).map(s=>'<option value="'+esc(s.id)+'"'+(s.id===selected?' selected':'')+'>'+esc(s.label)+'</option>').join('')+'</select></label>';
   const bindSchedule=()=>{const select=body.querySelector('[data-schedule]');if(select)select.onchange=e=>{system=e.target.value;period='';panel.removeAttribute('data-haynes-oil');panel.removeAttribute('data-required-parts');load();};};
   if(data.kind==='schedule_choices') {
    status.textContent='Choose the maintenance schedule. Check the year range and fixed or Longlife servicing.';
    system='';panel.removeAttribute('data-haynes-system');panel.removeAttribute('data-haynes-oil');panel.removeAttribute('data-required-parts');
    body.innerHTML=scheduleControl('');bindSchedule();return;
   }
   if(system&&data.system!==system)throw Error('MISMATCH');
   system=data.system||system;if(system)panel.setAttribute('data-haynes-system',system);
   if(data.kind==='period_choices') {
    status.textContent='Choose the service type for this maintenance schedule.';
    body.innerHTML=scheduleControl(system)+'<label class="ssHaynesSelect">Service type <select data-period aria-label="Haynes service type"><option value="">Choose the service type…</option>'+data.periods.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.label)+'</option>').join('')+'</select></label>';
    if(data.menuFlow==='guided'){body.querySelector('[data-period]').closest('label').hidden=true;const reset=document.createElement('button');reset.type='button';reset.className='ssHaynesRefresh';reset.textContent='Change Haynes choices';reset.onclick=()=>{menuChoices=[];period='';system='';panel.removeAttribute('data-haynes-menu-choices');load();};body.prepend(reset);}else{bindSchedule();body.querySelector('[data-period]').onchange=e=>{period=e.target.value;load();};}return;
   }
   if(!period&&data.menuFlow!=='guided'){const intervals=data.periods.slice().sort((a,b)=>Number(a.label.split(' ')[0].replace(/,/g,''))-Number(b.label.split(' ')[0].replace(/,/g,''))),selected=intervals.find(p=>Number(p.label.split(' ')[0].replace(/,/g,''))>=current);if(selected&&selected.id!==data.period){period=selected.id;return load();}}
   showVehicle(data.vehicle);showRequired(data.parts);panel.setAttribute('data-required-parts',JSON.stringify(data.parts));period=data.period;panel.setAttribute('data-fetched-at',data.fetchedAt);
   status.textContent='HaynesPro · '+data.conditions+' · Current mileage: '+current.toLocaleString('en-GB')+' miles'+(data.ageMonths!==null?' · '+data.ageMonths+' months since registration':' · Age unavailable');
   body.innerHTML=(data.schedules?.length>1?scheduleControl(system):'')+'<label class="ssHaynesSelect">Service interval <select data-period aria-label="Haynes service interval">'+data.periods.map(p=>'<option value="'+esc(p.id)+'"'+(p.id===period?' selected':'')+'>'+esc(p.label)+'</option>').join('')+'</select></label><div class="ssHaynesColumns"><div><b>Scheduled parts / filters</b><p class="ssHaynesParts">'+data.parts.map(esc).join(' · ')+'</p></div><div><b>Additional work — check replacement history</b><ul>'+data.additional.map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul></div></div>';
   moveAdditional();
   if(data.menuFlow==='guided'){body.querySelector('[data-period]').closest('label').hidden=true;const reset=document.createElement('button');reset.type='button';reset.className='ssHaynesRefresh';reset.textContent='Change Haynes choices';reset.onclick=()=>{menuChoices=[];period='';system='';panel.removeAttribute('data-haynes-menu-choices');load();};body.prepend(reset);}else{bindSchedule();body.querySelector('[data-period]').onchange=e=>{period=e.target.value;load();};}
   fillOil(data.oil);
  }catch(e){if(run!==sequence||!sheet.isConnected)return;status.textContent=({WORKER_UPDATE_REQUIRED:'Update the Workshop PC Haynes worker to download service requirements.',LOGIN_REQUIRED:'Sign in to HaynesPro again using the Workshop PC worker login.',VERIFICATION_REQUIRED:'Complete HaynesPro verification in the Workshop PC worker browser.',SCHEDULE_REQUIRED:'No supported UK service schedule was found. Check this vehicle directly in HaynesPro.',AMBIGUOUS:'HaynesPro found more than one vehicle variant. Check the correct variant in HaynesPro.',OFFLINE:'The Workshop PC Haynes worker is offline. Start it and retry.',NOT_CONFIGURED:'The HaynesPro service relay is not configured for this site.',BUSY:'HaynesPro is busy. Wait for the current lookup and retry.',DAILY_LIMIT:'The daily HaynesPro service lookup limit has been reached.',PENDING:'The HaynesPro service lookup timed out. Check the PC worker and retry.'}[e.message]||'HaynesPro service requirements unavailable. Check the PC worker and retry.');body.innerHTML='<button type="button" class="ssHaynesRefresh">Retry Haynes</button>';body.querySelector('button').onclick=load;}
 }
 const field=sheet.querySelector('.ssMileageEntry');if(field)field.addEventListener('input',()=>{sequence++;sheet.querySelector('.ssHaynesRecommendations')?.remove();clearTimeout(timer);period='';menuChoices=[];panel.removeAttribute('data-haynes-menu-choices');clearAuto();clearRequired();panel.removeAttribute('data-required-parts');body.innerHTML='';status.textContent='Mileage changed — updating Haynes requirements…';panel.removeAttribute('data-confirmed');timer=setTimeout(load,900);});
 if(archived){const schedule=body.querySelector('[data-schedule]');if(schedule)schedule.onchange=e=>{system=e.target.value;period='';load();};const select=body.querySelector('[data-period],select:not([data-schedule])');if(Array.from(sheet.querySelectorAll('.ssFluidsHorizontal .ssField')).slice(0,2).some(e=>!e.textContent.trim())){period=select?.value||'';load();}if(select)select.onchange=e=>{period=e.target.value;load();};}
 else load();
};
})(window);
