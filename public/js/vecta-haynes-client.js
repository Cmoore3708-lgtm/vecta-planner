(function(){
  'use strict';
  const R=globalThis.VectaHaynesRules;
  const pending=new Map();
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||event.data?.channel!=='vecta-haynes-response')return;
    const item=pending.get(event.data.id);if(!item)return;clearTimeout(item.timer);pending.delete(event.data.id);
    event.data.error?item.reject(Error(event.data.error)):item.resolve(event.data);
  });
  function request(action,payload){return new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(Error(action==='ping'?'Connect the VECTA HaynesPro Helper in Chrome or Edge on this PC first.':'The lookup timed out. No service information was applied.'));},action==='ping'?1500:100000);
    pending.set(id,{resolve,reject,timer});window.postMessage({channel:'vecta-haynes-request',id,action,payload},location.origin);
  });}
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function section(data){
    const block=el('section');block.className='ssSection ssHaynesData';block.dataset.haynes='1';
    block.append(el('h3','Manufacturer service information — HaynesPro'));
    block.append(el('p',data.vehicle+' · '+data.period+' · '+data.conditions+' use · '+data.mileage.toLocaleString('en-GB')+' miles'));
    block.append(el('p','Retrieved '+new Date(data.fetchedAt).toLocaleDateString('en-GB')+(data.labourHours!==null?' · Standard labour '+data.labourHours+' hours':'')));
    const oil=el('ul');data.oil.forEach(line=>oil.append(el('li',line)));block.append(el('h4','Engine oil and technical details'),oil);
    const table=el('table');table.className='ssOps';
    data.operations.forEach(line=>{const row=el('tr'),cell=el('td',line),done=el('td'),tick=el('span');done.className='ssDone';tick.className='ssCheck';tick.setAttribute('role','checkbox');tick.setAttribute('tabindex','0');tick.setAttribute('aria-checked','false');tick.setAttribute('onclick','toggleServiceCheck(this)');done.append(tick);row.append(cell,done);table.append(row);});
    block.append(el('h4','Manufacturer checklist'),table);
    for(const [title,items] of [['Parts required',data.parts],['Additional work — check mileage, age and previous replacement history',data.additionalWork]]){if(items.length){const list=el('ul');items.forEach(line=>list.append(el('li',line)));block.append(el('h4',title),list);}}
    const source=el('a','View source service schedule');source.href=data.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';block.append(source);return block;
  }
  async function open(){
    const sheet=document.querySelector('#printSheet .servicePrint');
    if(!sheet||globalThis.activeServiceKind!=='service'){alert('Open a service sheet first.');return;}
    const registration=R.reg(globalThis.activeServiceRegistration),jobId=String(globalThis.activeServiceJobId||'');
    if(!registration){alert('The service sheet needs a vehicle registration.');return;}
    if(document.querySelector('.haynesDialog'))return;
    const dialog=el('dialog');dialog.className='haynesDialog';
    dialog.append(el('h2','Get manufacturer service data'),el('p',registration+' — confirm the current mileage and usage.'));
    const mileage=el('input');mileage.type='number';mileage.min='1';mileage.step='1';mileage.id='haynes-current-mileage';
    const mileageLabel=el('label','Current mileage (miles)');mileageLabel.htmlFor=mileage.id;
    // Deliberately blank: the job mileage can be a historic MOT reading.
    const conditions=el('select');conditions.id='haynes-conditions';
    [['','Choose usage conditions'],['normal','Normal use'],['severe','Severe use']].forEach(([value,label])=>{const option=el('option',label);option.value=value;conditions.append(option);});
    const conditionLabel=el('label','Usage conditions');conditionLabel.htmlFor=conditions.id;
    const period=el('select');period.id='haynes-period';period.hidden=true;
    const periodLabel=el('label','Confirm manufacturer service interval');periodLabel.htmlFor=period.id;periodLabel.hidden=true;
    const status=el('p');status.setAttribute('role','status');
    const preview=el('div');preview.className='haynesPreview';
    const lookup=el('button','Find service schedule'),apply=el('button','Apply and save service sheet'),cancel=el('button','Cancel');apply.hidden=true;
    let discovery=null,data=null,busy=false;
    dialog.append(mileageLabel,mileage,conditionLabel,conditions,periodLabel,period,status,preview,lookup,apply,cancel);document.body.append(dialog);dialog.showModal();
    const contextValid=()=>document.querySelector('#printSheet .servicePrint')===sheet&&R.reg(globalThis.activeServiceRegistration)===registration&&String(globalThis.activeServiceJobId||'')===jobId;
    const payload=()=>({registration,mileage:Number(mileage.value),conditions:conditions.value});
    const invalidate=()=>{discovery=null;data=null;preview.replaceChildren();period.hidden=true;periodLabel.hidden=true;apply.hidden=true;lookup.textContent='Find service schedule';};
    mileage.oninput=invalidate;conditions.onchange=invalidate;
    period.onchange=()=>{data=null;apply.hidden=true;preview.replaceChildren();lookup.textContent='Get selected service data';};
    lookup.onclick=async()=>{
      if(busy)return;busy=true;lookup.disabled=true;mileage.disabled=true;conditions.disabled=true;period.disabled=true;
      try{
        if(!contextValid())throw Error('The service sheet changed. Close this window and retry.');
        const p=payload();if(!Number.isInteger(p.mileage)||p.mileage<=0)throw Error('Enter the current mileage.');if(!p.conditions)throw Error('Confirm usage conditions.');
        await request('ping');
        if(!discovery){
          status.textContent='Finding vehicle and manufacturer intervals…';discovery=(await request('discover',p)).data;
          if(R.reg(discovery.registration)!==registration)throw Error('Vehicle registration did not match.');
          period.replaceChildren();discovery.periods.forEach(item=>{const option=el('option',item.label);option.value=item.url;period.append(option);});
          const suggested=R.suggest(discovery.periods,p.mileage,discovery.registrationDate);if(suggested)period.value=suggested.url;
          period.hidden=false;periodLabel.hidden=false;lookup.textContent='Get selected service data';
          status.textContent=discovery.vehicle+' — confirm the interval against previous service history.';
        }else{
          const label=period.selectedOptions[0]?.textContent;if(!label)throw Error('Select an interval.');
          status.textContent='Reading the checklist, parts and oil specifications…';
          const result=await request('extract',{...p,period:label,periodUrl:period.value});data=R.normalise(result.data,{...p,period:label});
          if(!contextValid())throw Error('The service sheet changed during the lookup. No data was applied.');
          preview.replaceChildren(section(data));apply.hidden=false;status.textContent='Review the vehicle, interval and oil details, then apply.';
        }
      }catch(e){status.textContent=e.message;data=null;apply.hidden=true;}
      finally{busy=false;lookup.disabled=false;mileage.disabled=false;conditions.disabled=false;period.disabled=false;}
    };
    apply.onclick=async()=>{
      if(!data||busy)return;
      if(!contextValid()){status.textContent='The service sheet changed. Retry the lookup.';return;}
      const existing=sheet.querySelector('[data-haynes]');
      if(existing?.querySelector('.selected')){status.textContent='The imported checklist already has completed checks. Keep it, or start new paperwork before replacing it.';return;}
      if(existing&&!confirm('Replace the previously imported manufacturer information?'))return;
      const block=section(data);
      existing?.remove();const footer=sheet.querySelector('.ssFooter');sheet.insertBefore(block,footer||null);
      const entry=sheet.querySelector('.ssMileageEntry');if(entry)entry.textContent=String(data.mileage);
      busy=true;apply.disabled=true;cancel.disabled=true;
      try{const saved=await globalThis.saveServiceSheet();if(saved===false)throw Error('The service sheet was not saved.');dialog.close();dialog.remove();}
      catch(e){status.textContent=e.message+' Imported information remains on the sheet. Close this window and use Save to retry the shared save.';}
      finally{busy=false;apply.disabled=false;cancel.disabled=false;}
    };
    cancel.onclick=()=>{if(!busy){dialog.close();dialog.remove();}};
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else dialog.remove();});
  }
  globalThis.VectaHaynes={open,section,attachPreview(){
    if(globalThis.activeServiceKind!=='service')return;
    const controls=document.getElementById('servicePreviewControls');if(!controls||controls.querySelector('[data-haynes-get]'))return;
    const button=el('button','Get service data');button.dataset.haynesGet='1';button.className='resetPreview';button.onclick=open;controls.append(button);
  }};
})();
