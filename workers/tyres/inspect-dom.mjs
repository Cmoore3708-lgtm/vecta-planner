// Diagnostic metadata only: no input values, cookies, password, page HTML or cost.
export function inspectDocument(document) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0,100);
  const allowed = /^(width|profile|rim|speed|search|include vat|include addons|show sellout|price list|multiplier)$/i;
  const fields = [];
  const search = document.querySelector('#FindProductsButton');
  // ESP uses plain text beside some inputs, rather than associated <label>s.
  // Bound the fallback inventory to the nearest search panel with 3-16 controls.
  let panel = search?.parentElement;
  while (panel && panel.tagName !== 'BODY') {
    const count = panel.querySelectorAll('input:not([type=hidden]):not([type=password]),select').length;
    if (count >= 3 && count <= 16) break;
    panel = panel.parentElement;
  }
  if (panel?.tagName === 'BODY') panel = null;
  for (const el of document.querySelectorAll('input,select,button')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['password','hidden','email'].includes(type)) continue;
    const id = el.id || '';
    const explicit = Array.from(document.querySelectorAll('label')).find(label => label.getAttribute('for') === id && id);
    const adjacent = clean(el.previousSibling?.textContent).match(/(?:^|\s)(width|profile|rim|speed)\s*:?\s*$/i)?.[1];
    const candidates = [explicit?.textContent,el.closest('label')?.textContent,el.getAttribute('aria-label'),el.getAttribute('placeholder'),adjacent,el.tagName === 'BUTTON' ? el.textContent : '',['submit','button'].includes(type) ? el.getAttribute('value') : ''];
    const label = candidates.map(clean).find(value => allowed.test(value));
    const inSearchPanel = panel?.contains(el) && !['submit','button'].includes(type) && el.tagName !== 'BUTTON';
    const nameHint = /width|profile|rim|speed|sellout|vat|addons|multiplier|pricelist/i.test(id+' '+el.getAttribute('name'));
    if (!label && !inSearchPanel && !nameHint) continue;
    fields.push({tag:el.tagName.toLowerCase(),type,id:clean(id),name:clean(el.getAttribute('name')),label:label || '',inSearchPanel:!!inSearchPanel,...(type==='checkbox'?{checked:el.checked===true}:{})});
  }
  const tables = [];
  for (const table of document.querySelectorAll('table')) {
    if (table.id !== 'OrderWindowGrid') continue;
    const headings = Array.from(table.querySelectorAll('th')).filter(el=>el.closest('table')===table).map(el=>clean(el.textContent));
    tables.push({id:clean(table.id),headings,rowCount:table.querySelectorAll('tr').length});
  }
  return {version:2,fields,tables};
}
