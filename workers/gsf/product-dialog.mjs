// Read-only DOM extraction for GSF's Part Details dialog or full product page.
// Self-contained so the identical function runs in Edge and DOM fixture tests.
export function readProductDialog(doc = document) {
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const visible=element=>!element.hidden && element.getAttribute('aria-hidden')!=='true' &&
    (typeof getComputedStyle!=='function'||getComputedStyle(element).display!=='none');
  const dialogs=[...doc.querySelectorAll('[role="dialog"]')].filter(el=>visible(el)&&clean(el.querySelector('h2')?.textContent)==='Part Details');
  if(dialogs.length>1)throw Error('SETTINGS_REQUIRED');
  const fullPage=doc.location?.origin==='https://trade.gsfcarparts.com' && /^\/partdetails\/[^/]+\/?$/.test(doc.location.pathname);
  const mains=fullPage?[...doc.querySelectorAll('main,[role="main"]')].filter(visible):[];
  const dialog=dialogs[0]||(mains.length===1?mains[0]:null);
  if(!dialog)throw Error('PRODUCT_DETAILS_NOT_OPEN');
  const paragraphs=[...dialog.querySelectorAll('p')].filter(visible);
  const descriptions=[...dialog.querySelectorAll('h5')].filter(visible).map(el=>clean(el.textContent));
  if(descriptions.length!==1||!descriptions[0])throw Error('SETTINGS_REQUIRED');
  const skus=paragraphs.map(el=>clean(el.textContent)).filter(text=>/^SKU:\s*\S/.test(text));
  if(skus.length!==1)throw Error('SETTINGS_REQUIRED');
  const sku=skus[0].replace(/^SKU:\s*/,'');
  const prices=paragraphs.map(el=>clean(el.textContent)).filter(text=>/^£[\d,.]+\s+(?:ex|excluding)\s+vat$/i.test(text));
  if(prices.length!==1)throw Error('SETTINGS_REQUIRED');
  const match=prices[0].match(/^£(\d+(?:,\d{3})*)\.(\d{2})\s+(?:ex|excluding)\s+vat$/i);
  if(!match)throw Error('SETTINGS_REQUIRED');
  const unitNetPence=Number(match[1].replaceAll(',',''))*100+Number(match[2]);
  if(!Number.isSafeInteger(unitNetPence)||unitNetPence<1||unitNetPence>500000)throw Error('SETTINGS_REQUIRED');
  const field=label=>{
    const matches=paragraphs.filter(el=>clean(el.textContent)===label);
    if(matches.length!==1)return '';
    const siblings=[...matches[0].parentElement.querySelectorAll(':scope > p')].filter(visible);
    return siblings.length===2 && siblings[0]===matches[0]?clean(siblings[1].textContent):'';
  };
  const brand=field('Brand'),attributeSku=field('SKU');
  if(!brand||attributeSku!==sku)throw Error('REVIEW_REQUIRED');
  const grossLabel=field('Cost inc. VAT'),grossMatch=grossLabel.match(/^£(\d+(?:,\d{3})*)\.(\d{2})$/);
  if(!grossMatch)throw Error('SETTINGS_REQUIRED');
  const costIncVatPence=Number(grossMatch[1].replaceAll(',',''))*100+Number(grossMatch[2]);
  if(Math.abs(costIncVatPence-Math.round(unitNetPence*1.2))>1)throw Error('SETTINGS_REQUIRED');
  const stockLabels=[...dialog.querySelectorAll('*')].filter(visible).map(el=>clean(el.textContent));
  const inStock=stockLabels.some(text=>/^In stock(?: in (?:RDC|NDC))?\.?(?: Get it tomorrow\.)?$/i.test(text));
  if(!inStock||stockLabels.some(text=>/^Out of stock\.?$/i.test(text)))throw Error('UNAVAILABLE');
  const stock=[...dialog.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td')].map(el=>clean(el.textContent)))
    .filter(cells=>cells.length===2&&/^\d+$/.test(cells[1]))
    .map(([location,quantity])=>({location,quantity:Number(quantity)}));
  if(!stock.length||stock.some(row=>!row.location||row.location.length>80||!Number.isSafeInteger(row.quantity)||row.quantity>1000000)||!stock.some(row=>row.quantity>0))throw Error('UNAVAILABLE');
  if(sku.length>80||brand.length>80||descriptions[0].length>160)throw Error('SETTINGS_REQUIRED');
  const imageUrl=[...dialog.querySelectorAll('img')].map(img=>img.getAttribute('src')||'').find(src=>/^https:\/\//.test(src)&&/ProductImages\//i.test(src))||'';
  return {imageUrl,sku,brand,description:descriptions[0],unitNetPence,costIncVatPence,vatBasis:'EX_VAT',inStock,stock};
}

