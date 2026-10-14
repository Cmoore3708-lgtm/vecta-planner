// Read rendered supplier data only; do not alter Haynes checklists or estimates.
export function readSchedule() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const periods=Array.from(document.querySelector('#selectedPeriod')?.options||[]).map(o=>({id:o.value,label:clean(o.textContent).replace(/\s*\((?:OEM|OE):\s*[^()]+\)\s*$/i,'')})).filter(x=>/^mp_\d+$/.test(x.id));
  const parts=Array.from(document.querySelectorAll('#partsList li')).map(e=>clean(e.querySelector('h3')?.textContent||''));
  const additional=Array.from(document.querySelectorAll('li')).filter(e=>e.querySelector('input[id^="addSentence_"]')).map(e=>clean(e.querySelector('h3')?.textContent));
  const oilOperation=Array.from(document.querySelectorAll('li')).find(e=>/^Renew the engine oil\b/i.test(clean(e.querySelector('h3')?.textContent)));
  // The supplier can place the oil link inside the operation or its detail row.
  const operationLink=oilOperation?.querySelector('a[href*="/lubricants?"]')?.href
    ||oilOperation?.nextElementSibling?.querySelector('a[href*="/lubricants?"]')?.href;
  const lubricantLinks=[...new Set(Array.from(document.querySelectorAll('a[href*="/lubricants?"]')).map(a=>a.href))];
  const oilLink=operationLink||(lubricantLinks.length===1?lubricantLinks[0]:'');
  const oilCapacity=clean(oilOperation?.textContent).match(/Engine(?:,\s*Engine)?\s+sump,\s*including filter\s+[\d.,]+\s*\(l\)/i)?.[0]||'';
  const smartLinks=lubricantLinks.filter(href=>{try{return new URL(href).searchParams.get('smartLinkLubricant')==='true';}catch{return false;}});
  return {oilCapacity,period:document.querySelector('#selectedPeriod')?.value,schedule:clean(document.querySelector('#selectedPeriod option:checked')?.textContent),periods,parts,additional,oilLink:oilLink||(smartLinks.length===1?smartLinks[0]:'')};
}
export function readOil() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  return Array.from(document.querySelectorAll('.filter-lubricant-data')).filter(e=>!e.hidden && getComputedStyle(e).display!=='none').flatMap(e=>{
    const applicability=clean(e.querySelector('h2')?.textContent);
    const capacity=Array.from(e.querySelectorAll('li.note')).map(x=>clean(x.textContent)).filter(x=>/sump.*filter/i.test(x)).join('; ');
    return Array.from(e.querySelectorAll('li')).filter(x=>/^Engine oil(?:$|\s*\((?:Preferred|Alternative) lubricant specification\))/i.test(clean(x.querySelector('p')?.textContent))).map(x=>{
      const label=clean(x.querySelector('p')?.textContent);
      return {applicability:label==='Engine oil'?applicability:[applicability,label].filter(Boolean).join(' · '),specification:Array.from(x.querySelectorAll('[class^="lube_value"]')).map(n=>clean(n.textContent)).filter(Boolean).join(' · '),capacity};
    });
  });
}

// Some vehicles expose periods directly instead of a conditions selector.
// Only use the supplier's UK menu and its rendered system/type identifiers.
export function readDirectSchedules() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const menus=[];
  for(const select of document.querySelectorAll('select[onchange]')) {
    if(!Array.from(select.options).some(o=>/^Select Maintenance system \(United Kingdom\)$/i.test(clean(o.textContent))))continue;
    const match=(select.getAttribute('onchange')||'').match(/['"]([^'"]*\/maintenanceSchedule\?[^'"]+)['"]/);
    if(!match)continue;
    let base;
    try {base=new URL(match[1],location.href);}catch{continue;}
    const system=base.searchParams.get('maintenanceSystemId'),typeId=base.searchParams.get('typeId');
    if(base.origin!=='https://www.workshopdata.com'||base.pathname!=='/touch/site/layout/maintenanceSchedule'||!/^ms_\d+$/.test(system||'')||!/^t_\d+$/.test(typeId||''))continue;
    const links=Array.from(select.options).filter(o=>/^mp_\d+$/.test(o.value)).map(o=>{
      const url=new URL(base.href);url.searchParams.set('maintenancePeriodId',o.value);
      return {href:url.href,label:clean(o.textContent).replace(/\s*\((?:OEM|OE):\s*[^()]+\)\s*$/i,'')};
    }).filter(o=>/^\d[\d,]* miles\/\d+ months$/.test(o.label));
    if(links.length)menus.push({system,typeId,conditions:'United Kingdom',links});
  }
  if(!menus.length)return null;
  const signatures=new Set(menus.map(m=>JSON.stringify(m)));
  return signatures.size===1?menus[0]:{ambiguous:true};
}


