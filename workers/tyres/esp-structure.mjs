// No arbitrary cell values are exported: product descriptions only, plus metadata.
export function inspectEspStructure(document) {
 const grid=document.querySelector('#OrderWindowGrid');
 if(!grid)throw Error('ESP_RESULTS_TABLE_MISSING');
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,180);
 const rows=Array.from(grid.querySelectorAll('tr')).filter(r=>r.closest('table')===grid);
 const describe=cell=>({tag:cell.tagName,index:Array.from(cell.parentElement.children).indexOf(cell),className:clean(cell.className),colspan:cell.getAttribute('colspan')||'1',display:cell.style?.display||'',childTags:Array.from(cell.children).map(c=>c.tagName).slice(0,6)});
 const headingRows=rows.filter(r=>r.querySelector('th')).map(row=>Array.from(row.children).map(cell=>({...describe(cell),heading:clean(cell.textContent)})));
 const dataRows=rows.filter(r=>!r.querySelector('th')).slice(0,5).map(row=>({className:clean(row.className),cellCount:row.children.length,cells:Array.from(row.children).map(cell=>{
  const out=describe(cell),text=clean(cell.textContent);
  // Only an explicit tyre-size/product description is allowed through.
  const product=text.match(/\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}(?=\D|$)[\s\S]*/i)?.[0];
  if(product && !/£/.test(product))out.product=product;
  return out;
 })}));
 const settings={showSellout:document.querySelector('#ShowSellout')?.checked===true,vatIncluded:document.querySelector('#ShowVat')?.checked===true,showAddOns:document.querySelector('#ShowAddOns')?.checked===true};
 const multiplier=document.querySelector('#Multiplier')?.value;
 if(/^\d+(?:\.\d+)?$/.test(multiplier||''))settings.multiplier=Number(multiplier);
 const label=document.querySelector('#PriceList1Id')?.selectedOptions?.[0]?.textContent?.trim();
 if(label==='Vecta')settings.priceList='Vecta';
 return {headingRows,dataRows,settings};
}
