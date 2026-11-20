// ESP selectors confirmed by the workshop-PC report of 20 October 2026.
export const ESP_SEARCH = '#FindProductsButton';
export const ESP_GRID = '#OrderWindowGrid';
export function readEspGrid(document) {
  const grid = document.querySelector('#OrderWindowGrid');
  if (!grid) throw Error('ESP_RESULTS_TABLE_MISSING');
  const rows = Array.from(grid.querySelectorAll('tr')).filter(row => row.closest('table') === grid);
  const header = rows.find(row => Array.from(row.children).some(cell => cell.tagName === 'TH' && /^sellout$/i.test(cell.textContent.trim())));
  if (!header) throw Error('ESP_SELLOUT_HEADER_MISSING');
  const headings = Array.from(header.children).map(cell => cell.textContent.replace(/\s+/g,' ').trim());
  const index = label => {
    const matches = headings.flatMap((heading, i) => heading.toLowerCase() === label.toLowerCase() ? [i] : []);
    if (matches.length !== 1) throw Error('ESP_COLUMN_AMBIGUOUS: '+label);
    return matches[0];
  };
  const productIndex = index('Product'), selloutIndex = index('Sellout');
  const costColumns = headings.flatMap((h,i)=>/^cost$/i.test(h)?[i]:[]);
  const costIndex = costColumns.length===1?costColumns[0]:null;
  const stocks = ['Default','Company','Centre Stock','Warehouse','Other Warehouse','Other Stock'].flatMap(label => {
    const matches = headings.flatMap((heading,i) => heading.toLowerCase() === label.toLowerCase() ? [{label,index:i}] : []);
    return matches.length === 1 ? matches : [];
  });
  // ESP shows transfer-warehouse quantities beside green down arrows in an
  // unlabelled stock column immediately before Sellout (workshop photo 02/11/26).
  // Restrict this fallback to that column, after the named stock columns.
  const warehouseIndex = selloutIndex - 1;
  if (headings[warehouseIndex] === '' && stocks.some(stock => stock.index < warehouseIndex)) {
    stocks.push({label:'Warehouse',index:warehouseIndex});
  }
  const products = [];
  for (const row of rows) {
    const cells = Array.from(row.children);
    if (cells.some(cell=>cell.tagName==='TH') || cells.length !== headings.length || cells.some(cell=>Number(cell.getAttribute('colspan') || 1)!==1)) continue;
    const rawProduct = cells[productIndex]?.textContent.replace(/\s+/g,' ').trim() || '';
    const sizes = Array.from(rawProduct.matchAll(/\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}(?=\D|$)/gi));
    if (!sizes.length) continue;
    const normalSize = value => value.replace(/\s/g,'').toUpperCase();
    if (sizes.some(match=>normalSize(match[0])!==normalSize(sizes[0][0]))) throw Error('ESP_PRODUCT_SIZE_AMBIGUOUS');
    // ESP prepends a hidden SKU and repeats the description in a tooltip.
    const product = rawProduct.slice(sizes[0].index,sizes[1]?.index ?? rawProduct.length).trim();
    const sellout = cells[selloutIndex].textContent.replace(/\s+/g,' ').trim();
    // Cost is the wholesale unit price, separate from the VAT-inclusive Sellout.
    // Never read Actual, account data or Cart input values.
    products.push({product,sellout,cost:costIndex===null?null:cells[costIndex].textContent.replace(/\s+/g,' ').trim(),stockColumns:Object.fromEntries(stocks.map(({label,index})=>[label,cells[index].textContent.replace(/\s+/g,' ').trim()]))});
  }
  return {headings,products};
}