// Read normal schedule links and the equivalent supplier GET Continue form.
// Never submit an estimate or mutate the supplier checklist.
export function readConditionSchedules() {
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const labelPattern=/\b[\d,]+ miles\s*\/\s*\d+ months\b/gi;
  const links=Array.from(document.querySelectorAll('a[href*="maintenanceSchedule?"]')).map(a=>({href:a.href,label:clean(a.textContent).replace(/\s*\((?:OEM|OE):\s*[^()]+\)\s*$/i,'')}));
  for(const form of document.querySelectorAll('form')) {
    if(String(form.getAttribute('method')||'get').toLowerCase()!=='get')continue;
    let base;try{base=new URL(form.getAttribute('action')||location.href,location.href);}catch{continue;}
    if(base.origin!=='https://www.workshopdata.com'||base.pathname!=='/touch/site/layout/maintenanceSchedule')continue;
    const fields=Array.from(form.querySelectorAll('input,select,textarea'));
    for(const field of fields){if(!field.name||field.disabled||field.name==='maintenancePeriodId')continue;
      if(['checkbox','radio'].includes(field.type)&&!field.checked)continue;
      if(['submit','button','reset','file'].includes(field.type))continue;
      base.searchParams.set(field.name,field.value);
    }
    if(!/^t_\d+$/.test(base.searchParams.get('typeId')||'')||!/^ms_\d+$/.test(base.searchParams.get('maintenanceSystemId')||''))continue;
    const periods=fields.filter(field=>field.name==='maintenancePeriodId'&&!field.disabled);
    for(const field of periods){
      const options=field.tagName==='SELECT'?Array.from(field.options):[field];
      for(const option of options){if(!/^mp_\d+$/.test(option.value||''))continue;
        let label=option.tagName==='OPTION'?clean(option.textContent):'';
        if(!label){const associated=Array.from(document.querySelectorAll('label')).find(el=>el.htmlFor===field.id&&field.id);label=clean(associated?.textContent||field.closest('label')?.textContent);}
        let container=field.parentElement;
        for(let depth=0;!label&&container&&container!==form&&depth<4;depth++,container=container.parentElement){const matches=clean(container.textContent).match(labelPattern)||[];if(matches.length===1)label=matches[0];}
        const matches=label.match(labelPattern)||[];if(matches.length!==1)continue;
        const url=new URL(base.href);url.searchParams.set('maintenancePeriodId',option.value);
        links.push({href:url.href,label:matches[0].replace(/\s*\/\s*/g,'/')});
      }
    }
  }
  // Supplier markup confirmed on CM14KEL: custom checkboxes under a system heading.
  for(const input of document.querySelectorAll('li.combinableSystem_period input[type="checkbox"][maintenanceperiodid]')) {
    const period=input.getAttribute('maintenanceperiodid');
    if(!/^mp_\d+$/.test(period||'')||input.id!==period)continue;
    const group=input.closest('li.dropdown');
    const heading=group?.querySelector('[id^="maintenanceSystem_ms_"]');
    const system=heading?.id.replace(/^maintenanceSystem_/,'');
    if(!/^ms_\d+$/.test(system||''))continue;
    const row=input.closest('li.combinableSystem_period');
    const label=clean(row?.querySelector('label')?.textContent);
    if(!/^\d[\d,]* miles\/\d+ months$/.test(label))continue;
    let url;try{url=new URL(location.href);}catch{continue;}
    if(url.origin!=='https://www.workshopdata.com'||!/^t_\d+$/.test(url.searchParams.get('typeId')||''))continue;
    url.pathname='/touch/site/layout/maintenanceSchedule';
    url.searchParams.set('maintenanceSystemId',system);url.searchParams.set('maintenancePeriodId',period);
    // Used only for matching identifiers; navigate with the supplier's Continue control.
    links.push({href:url.href,label,checkboxId:period,systemHeadingId:heading.id});
  }
  return links;
}

