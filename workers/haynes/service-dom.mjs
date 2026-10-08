// Read rendered supplier data only; do not alter Haynes checklists or estimates.
export function readSchedule() {
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const periods=Array.from(document.querySelector('#selectedPeriod')?.options||[]).map(o=>({id:o.value,label:clean(o.textContent)})).filter(x=>/^mp_\d+$/.test(x.id));
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
