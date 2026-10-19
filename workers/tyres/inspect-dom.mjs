// Export only allowlisted search metadata and table headings. Never export form
// values, passwords, cookies, account details, page HTML or wholesale prices.
export function inspectDocument(document) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0,100);
  const allowed = /^(width|profile|rim|speed|search|include vat|include addons|show sellout|price list|multiplier)$/i;
  const fields = [];
  for (const el of document.querySelectorAll('input,select,button')) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['password','hidden','email'].includes(type)) continue;
    const id = el.id || '';
    const explicit = Array.from(document.querySelectorAll('label')).find(label => label.getAttribute('for') === id && id);
    const wrapping = el.closest('label');
    const candidates = [explicit?.textContent,wrapping?.textContent,el.getAttribute('aria-label'),el.getAttribute('placeholder'),el.tagName === 'BUTTON' ? el.textContent : '',['submit','button'].includes(type) ? el.getAttribute('value') : ''];
    const label = candidates.map(clean).find(value => allowed.test(value));
    if (!label) continue;
    fields.push({tag:el.tagName.toLowerCase(),type,id:clean(id),name:clean(el.getAttribute('name')),label,...(type==='checkbox'?{checked:el.checked===true}:{})});
  }
  const tables = [];
  for (const table of document.querySelectorAll('table')) {
    const headings = Array.from(table.querySelectorAll('th')).map(el=>clean(el.textContent));
    if (headings.some(h=>/^sellout$/i.test(h))) tables.push({id:clean(table.id),headings,rowCount:table.querySelectorAll('tr').length});
  }
  return {version:1,fields,tables};
}