// Narrow diagnostic inventory: never record page text, credentials or arbitrary values.
export function readScheduleDiagnostics() {
  const safeId = value => /^(?:t_|ms_|mp_)\d+$/.test(value || '') ? value : '[redacted]';
  const label = value => {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.match(/\d[\d,]*\s*miles\s*\/\s*\d+\s*months/i)?.[0] ||
      (/^(?:Continue|Select|Normal conditions \(United Kingdom\)|Additional procedures, Severe conditions \(United Kingdom\))$/i.test(text) ? text : '[omitted]');
  };
  const safeURL = value => {
    try {
      const url = new URL(value || '', location.href);
      if (url.origin !== 'https://www.workshopdata.com') return '[external]';
      const params = new URLSearchParams();
      for (const name of ['typeId','maintenanceSystemId','maintenancePeriodId','currentTypeCar']) {
        const value = url.searchParams.get(name);
        if (value && safeId(value) !== '[redacted]') params.set(name, value);
      }
      return url.pathname + (params.size ? '?' + params.toString() : '');
    } catch { return '[invalid]'; }
  };
  const meta = el => ({tag:el.tagName, id:el.id || '', name:el.getAttribute('name') || '', type:el.getAttribute('type') || '',
    value:safeId(el.getAttribute('value')), label:label(el.textContent),
    onclick:el.hasAttribute('onclick'), onchange:el.hasAttribute('onchange'),
    handlerDestinations:[...(el.getAttribute('onchange') || '').matchAll(/['"]([^'"]*\/touch\/site\/layout\/[^'"]+)['"]/g)].map(match=>safeURL(match[1])),
    dataAttributes:Array.from(el.attributes).filter(a=>a.name.startsWith('data-')).map(a=>({name:a.name,value:safeId(a.value)}))});
  return {
    page:safeURL(location.href),
    forms:Array.from(document.querySelectorAll('form')).slice(0,30).map(form=>({
      id:form.id || '', method:form.getAttribute('method') || '', action:safeURL(form.getAttribute('action')),
      controls:Array.from(form.querySelectorAll('input,select,button')).slice(0,200).map(meta)
    })),
    selects:Array.from(document.querySelectorAll('select')).slice(0,30).map(select=>({
      ...meta(select), selectedValue:safeId(select.value), selectedLabel:label(select.querySelector('option:checked')?.textContent), options:Array.from(select.querySelectorAll('option')).slice(0,200).map(o=>({value:safeId(o.getAttribute('value')),label:label(o.textContent)}))
    })),
    choices:Array.from(document.querySelectorAll('input[type="radio"],input[type="checkbox"]')).slice(0,200).map(el=>({
      ...meta(el),label:label(el.closest('label')?.textContent || el.parentElement?.textContent)
    })),
    continueControls:Array.from(document.querySelectorAll('button,a,input[type="submit"],input[type="button"]')).filter(el=>/^continue$/i.test((el.textContent || el.getAttribute('value') || '').trim())).slice(0,20).map(el=>({
      ...meta(el),href:el.hasAttribute('href') ? safeURL(el.getAttribute('href')) : null
    }))
  };
}

// Discover the schedule selector by its supplier IDs, not manufacturer wording.
export function readScheduleSelectors() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  return Array.from(document.querySelectorAll('select')).map((select,index)=>({index,options:Array.from(select.options).map(o=>({value:o.value,label:clean(o.textContent)}))})).filter(menu=>menu.options.some(o=>/^ms_\d+$/.test(String(o.value).split(',')[0])&&/\(United Kingdom\)\s*$/i.test(o.label)));
}

// Discover native maintenance dropdowns by their container and supplier IDs.
// Wording is display data, never a whitelist of manufacturers or service names.
export function readMaintenanceMenus() {
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'&&!!el.getClientRects().length;
 const menus=[],unsupported=[];
 for(const [index,select] of Array.from(document.querySelectorAll('select')).entries()) {
  if(!visible(select)||select.disabled)continue;
  const form=select.closest('form');let formService=false;
  if(form&&String(form.getAttribute('method')||'get').toLowerCase()==='get') {
   try {const u=new URL(form.getAttribute('action')||location.href,location.href);formService=u.origin==='https://www.workshopdata.com'&&/\/maintenanceSchedule$/.test(u.pathname);}catch{}
  }
  const native=Array.from(select.options),supplierIds=native.some(o=>/^(?:ms_|mp_)\d+(?:,|$)/.test(o.value));
  const section=select.closest('[id^="maintenance"],[class*="maintenance"],li.dropdown:has([id^="maintenanceSystem_"])');
  if(!supplierIds&&!formService&&!section)continue;
  if(form&&String(form.getAttribute('method')||'get').toLowerCase()==='post'){unsupported.push({kind:'post-form',label:'Maintenance question requires form support'});continue;}
  if(select.multiple){unsupported.push({kind:'multiple-select',label:'Maintenance question allows several selections'});continue;}
  const options=native.filter(o=>!o.disabled&&String(o.value)!==''&&!/^Select\b/i.test(clean(o.textContent))).map(o=>({value:o.value,label:clean(o.textContent)})).filter(o=>o.label);
  if(!options.length)continue;
  const labels=Array.from(document.querySelectorAll('label')).find(label=>select.id&&(label.htmlFor||label.getAttribute('for'))===select.id);
  const label=clean(labels?.textContent||select.getAttribute('aria-label')||document.getElementById(select.getAttribute('aria-labelledby')||'')?.textContent||select.closest('label')?.textContent||select.closest('fieldset')?.querySelector('legend')?.textContent||section?.querySelector('h2,h3,h4')?.textContent)|| (native.some(o=>/^ms_\d+/.test(o.value))?'Maintenance schedule':'Service options');
  menus.push({kind:'select',index,name:select.name||select.id||'',label,options});
 }
 return {menus,unsupported};
}
