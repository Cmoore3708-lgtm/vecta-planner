(function(root){
 'use strict';
 let editor=null,generation=0,abort=null,debounce=null,tyreDialog=null,tyreController=null;
 const el=id=>document.getElementById(id),value=id=>el(id)?.value||'',money=p=>'£'+(p/100).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const partNames={oil:'Engine oil',oil_filter:'Oil filter',air_filter:'Air filter',cabin_filter:'Cabin filter'};
 const serviceScope=p=>/^(gsf-|service-estimate-)/.test(p.id)||((p.cost_price===null||p.cost_price===''||p.cost_price===undefined)&&/^(?:Engine oil|Oil|Oil filter|Air filter|Cabin filter|Pollen filter)(?: — cost to confirm)?$/i.test(p.description));
 function types(){return editor.api.jobTypeValues(value('job_job_type'));}
 function input(){const service=types().find(t=>/^(Interim|Full) Service$/i.test(t));return service?{registration:value('job_registration').toUpperCase().replace(/\s/g,''),service,mileage:null,range:editor.api.jobPartsRangeDisplay(editor?.job)||'Mid Range'}:null;}
 function fingerprint(){return JSON.stringify([editor.api.gatherJobPartsEditor().filter(serviceScope),editor.api.gatherPrivatePricingItems().filter(p=>/^(Interim|Full) Service\b/i.test(p.description)),value('job_vat_mode')]);}
 function styles(){for(const name of ['vecta-tyre-booking','vecta-tyre-positions','vecta-job-pricing']){if(document.querySelector('link[data-job-pricing="'+name+'"]'))continue;const link=document.createElement('link');link.rel='stylesheet';link.href='/js/'+name+'.css';link.dataset.jobPricing=name;document.head.appendChild(link);}}
 function showActivity(busy){document.querySelectorAll('.templateBtns [data-template]').forEach(b=>{if(/^(Interim|Full) Service$/i.test(b.dataset.template))b.setAttribute('aria-busy',String(busy&&b.classList.contains('selected')));});}
 function status(text,busy=false){showActivity(busy);if(!editor?.node.isConnected)return;editor.status.textContent=text;editor.panel.classList.toggle('is-checking',busy);editor.panel.setAttribute('aria-busy',String(busy));editor.retry.disabled=busy;editor.retry.textContent=busy?'Looking up prices…':'Refresh service prices';}
 function renderAdvisor(box=el('servicePricingAdvisor')){
  if(!box||!editor?.node.isConnected||editor.node!==el('job_registration'))return false;
  const request=input();if(!request)return false;
  if(editor.lookupKey===JSON.stringify(request)&&editor.busy){box.innerHTML='<div class="job-service-loading" role="status"><span class="job-price-spinner" aria-hidden="true"></span><div><strong>Looking up oil and filter prices…</strong><p>'+esc(request.service==='Full Service'?'Engine oil, oil filter, air filter and cabin filter':'Engine oil and oil filter')+'</p></div></div>';box.style.display='';return true;}
  const row=Array.from(el('privatePricingRows')?.children||[]).find(row=>row.querySelector('.privatePriceDescription')?.value.startsWith(request.service+' — ')&&/ — (GSF|guide price|estimate)\b/.test(row.querySelector('.privatePriceDescription').value));
  if(!row)return false;
  const description=row.querySelector('.privatePriceDescription').value,amount=Number(row.querySelector('.privatePriceAmount').value);if(!Number.isFinite(amount))return false;
  const estimated=/ — (guide price|estimate)\b/.test(description),vat=value('job_vat_mode');
  box.style.display='';box.innerHTML='<div class="servicePricingActions"><div><strong>'+esc(request.service)+(estimated?' estimate':' price')+'</strong><div class="servicePricingNote">'+(estimated?'Estimated total · supplier prices incomplete':'Calculated from GSF parts and your saved pricing rules')+'</div></div><div class="servicePricingPrice">'+money(Math.round(amount*100))+'<small class="job-price-vat">'+(vat==='ex_vat'?'ex VAT':vat==='no_vat'?'No VAT':'inc VAT')+'</small></div></div>';
  return true;
 }
 async function post(body,signal){const response=await fetch('/api/service-price',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Vecta-Workshop':'1'},body:JSON.stringify({...body,workshop:true}),signal,cache:'no-store'});const data=await response.json().catch(()=>{throw Error('Supplier prices are unavailable.');});if(!response.ok)throw Error(data.status==='UNAUTHORISED'?'Workshop manager sign-in required.':'The supplier quote could not be added. Refresh prices and retry.');return data;}
 function parts(rows,scope){
  const existing=editor.api.gatherJobPartsEditor(),retained=existing.filter(p=>!scope(p)||p.ordered||p.arrived);
  const kind=p=>p.id?.match(/(?:gsf-.+|service-estimate)-(oil_filter|air_filter|cabin_filter|oil)$/)?.[1]||p.description.toLowerCase().replace(/^engine oil$/,'oil').replaceAll(' ','_');
  const protectedKinds=new Set(retained.filter(scope).map(kind));
  const next=retained.concat(rows.filter(p=>!protectedKinds.has(kind(p))));
  const holder=document.createElement('div');holder.innerHTML=editor.api.jobPartsEditorHtml({customer_note:'[[JOB_PARTS_URI:'+encodeURIComponent(JSON.stringify(next))+']]'});
  el('jobPartsEditor').innerHTML=holder.querySelector('#jobPartsEditor').innerHTML;
  editor.api.bindJobPartsEditor();
  const select=el('job_parts_status');if(select&&next.some(p=>!p.arrived))select.value=next.every(p=>p.ordered)?'Awaiting parts':'Parts need ordering';
 }
 function price(description,pence,kind){
  const rows=el('privatePricingRows'),all=Array.from(rows.children);
  const matches=all.filter(row=>kind==='service'?/^(?:Interim|Full) Service\b/i.test(row.querySelector('.privatePriceDescription').value):(row.dataset.supplierKey===kind||row.querySelector('.privatePriceDescription').value.startsWith('Tyres · '+kind.slice(5)+' · ')||/^Tyres$/i.test(row.querySelector('.privatePriceDescription').value)));
  let row=matches[0];
  if(!row){const holder=document.createElement('div');holder.innerHTML=editor.api.privatePricingRowHtml({description,price:0},rows.children.length);row=holder.firstElementChild;rows.appendChild(row);}
  matches.slice(1).forEach(r=>r.remove());row.dataset.supplierKey=kind;
  row.querySelector('.privatePriceDescription').value=description;
  row.querySelector('.privatePriceAmount').value=(pence/(value('job_vat_mode')==='ex_vat'?120:100)).toFixed(2);
  editor.api.bindPrivatePricing();editor.api.syncPrivatePricingTotal(true);renderAdvisor();
 }
 function serviceLookup(){
  clearTimeout(debounce);abort?.abort();const current=++generation,active=editor,request=input();if(!active)return;
  active.apply.hidden=true;active.busy=false;active.lookupKey=JSON.stringify(request);
  active.panel.hidden=!request;if(!request){showActivity(false);return;}
  if(!/^[A-Z0-9]{5,8}$/.test(request.registration)){status('Enter a registration to look up oil and filter prices.');return;}
  const key=JSON.stringify(request),before=fingerprint();abort=new AbortController();const signal=abort.signal;
  const valid=()=>current===generation&&editor===active&&active.node.isConnected&&JSON.stringify(input())===key;
  const finish=()=>{showActivity(false);active.busy=false;active.retry.disabled=false;active.retry.textContent='Refresh service prices';active.panel.classList.remove('is-checking');active.panel.setAttribute('aria-busy','false');};
  const offer=(label,apply)=>{finish();if(fingerprint()===before){apply();}else{status(label+' Your edits were kept. Select Use service price to apply.');active.apply.hidden=false;active.apply.onclick=()=>{if(valid()){apply();active.apply.hidden=true;}};}renderAdvisor();};
  const useEstimate=(data,reason)=>{
   if(!valid()||JSON.stringify(data.request)!==key||!Number.isSafeInteger(data.totalPence)||data.totalPence<=0||!Array.isArray(data.parts)||!Array.isArray(data.missingKinds))return;
   const label=reason+' Estimated costs: '+data.missingKinds.map(k=>partNames[k]||k).join(', ')+'. The service total includes these estimates.';
   offer(label,()=>{parts(data.parts,serviceScope);price(request.service+' — estimate',data.totalPence,'service');status(label);});
  };
  const fallback=async reason=>{
   if(!valid())return;
   // A timed-out worker can still have recent costs for this registration.
   try{const data=await post({...request,action:'estimate'},AbortSignal.any([signal,AbortSignal.timeout(5000)]));if(data.status==='ESTIMATED'){useEstimate(data,reason);return;}}catch{/* Workshop connection unavailable. */}
   if(!valid())return;
   if(root.vectaOfflineServiceEstimate)useEstimate(root.vectaOfflineServiceEstimate(request),reason);
   else {finish();status(reason+' Reopen the job to load the service estimate.');}
  };
  active.busy=true;status('Looking up oil and filter prices… '+(request.service==='Full Service'?'Engine oil, oil filter, air filter and cabin filter.':'Engine oil and oil filter.'),true);renderAdvisor();
  const started=Date.now();
  void(async()=>{try{
   while(Date.now()-started<165000){
    const data=await post(request,AbortSignal.any([signal,AbortSignal.timeout(12000)]));
    if(!valid())return;
    if(data.status==='PENDING'){await new Promise(r=>setTimeout(r,2000));continue;}
    if(data.status==='ESTIMATED'){useEstimate(data,'GSF could not price every required part.');return;}
    if(data.status!=='MATCHED'||!data.quote||!Array.isArray(data.parts)){await fallback('GSF prices are unavailable.');return;}
    const quote=data.quote;
    if(quote.expiresAt<=Date.now()||JSON.stringify(quote.request)!==key)throw Error('Quote expired. Refresh prices to retry.');
    const missing=(data.missingKinds||quote.items?.filter(p=>p.estimated).map(p=>p.kind)||[]).map(k=>partNames[k]||k);
    const label=quote.guidePrice?'Estimated service price ready. '+(missing.length?'Missing GSF prices: '+missing.join(', ')+'. These costs are clearly marked as estimated.':'Some supplier availability is unconfirmed.'):'Oil and filter prices received. Parts and calculated service price filled in below.';
    offer(label,()=>{if(!valid()||quote.expiresAt<=Date.now())return;parts(data.parts,serviceScope);price(request.service+(quote.guidePrice?' — guide price':' — GSF'),quote.totalPence,'service');status(label);active.apply.hidden=true;});return;
   }
   await fallback('GSF lookup timed out.');
  }catch(error){if(valid()&&!signal.aborted)await fallback(error.message||'GSF lookup unavailable.');}})();
 }
 function closeTyres(){const dialog=tyreDialog;tyreDialog=null;tyreController?.dispose();tyreController=null;if(dialog){dialog.close();dialog.remove();}}
 function openTyres(){
  closeTyres();const active=editor;if(!active)return;styles();
  const existing=active.api.gatherJobPartsEditor().find(p=>p.tyre_selection),saved=existing?.tyre_selection;
  const form={registration:value('job_registration'),vehicle:value('job_vehicle'),vehicle_colour:value('job_colour'),tyre_size:saved?.size||'',tyre_positions:saved?.positions?.slice()||[],tyre_brand:saved?.brand||'',tyre_choice:saved?.category||'',tyre_prices_checked:false};
  root.VectaTyrePositions.initialise(form);
  const vehicle=root.VectaHaynesJobTools?.storedDrawing({registration:form.registration,make:value('job_make'),model:value('job_model'),vehicle:form.vehicle})||null;
  const dialog=document.createElement('dialog');tyreDialog=dialog;dialog.className='job-tyre-dialog';dialog.setAttribute('aria-label','Tyre sizes, prices and wheels');
  const digits=form.tyre_size.match(/^(\d{3})\/(\d{2})R(\d{2})$/)?.slice(1)||['','',''];
  dialog.innerHTML='<div class="job-tyre-head"><div><small>'+esc(form.registration)+'</small><h2>Select your tyres</h2></div><button type="button" class="btn" data-close>Close</button></div><div class="tyre-picker tyre-position-picker"><div class="tyre-size-field"><span id="jobTyreSizeLabel">Enter your tyre size</span><div class="tyre-search-row"><div class="tyre-size-parts" role="group" aria-labelledby="jobTyreSizeLabel">'+['width','profile','rim'].map((p,i)=>(i?'<span aria-hidden="true">'+(i===1?'/':'R')+'</span>':'')+'<input data-tyre-part="'+p+'" aria-label="Tyre '+p+'" placeholder="'+['205','55','16'][i]+'" value="'+esc(digits[i])+'" inputmode="numeric" maxlength="'+(i===0?3:2)+'" autocomplete="off">').join('')+'</div><button type="button" class="tyre-check-button" data-check>Check Live<br>Prices</button></div></div><p data-status class="tyre-guide-status" role="status" aria-live="polite">Enter the three numbers, then press Check Live Prices.</p><div data-options class="tyre-options"></div>'+root.VectaTyrePositions.html(form,vehicle)+'<p class="tyre-guide-note">All prices include fitting, balancing, a standard valve, disposal and VAT.</p></div><div class="job-tyre-foot"><span data-summary>Select a tyre and the wheels to replace.</span><button type="button" class="btn green" data-save disabled>Use selected tyres</button></div><button type="button" class="job-tyre-remove" data-remove>Remove Tyres from this job</button>';
  document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('close',()=>{if(tyreDialog===dialog)closeTyres();});dialog.querySelector('[data-close]').onclick=closeTyres;
  dialog.querySelector('[data-remove]').onclick=()=>{const tyre=p=>p.tyre_selection||/^tyre-/.test(p.id);if(active.api.gatherJobPartsEditor().some(p=>tyre(p)&&(p.ordered||p.arrived))){dialog.querySelector('[data-status]').textContent='These tyres are already ordered or received. Update their ordering status before removing them.';return;}parts([],tyre);closeTyres();active.api.applyTemplate('Tyres',true);};
  const fields=Array.from(dialog.querySelectorAll('[data-tyre-part]')),message=dialog.querySelector('[data-status]'),options=dialog.querySelector('[data-options]'),save=dialog.querySelector('[data-save]'),check=dialog.querySelector('[data-check]');
  let state={status:'idle',result:null},saving=false;
  const currentChoice=()=>state.status==='matched'&&state.result?.size===root.VectaTyreBooking.sizeKey(form.tyre_size)&&state.result.quantity===(form.tyre_quantity||1)&&Date.now()-Date.parse(state.result.checkedAt)<300000?state.result.options.find(g=>g.category===form.tyre_choice)?.choices.find(c=>c.brand===form.tyre_brand):null;
  function draw(){
   const selected=currentChoice(),busy=['waiting','loading'].includes(state.status),q=form.tyre_quantity;
   message.textContent=({idle:'Enter the three numbers, then press Check Live Prices.',waiting:'Checking live database for availability & prices…',loading:'Checking live database for availability & prices…',unavailable:'Live prices unavailable. Check the worker connection and retry.',stale:'Prices could not be refreshed. Check live prices again.',matched:'Fully fitted prices · including VAT'})[state.status]||'';
   message.classList.toggle('is-checking',busy);check.disabled=busy||saving;check.textContent=busy?'Checking…':'Check Live Prices';
   options.innerHTML=[['Budget','budget'],['Mid-range','midrange'],['Premium','premium']].map(([label,category])=>{
    const group=state.status==='matched'?state.result?.options.find(g=>g.category===category):null,choices=group?.choices||[],chosen=selected?.category===category;
    return '<div class="tyre-guide-card '+(chosen?'selected':'')+'"><div class="tyre-option"><picture class="tyre-roll-picture"><source media="(prefers-reduced-motion: reduce)" srcset="/assets/tyre-axle-still.webp"><img class="tyre-cutout" src="/assets/tyre-axle-'+(chosen?'rolling':'still')+'.webp" alt="" width="240" height="240"></picture><strong>'+label+'</strong></div><div class="tyre-brand-choices"><span class="tyre-brand-label">Choose your brand</span>'+(choices.map((c,i)=>'<button type="button" class="tyre-brand-choice '+(chosen&&c.brand===selected.brand?'selected':'')+'" data-category="'+category+'" data-choice="'+i+'" aria-pressed="'+Boolean(chosen&&c.brand===selected.brand)+'" aria-label="'+esc(c.brand+' '+c.model+', '+money(c.unitPence)+' per tyre')+'" '+(saving?'disabled':'')+'>'+root.VectaTyreBooking.brandLogo(c.brand)+'<span class="tyre-guide-price">'+money(c.unitPence)+'</span></button>').join('')||'<span class="tyre-brand-empty">'+(busy?'Checking prices…':state.status==='matched'?'No stock for this quantity':'£TBC')+'</span>')+'<small class="tyre-guide-unit">per tyre · fully fitted</small></div><span class="tyre-guide-total">'+(chosen?q+' tyre'+(q===1?'':'s')+': '+money(selected.unitPence*q):'Choose a brand')+'</span></div>';
   }).join('');
   options.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{form.tyre_choice=button.dataset.category;form.tyre_brand=state.result.options.find(g=>g.category===form.tyre_choice).choices[Number(button.dataset.choice)].brand;draw();});
   const selector=dialog.querySelector('#tyrePositions');if(selector&&selector.hidden===form.tyre_prices_checked)selector.outerHTML=root.VectaTyrePositions.html(form,vehicle);
   root.VectaTyrePositions.mount(form,()=>{tyreController.update(form.tyre_size,form.tyre_quantity||1);draw();});
   dialog.querySelectorAll('[data-tyre-position]').forEach(button=>button.disabled=saving);
   save.disabled=saving||!selected||!q;save.textContent=saving?'Adding tyres…':'Use selected tyres';
   dialog.querySelector('[data-summary]').textContent=selected&&q?selected.brand+' '+selected.model+' · '+form.tyre_positions.join(', ')+' · '+money(selected.unitPence*q)+' inc VAT':'Select a tyre and the wheels to replace.';
  }
  tyreController=root.VectaTyreBooking.createController({delay:0,onChange(next){state=next;if(dialog.isConnected)draw();}});
  function invalidate(){form.tyre_size=fields[0].value+'/'+fields[1].value+'R'+fields[2].value;form.tyre_prices_checked=false;form.tyre_brand='';tyreController.update('',1);}
  function search(){if(!root.VectaTyreBooking.sizeKey(form.tyre_size)){message.textContent='Enter all three numbers, for example 205 / 55 R 16.';fields.find(f=>f.value.length!==Number(f.maxLength||f.getAttribute('maxlength')))?.focus();return;}form.tyre_prices_checked=true;tyreController.update(form.tyre_size,form.tyre_quantity||1,{refresh:true});}
  fields.forEach((field,index)=>{field.oninput=()=>{field.value=field.value.replace(/\D/g,'').slice(0,index?2:3);invalidate();if(field.value.length===(index?2:3)&&index<2)fields[index+1].focus();};field.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search();}};field.onpaste=event=>{const raw=event.clipboardData?.getData('text')||'',digits=raw.replace(/\D/g,'');if(!root.VectaTyreBooking.sizeKey(raw)&&digits.length!==7)return;event.preventDefault();[digits.slice(0,3),digits.slice(3,5),digits.slice(5,7)].forEach((v,i)=>fields[i].value=v);invalidate();fields[2].focus();};});check.onclick=search;
  save.onclick=async()=>{
   const choice=currentChoice();if(!choice||!form.tyre_quantity||saving)return;
   const selection={size:state.result.size,quantity:form.tyre_quantity,category:choice.category,brand:choice.brand,model:choice.model,positions:form.tyre_positions.slice()},key='tyre-'+selection.size;
   if(active.api.gatherJobPartsEditor().some(p=>(p.id===key||p.id===existing?.id)&&(p.ordered||p.arrived))){message.textContent='These tyres are already ordered or received. Update their ordering status before replacing the selection.';return;}
   const before=JSON.stringify([active.api.gatherJobPartsEditor(),active.api.gatherPrivatePricingItems()]);saving=true;fields.forEach(f=>f.disabled=true);draw();
   try{
    const data=await post({action:'tyreParts',tyre_size:selection.size,tyre_quantity:selection.quantity,tyre_positions:selection.positions,tyre_choice:choice.category,tyre_brand:choice.brand,tyre_guide:{...choice,size:selection.size,quantity:selection.quantity}},AbortSignal.timeout(12000));
    if(editor!==active||!active.node.isConnected||tyreDialog!==dialog||value('job_registration')!==form.registration||!types().some(t=>/^tyres$/i.test(t)))return;
    if(before!==JSON.stringify([active.api.gatherJobPartsEditor(),active.api.gatherPrivatePricingItems()]))throw Error('This job changed while prices were checked. Select Use selected tyres again.');
    if(data.status!=='MATCHED'||!data.parts?.length||!Number.isSafeInteger(data.totalPence))throw Error('Tyre prices could not be verified. Refresh prices and retry.');
    const oldKey=existing?.id;
    parts(data.parts.map(p=>({...p,id:key,tyre_selection:selection})),p=>p.id===key||p.id===oldKey||(!p.cost_price&&/^Tyres$/i.test(p.description)));
    if(oldKey&&oldKey!==key){Array.from(el('privatePricingRows').children).filter(r=>r.querySelector('.privatePriceDescription')?.value.startsWith('Tyres · '+saved.size+' · ')).forEach(r=>r.remove());}
    price('Tyres · '+selection.size+' · '+choice.brand+' '+choice.model+' × '+selection.quantity+' · '+selection.positions.join(', '),data.totalPence,key);closeTyres();
   }catch(error){if(tyreDialog===dialog){saving=false;fields.forEach(f=>f.disabled=false);draw();message.textContent=error.message;}}
  };
  draw();fields[0].focus();
 }
 function install(job,api){
  generation++;abort?.abort();clearTimeout(debounce);closeTyres();styles();
  const node=el('job_registration');if(!node)return;
  const panel=document.createElement('div');panel.className='jobFormSection job-live-pricing';
  panel.innerHTML='<div class="job-live-heading"><span class="job-price-spinner" aria-hidden="true"></span><b>Service parts &amp; price</b></div><p role="status" aria-live="polite">Select Interim or Full Service to look up oil and filter prices automatically.</p><button type="button" class="btn" data-service>Refresh service prices</button> <button type="button" class="btn" data-apply hidden>Use service price</button>';
  const choices=document.querySelector('.jobModalCard .templateBtns');if(choices)choices.after(panel);else el('jobPartsEditor').closest('section').before(panel);
  editor={node,job,api,panel,status:panel.querySelector('p'),retry:panel.querySelector('[data-service]'),apply:panel.querySelector('[data-apply]'),busy:false};
  panel.hidden=!input();editor.retry.onclick=serviceLookup;if(renderAdvisor())status('Saved service price and parts are shown below.');
  node.addEventListener('input',()=>{generation++;abort?.abort();clearTimeout(debounce);editor.busy=false;editor.apply.hidden=true;closeTyres();debounce=setTimeout(serviceLookup,600);});
  el('privatePricingRows')?.addEventListener('input',()=>renderAdvisor());
  el('job_vat_mode')?.addEventListener('change',()=>renderAdvisor());
 }
 function selected(name,added){
  if(!editor)return;
  if(/^(interim|full) service$/i.test(name))serviceLookup();
  if(/^tyres$/i.test(name)&&added)openTyres();
 }
 root.VectaJobPricing={install,selected,renderAdvisor};
})(window);
