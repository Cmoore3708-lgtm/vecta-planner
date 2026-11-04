(function(root){
 'use strict';
 let editor=null,generation=0,abort=null,debounce=null,tyreDialog=null,tyreController=null;
 const el=id=>document.getElementById(id),value=id=>el(id)?.value||'',money=p=>'£'+(p/100).toFixed(2);
 function types(){return editor.api.jobTypeValues(value('job_job_type'));}
 function input(){const service=types().find(t=>/^(Interim|Full) Service$/i.test(t));return service?{registration:value('job_registration').toUpperCase().replace(/\s/g,''),service,mileage:null,range:editor.api.jobPartsRangeDisplay(editor?.job)||'Mid Range'}:null;}
 function fingerprint(){return JSON.stringify([editor.api.gatherJobPartsEditor(),editor.api.gatherPrivatePricingItems(),value('job_vat_mode')]);}
 function status(text){if(editor?.node.isConnected)editor.status.textContent=text;}
 async function post(body,signal){const response=await fetch('/api/service-price',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Vecta-Workshop':'1'},body:JSON.stringify({...body,workshop:true}),signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.status==='UNAUTHORISED'?'Workshop manager sign-in required.':'The supplier quote could not be added. Refresh prices and retry.');return data;}
 function parts(rows,scope){
  const existing=editor.api.gatherJobPartsEditor();
  // Keep manually added parts and anything already ordered or received.
  const retained=existing.filter(p=>!scope(p)||p.ordered||p.arrived);
  const protectedDescriptions=new Set(retained.filter(scope).map(p=>p.description));
  const next=retained.concat(rows.filter(p=>!protectedDescriptions.has(p.description)));
  const holder=document.createElement('div');holder.innerHTML=editor.api.jobPartsEditorHtml({customer_note:'[[JOB_PARTS_URI:'+encodeURIComponent(JSON.stringify(next))+']]'});
  el('jobPartsEditor').innerHTML=holder.querySelector('#jobPartsEditor').innerHTML;
  editor.api.bindJobPartsEditor();
 }
 function price(description,pence,kind){
  const rows=el('privatePricingRows'),all=Array.from(rows.children);
  const matches=all.filter(row=>kind==='service'?/^(?:Interim|Full) Service\b/i.test(row.querySelector('.privatePriceDescription').value):(row.dataset.supplierKey===kind||row.querySelector('.privatePriceDescription').value.startsWith('Tyres · '+kind.slice(5)+' · ')));
  let row=matches[0];
  if(!row){const holder=document.createElement('div');holder.innerHTML=editor.api.privatePricingRowHtml({description,price:0},rows.children.length);row=holder.firstElementChild;rows.appendChild(row);}
  matches.slice(1).forEach(r=>r.remove());
  row.dataset.supplierKey=kind;
  row.querySelector('.privatePriceDescription').value=description;
  const mode=value('job_vat_mode');
  row.querySelector('.privatePriceAmount').value=(pence/(mode==='ex_vat'?120:100)).toFixed(2);
  editor.api.bindPrivatePricing();editor.api.syncPrivatePricingTotal(true);
 }
 function serviceLookup(){
  clearTimeout(debounce);abort?.abort();const current=++generation,active=editor,request=input();
  if(!request){status('Select Interim or Full Service for live GSF pricing.');return;}
  if(!/^[A-Z0-9]{5,8}$/.test(request.registration)){status('Enter a registration to look up service parts.');return;}
  const key=JSON.stringify(request),before=fingerprint();abort=new AbortController();const signal=abort.signal;
  status('Checking GSF oil and filters…');
  const started=Date.now();
  void(async()=>{try{
   while(Date.now()-started<165000){
    const data=await post(request,AbortSignal.any([signal,AbortSignal.timeout(12000)]));
    if(current!==generation||editor!==active||!active.node.isConnected||JSON.stringify(input())!==key)return;
    if(data.status==='PENDING'){await new Promise(r=>setTimeout(r,2000));continue;}
    if(data.status!=='MATCHED'||!data.quote||!Array.isArray(data.parts)){status('GSF pricing unavailable. Any existing price remains an estimate. Use Check GSF to retry.');return;}
    const quote=data.quote;
    if(quote.expiresAt<=Date.now()||JSON.stringify(quote.request)!==JSON.stringify(request))throw Error('Quote expired. Check GSF again.');
    const label=(quote.guidePrice?'Guide price':'GSF service price')+': '+money(quote.totalPence)+' inc VAT';
    const apply=()=>{
     if(editor!==active||!active.node.isConnected||JSON.stringify(input())!==key||quote.expiresAt<=Date.now())return;
     parts(data.parts,p=>/^gsf-/.test(p.id)||(!p.cost_price&&/^(Oil filter|Air filter|Cabin filter|Pollen filter)$/i.test(p.description)));
     price(request.service+(quote.guidePrice?' — guide price':' — GSF'),quote.totalPence,'service');
     status(label+(quote.guidePrice?' · Estimated costs are labelled in Parts.':''));
     active.apply.hidden=true;
    };
    if(fingerprint()===before)apply();else{status(label+' · Your edits were kept. Click Use service price to apply.');active.apply.hidden=false;active.apply.onclick=apply;}
    return;
   }
   if(current===generation)status('GSF lookup timed out. Click Check GSF to retry.');
  }catch(error){if(current===generation&&!signal.aborted)status(error.message||'GSF lookup unavailable.');}})();
 }
 function closeTyres(){tyreController?.dispose();tyreController=null;tyreDialog?.close();tyreDialog?.remove();tyreDialog=null;}
 function openTyres(){
  closeTyres();const active=editor;if(!active)return;
  const dialog=document.createElement('dialog');tyreDialog=dialog;
  dialog.setAttribute('aria-label','Choose tyres');
  dialog.style.cssText='width:min(680px,94vw);max-height:85vh;overflow:auto;border:1px solid #64748b;border-radius:16px;background:#111827;color:#fff;padding:24px;';
  dialog.innerHTML='<h2>Choose tyres</h2><p>Retail prices include fitting, balancing, valve, disposal and VAT.</p><form method="dialog"><button class="btn" style="float:right">Close</button></form><label>Tyre size <input data-size placeholder="205/55R16" aria-label="Tyre size"></label> <label>Quantity <select data-quantity aria-label="Tyre quantity">'+[1,2,3,4].map(n=>'<option>'+n+'</option>').join('')+'</select></label> <button class="btn" data-check>Check live prices</button><p data-status role="status">Enter the tyre size and quantity.</p><div data-options></div>';
  document.body.appendChild(dialog);dialog.showModal();dialog.addEventListener('close',()=>{if(tyreDialog===dialog)closeTyres();});
  const size=dialog.querySelector('[data-size]'),quantity=dialog.querySelector('[data-quantity]'),message=dialog.querySelector('[data-status]'),options=dialog.querySelector('[data-options]');
  let result=null;
  tyreController=root.VectaTyreBooking.createController({delay:0,onChange(state){
   result=state.status==='matched'?state.result:null;options.replaceChildren();
   message.textContent=({idle:'Enter a valid tyre size, for example 205/55R16.',waiting:'Checking live database…',loading:'Checking live database for availability and prices…',unavailable:'Live prices unavailable. Check the worker connection and retry.',stale:'Prices expired. Check live prices again.',matched:'Select a tyre to add it to this job.'})[state.status]||'';
   if(!result)return;
   result.options.forEach(group=>{
    const heading=document.createElement('h3');heading.textContent=({budget:'Budget',midrange:'Mid Range',premium:'Premium'})[group.category];options.appendChild(heading);
    if(!group.available){const p=document.createElement('p');p.textContent='No stock available for this quantity.';options.appendChild(p);}
    (group.choices||[]).forEach(choice=>{
     const button=document.createElement('button');button.type='button';button.className='btn';button.style.cssText='display:block;width:100%;white-space:normal;text-align:left;margin:8px 0;padding:14px;';
     button.textContent=choice.brand+' '+choice.model+' · '+money(choice.unitPence)+' each · '+money(choice.totalPence)+' total';
     button.onclick=async()=>{
      if(!result||root.VectaTyreBooking.sizeKey(size.value)!==result.size||Number(quantity.value)!==result.quantity)return;
      const selected=result,reg=value('job_registration');button.disabled=true;message.textContent='Adding selected tyres…';
      try{
       const data=await post({action:'tyreParts',tyre_size:selected.size,tyre_quantity:selected.quantity,tyre_choice:choice.category,tyre_brand:choice.brand,tyre_guide:{...choice,size:selected.size,quantity:selected.quantity}},AbortSignal.timeout(12000));
       if(editor!==active||!active.node.isConnected||value('job_registration')!==reg||!types().some(t=>/^tyres$/i.test(t)))return;
       const key='tyre-'+selected.size;
       parts(data.parts.map(p=>({...p,id:key})),p=>p.id===key);
       price('Tyres · '+selected.size+' · '+choice.brand+' '+choice.model+' × '+selected.quantity,data.totalPence,key);
       closeTyres();
      }catch(error){message.textContent=error.message;button.disabled=false;}
     };options.appendChild(button);
    });
   });
  }});
  function clear(){tyreController.update(size.value,Number(quantity.value));}
  size.oninput=()=>{result=null;options.replaceChildren();message.textContent='Click Check live prices for this size.';tyreController.update('',1);};
  quantity.onchange=size.oninput;
  dialog.querySelector('[data-check]').onclick=()=>tyreController.update(size.value,Number(quantity.value),{refresh:true});
  size.focus();
 }
 function install(job,api){
  generation++;abort?.abort();clearTimeout(debounce);closeTyres();
  const node=el('job_registration');if(!node)return;
  const panel=document.createElement('div');panel.className='jobFormSection';
  panel.innerHTML='<b>Live service &amp; tyre prices</b><p role="status">Choose a service or tyres to look up prices.</p><button type="button" class="btn" data-service>Check GSF</button> <button type="button" class="btn" data-apply hidden>Use service price</button> <button type="button" class="btn" data-tyres>Choose tyres</button>';
  el('jobPartsEditor').closest('section').before(panel);
  editor={node,job,api,status:panel.querySelector('p'),apply:panel.querySelector('[data-apply]')};
  panel.querySelector('[data-service]').onclick=serviceLookup;
  panel.querySelector('[data-tyres]').onclick=()=>{if(!types().some(t=>/^tyres$/i.test(t)))editor.api.applyTemplate('Tyres');else openTyres();};
  node.addEventListener('input',()=>{generation++;abort?.abort();clearTimeout(debounce);editor.apply.hidden=true;debounce=setTimeout(serviceLookup,600);});
 }
 function selected(name,added){
  generation++;abort?.abort();if(editor)editor.apply.hidden=true;
  if(/^(interim|full) service$/i.test(name))serviceLookup();
  if(/^tyres$/i.test(name)&&added)openTyres();
 }
 root.VectaJobPricing={install,selected};
})(window);
