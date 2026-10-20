import {parseSize} from './guide.mjs';
import {readEspGrid} from './esp-dom.mjs';
import {ensureEnquiry} from './esp-enquiry.mjs';
import {readEspSettings} from './esp-settings.mjs';
import {parseEspProduct} from './esp-normalise.mjs';
export async function testEspSearch(page,size,{trackRefresh=false}={}){
 const parsed=parseSize(size);
 await ensureEnquiry(page);
 for(const [id,value] of [['key1',parsed.width],['key2',parsed.profile],['key3',parsed.rim],['key4','']]){
  const field=page.locator('#'+id);
  if(await field.count()!==1)throw Error('ESP_SEARCH_CONTROLS_CHANGED');
  await field.fill(String(value));
 }
 const search=page.locator('#FindProductsButton');
 if(await search.count()!==1 || (await search.inputValue()).trim().toLowerCase()!=='search')throw Error('ESP_SEARCH_BUTTON_CHANGED');
 const before=await page.locator('#OrderWindowGrid').textContent();
 const marker=trackRefresh?String(Date.now())+'-'+Math.random().toString(36).slice(2):'';
 const marked=trackRefresh?await page.locator('#OrderWindowGrid tr').evaluateAll((rows,marker)=>{let count=0;for(const row of rows)if(/\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}/i.test(row.textContent)){row.setAttribute('data-vecta-search',marker);count++}return count},marker):0;
 await search.click();
 // Different sizes must produce different table contents. A stale table fails.
 if(trackRefresh)await page.waitForFunction(({previous,marker,marked})=>{
  const grid=document.querySelector('#OrderWindowGrid');if(!grid)return false;
  if(marked)return !grid.querySelector('[data-vecta-search="'+marker+'"]')&&Array.from(grid.querySelectorAll('tr')).some(row=>/\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}/i.test(row.textContent));
  return grid.textContent!==previous;
 },{previous:before,marker,marked},{timeout:15000});
 else await page.waitForFunction(previous=>{const grid=document.querySelector('#OrderWindowGrid');return grid&&grid.textContent!==previous;},before,{timeout:20000});
 // Require the grid text to settle, not just a spinner or first partial result.
 let previous='',stable=0;
 for(let attempt=0;attempt<40;attempt++){
  const current=await page.locator('#OrderWindowGrid').textContent();
  stable=current===previous?stable+1:0;previous=current;
  if(stable>=3)break;
  await new Promise(resolve=>setTimeout(resolve,250));
  if(attempt===39)throw Error('ESP_RESULTS_NOT_STABLE');
 }
 const result=await page.evaluate(source=>(new Function('return ('+source+')')())(document),readEspGrid.toString());
 const mismatches=result.products.filter(row=>{
  const m=row.product.match(/\d{3}\s*\/\s*\d{2}\s*R\s*\d{2}/i);return !m || m[0].replace(/\s/g,'').toUpperCase()!==parsed.key;
 });
 if(mismatches.length)throw Error('ESP_RESULTS_SIZE_MISMATCH');
 const settings=await page.evaluate(source=>(new Function('return ('+source+')')())(document),readEspSettings.toString());
 const catalogue=result.products.map(row=>parseEspProduct(row)).filter(Boolean);
 return {requestedSize:parsed.key,productsRead:result.products.length,selloutSample:result.products.slice(0,5),settings,guideCatalogue:catalogue};
}
