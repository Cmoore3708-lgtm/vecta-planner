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
  const stocks = ['Default','Company','Centre Stock'].flatMap(label => {
    const matches = headings.flatMap((heading,i) => heading === label ? [{label,index:i}] : []);
    return matches.length === 1 ? matches : [];
  });
  const products = [];
  for (const row of rows) {
    const cells = Array.from(row.children);
    if (cells.some(cell=>cell.tagName==='TH') || cells.length !== headings.length || cells.some(cell=>Number(cell.getAttribute('colspan') || 1)!==1)) continue;
    const product = cells[productIndex]?.textContent.replace(/\s+/g,' ').trim();
    if (!/^\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}\b/i.test(product || '')) continue;
    const sellout = cells[selloutIndex].textContent.replace(/\s+/g,' ').trim();
    // Never read wholesale Cost, Actual, account data or Cart input values.
    products.push({product,sellout,stockColumns:Object.fromEntries(stocks.map(({label,index})=>[label,cells[index].textContent.replace(/\s+/g,' ').trim()]))});
  }
  return {headings,products};
}
