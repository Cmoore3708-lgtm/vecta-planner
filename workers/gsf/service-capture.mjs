// Read-only calibration inside the shared worker. Never returns a sale quote.
const ORIGIN='https://trade.gsfcarparts.com';
export const SERVICE_CATEGORIES=['Oil Filter','Air Filter','Cabin Filter','Fuel Filter','Engine Oils (Applied)'];
export function captureRegistrations(values){
 const regs=values.map(value=>String(value).toUpperCase().replace(/\s/g,''));
 if(!regs.length||regs.length>10||regs.some(reg=>!/^[A-Z0-9]{5,8}$/.test(reg))||new Set(regs).size!==regs.length)throw Error('INVALID_REGISTRATION');
 return regs;
}
// Visible main content only; exclude account panels, inputs, HTML and VINs.
export function readServiceCategory({registration,category},doc=document){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=node=>node.nodeType===3?node.textContent:node.nodeType===1&&!visible(node)?'':[...node.childNodes].filter(n=>!['SCRIPT','STYLE','INPUT','TEXTAREA','NAV'].includes(n.tagName)).map(text).join(' ');
 const scrub=value=>clean(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]');
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);
 if(mains.length!==1)return {status:'NEEDS_REVIEW',reason:'MAIN_NOT_UNIQUE',selectedRegistration:false};
 const main=mains[0],all=scrub(text(main));
 // Require a selected-vehicle Clear control near the requested registration.
 // A recent-vehicle card or unrelated mention cannot establish selection.
 const clears=[...main.querySelectorAll('button')].filter(visible).filter(el=>clean(text(el))==='Clear');
 const selected=clears.some(button=>{let n=button.parentElement;for(let i=0;n&&n!==main&&i<5;i++,n=n.parentElement){const value=clean(text(n));if(value.length<=650&&value.toUpperCase().replace(/\s/g,'').includes(registration))return true;}return false;});
 const headings=[...main.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(el=>scrub(text(el))).filter(Boolean).slice(0,30);
 const skuLabels=[...all.matchAll(/\bSKU\s*:\s*([A-Za-z0-9._/-]+)/gi)].map(m=>m[1]);
 const prices=[...all.matchAll(/£\s*(\d+(?:,\d{3})*\.\d{2})/g)].map(m=>m[1]);
 const quantities=[...all.matchAll(/\b(?:\d+(?:\.\d+)?)\s*L\b/gi)].map(m=>m[0]);
 const productLinks=[];
 for(const anchor of [...main.querySelectorAll('a[href]')].filter(visible)){
  try{
   const url=new URL(anchor.getAttribute('href'),'https://trade.gsfcarparts.com');
   if(url.origin!=='https://trade.gsfcarparts.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/partdetails/'))continue;
   let sku=url.pathname.slice('/partdetails/'.length);
   for(let i=0;i<3;i++){if(skuLabels.includes(sku)){if(!productLinks.some(x=>x.sku===sku))productLinks.push({sku,url:url.href});break;}const next=decodeURIComponent(sku);if(next===sku)break;sku=next;}
  }catch{}
 }
 return {status:selected?'CAPTURED_FOR_REVIEW':'NEEDS_REVIEW',reason:selected?null:'SELECTED_VEHICLE_NOT_CONFIRMED',selectedRegistration:selected,registration,category,
  headings,productLinks,skuLabels:[...new Set(skuLabels)].slice(0,40),displayedPrices:[...new Set(prices)].slice(0,100),displayedLitres:[...new Set(quantities)].slice(0,20),
  visibleText:all.slice(0,14000),truncated:all.length>14000,fitmentVerified:false,oilVerified:false,approvedForPublication:false};
}
export function readServiceAttributes(doc=document){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const dialogs=[...doc.querySelectorAll('[role="dialog"]')].filter(el=>!el.hidden&&el.getAttribute('aria-hidden')!=='true'&&[...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].some(h=>clean(h.textContent)==='Attributes'));
 if(dialogs.length!==1)return {status:'NEEDS_REVIEW',reason:'ATTRIBUTES_NOT_UNIQUE',rows:[]};
 const rows=[...dialogs[0].querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('td')].map(td=>clean(td.textContent))).filter(cells=>cells.length===2).slice(0,80).map(([attribute,value])=>({attribute:attribute.slice(0,100),value:value.slice(0,400)}));
 return {status:rows.length?'ATTRIBUTES_CAPTURED':'NEEDS_REVIEW',rows,oilVerified:false};
}
async function captureAttributes(page,result){
 if(result.skuLabels?.length!==1)return {...result,attributes:{status:'NEEDS_REVIEW',reason:'MULTIPLE_OR_MISSING_PRODUCT_GROUPS'}};
 const button=page.getByRole('button',{name:'Attributes',exact:true});
 if(await button.count()!==1||!await button.isVisible())return {...result,attributes:{status:'NEEDS_REVIEW',reason:'ATTRIBUTES_CONTROL_NOT_UNIQUE'}};
 try{
  await button.click({timeout:10000});
  let attributes;
  for(let i=0;i<30;i++){attributes=await page.evaluate(readServiceAttributes);if(attributes.status==='ATTRIBUTES_CAPTURED')break;await page.waitForTimeout(200);}
  return {...result,attributes:{...attributes,groupSku:result.skuLabels[0]}};
 }catch{return {...result,attributes:{status:'NEEDS_REVIEW',reason:'ATTRIBUTES_CAPTURE_FAILED'}};}
}
function checkPage(page){const url=new URL(page.url());if(url.origin!==ORIGIN||/\/signin(?:[/?]|$)/.test(url.pathname))throw Error('LOGIN_REQUIRED');}
export async function captureServiceCategory(page,registration,category,{attempts=80}={}){
 // Oil is an applied catalogue reached through the supplier's related-item link.
 // A constructed category URL returned no parts for both verified PC vehicles.
 const oilCategory=category==='Engine Oils (Applied)';
 const seedCategory=oilCategory?'Oil Filter':category;
 const target=ORIGIN+'/parts/'+encodeURIComponent(encodeURIComponent(seedCategory));
 await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});checkPage(page);
 const clear=page.getByRole('button',{name:'Clear',exact:true});
 if(await clear.count()>1)throw Error('AMBIGUOUS_VEHICLE');
 if(await clear.count()===1&&await clear.isVisible()){
  await clear.click({timeout:10000});
  if(new URL(page.url()).pathname!==new URL(target).pathname)await page.goto(target,{waitUntil:'domcontentloaded',timeout:15000});
 }
 const field=page.getByPlaceholder('ENTER REG / VIN',{exact:true});
 await field.waitFor({state:'visible',timeout:12000});if(await field.count()!==1)throw Error('AMBIGUOUS_VEHICLE');
 await field.fill(registration);
 await page.getByRole('button',{name:'Search VRM Button',exact:true}).click({timeout:10000});
 let result;
 for(let i=0;i<attempts;i++){
  checkPage(page);result=await page.evaluate(readServiceCategory,{registration,category});
  if(new URL(page.url()).pathname!==new URL(target).pathname)throw Error('CATEGORY_REDIRECTED');
  if(result.selectedRegistration&&(result.displayedPrices?.length||result.visibleText?.match(/no (?:parts|products|results)|not available|no items/i))){
   if(!oilCategory)return captureAttributes(page,result);
   const link=page.getByText('Engine Oil',{exact:true});
   if(await link.count()!==1||!await link.isVisible())return {...result,status:'NEEDS_REVIEW',reason:'OIL_LINK_NOT_UNIQUE'};
   await link.click({timeout:10000});
   for(let j=0;j<attempts;j++){
    checkPage(page);const oilUrl=new URL(page.url());
    if(!oilUrl.pathname.startsWith('/parts/'))throw Error('CATEGORY_REDIRECTED');
    result=await page.evaluate(readServiceCategory,{registration,category});
    if(oilUrl.pathname!==new URL(target).pathname&&result.selectedRegistration&&(result.displayedPrices?.length||/Engine Oil Information/i.test(result.visibleText||'')))return captureAttributes(page,{...result,observedCategoryPath:oilUrl.pathname});
    await page.waitForTimeout(200);
   }
   return {...result,status:'NEEDS_REVIEW',reason:'OIL_LINK_NO_PRICED_ITEMS'};
  }
  await page.waitForTimeout(200);
 }
 return {...result,status:'NEEDS_REVIEW',reason:result?.selectedRegistration?'NO_PRICED_ITEMS':'SELECTED_VEHICLE_NOT_CONFIRMED'};
}
export async function captureServices(context,values,{capture=captureServiceCategory,log=()=>{},now=Date.now}={}){
 const registrations=captureRegistrations(values),rows=[];
 for(const registration of registrations){
  const categories=[];
  for(const category of SERVICE_CATEGORIES){
   let page;
   try{log(registration+' / '+category);page=await context.newPage();const result=await capture(page,registration,category);categories.push({category,...result});}
   catch(error){categories.push({category,status:'NEEDS_REVIEW',reason:['LOGIN_REQUIRED','AMBIGUOUS_VEHICLE','CATEGORY_REDIRECTED'].includes(error.message)?error.message:'CAPTURE_FAILED'});}
   finally{await page?.close().catch(()=>{});}
   // Sign-in expiry should stop the check instead of creating repeated failures.
   if(categories.at(-1).reason==='LOGIN_REQUIRED')break;
  }
  rows.push({registration,categories,complete:categories.length===SERVICE_CATEGORIES.length&&categories.every(row=>row.status==='CAPTURED_FOR_REVIEW')});
  if(categories.at(-1)?.reason==='LOGIN_REQUIRED')break;
 }
 return {version:1,purpose:'Read-only service calibration, not a live price quote',checkedAt:new Date(now()).toISOString(),rows,
  fitmentVerified:false,oilVerified:false,workerQuoteVerified:false,approvedForPublication:false};
}
