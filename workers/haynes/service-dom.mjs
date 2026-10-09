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
  return {period:document.querySelector('#selectedPeriod')?.value,schedule:clean(document.querySelector('#selectedPeriod option:checked')?.textContent),periods,parts,additional,oilLink};
}
export function readOil() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  return Array.from(document.querySelectorAll('.filter-lubricant-data')).filter(e=>!e.hidden && getComputedStyle(e).display!=='none').flatMap(e=>{
    const applicability=clean(e.querySelector('h2')?.textContent);
    const capacity=Array.from(e.querySelectorAll('li.note')).map(x=>clean(x.textContent)).filter(x=>/sump.*filter/i.test(x)).join('; ');
    return Array.from(e.querySelectorAll('li')).filter(x=>/^Engine oil$/i.test(clean(x.querySelector('p')?.textContent))).map(x=>({applicability,specification:Array.from(x.querySelectorAll('[class^="lube_value"]')).map(n=>clean(n.textContent)).filter(Boolean).join(' · '),capacity}));
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
