import {readServiceCategory,captureServiceCategory} from './service-capture.mjs';
import {readProductDialog,openSelectedProduct} from './product-dialog.mjs';
import {oilFillEvidence} from './oil-capacity.mjs';

const ORIGIN='https://trade.gsfcarparts.com';
const review=reason=>{throw Object.assign(Error('REVIEW_REQUIRED'),{diagnosticReason:reason});};

// The kit's Quantity is a pack count, not an engine oil capacity. Read only
// visible product cards. RRP and basket totals are never supplier-cost evidence.
export function readServiceKit(doc=document){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const leafTexts=node=>[...node.querySelectorAll('*')].filter(visible).filter(el=>!['SCRIPT','STYLE','INPUT','TEXTAREA','BUTTON','SVG','PATH'].includes(el.tagName)&&!el.children.length).map(el=>({el,text:clean(el.textContent)})).filter(x=>x.text);
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);
 if(mains.length!==1)return {status:'NEEDS_REVIEW',reason:'KIT_MAIN_NOT_UNIQUE',items:[]};
 const main=mains[0];
 if(![...main.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).some(el=>/^Quick Kit\s*[-–]\s*Service Kit$/i.test(clean(el.textContent))))return {status:'NEEDS_REVIEW',reason:'SERVICE_KIT_NOT_OPEN',items:[]};
 const buttons=[...main.querySelectorAll('button')].filter(visible).filter(el=>clean(el.textContent)==='Change Brand'),cards=new Set(),items=[];
 if(!buttons.length||buttons.length>16)return {status:'NEEDS_REVIEW',reason:'KIT_ITEMS_NOT_READY',items:[]};
 const kindFor=text=>/\boil filter\b/i.test(text)?'oil_filter':/\bair filter\b/i.test(text)?'air_filter':/\b(?:cabin|pollen) filter\b/i.test(text)?'cabin_filter':/\bfuel filter\b/i.test(text)?'fuel_filter':/\bspark plug\b/i.test(text)?'spark_plug':/\b(?:motor|engine) oil\b/i.test(text)?'oil':null;
 for(const button of buttons){
  let card=null;
  for(let n=button.parentElement;n&&n!==main;n=n.parentElement){
   if(buttons.filter(b=>n.contains(b)).length!==1)break;
   if([...n.querySelectorAll('input')].filter(visible).length===1&&leafTexts(n).some(x=>/^£\s*\d/.test(x.text))){card=n;break;}
  }
  if(!card||cards.has(card))continue;
  cards.add(card);
  const fields=leafTexts(card),descriptions=fields.filter(x=>kindFor(x.text));
  if(descriptions.length!==1)continue;
  const description=descriptions[0].text,kind=kindFor(description);
  const codes=fields.filter(x=>/^[A-Z][A-Z0-9._/-]{3,79}$/i.test(x.text)&&/\d/.test(x.text)&&!/^\d+(?:\.\d+)?L$/i.test(x.text));
  if(codes.length!==1)continue;
  const prices=fields.filter(x=>/^£\s*\d+(?:,\d{3})*\.\d{2}$/.test(x.text)&&!/^RRP\b/i.test(clean(x.el.parentElement?.textContent)));
  if(prices.length!==1)continue;
  const pricePence=Math.round(Number(prices[0].text.replace(/[£,\s]/g,''))*100);
  const quantity=Number([...card.querySelectorAll('input')].filter(visible)[0].value);
  // The photographed kit defaults to one of each. A changed quantity can make
  // its displayed price a line total, so use the category reader in that case.
  if(quantity!==1||!Number.isSafeInteger(pricePence)||pricePence<1||pricePence>500000)continue;
  const pack=kind==='oil'?description.match(/\b(\d+(?:\.\d+)?)\s*L\s*$/i):null;
  const packQuantityMilli=kind==='oil'?(pack?Math.round(Number(pack[1])*1000):null):1000;
  if(!Number.isSafeInteger(packQuantityMilli)||packQuantityMilli<1||packQuantityMilli>250000)continue;
  if(description.length>160||/[<>\r\n]/.test(description))continue;
  items.push({kind,searchTerm:codes[0].text,description,expectedPricePence:pricePence,packQuantityMilli});
 }
 // Duplicate categories are ambiguous; never silently choose a second brand.
 const unique=items.filter(item=>items.filter(other=>other.kind===item.kind).length===1);
 return {status:unique.length?'CAPTURED_FOR_REVIEW':'NEEDS_REVIEW',reason:unique.length?null:'KIT_ITEMS_UNCONFIRMED',items:unique};
}

function checkPage(page){const url=new URL(page.url());if(url.origin!==ORIGIN||/^\/signin(?:\/|$)/.test(url.pathname))throw Error('LOGIN_REQUIRED');}
function identity(capture,registration){
 if(capture?.status!=='CAPTURED_FOR_REVIEW'||!capture.selectedRegistration||capture.registration!==registration||capture.truncated)review('KIT_VEHICLE_UNCONFIRMED');
 const label=String(capture.visibleText||'').split(' Clear ')[1]?.split(' Copy VIN')[0];
 if(!label)review('KIT_VEHICLE_IDENTITY_MISSING');
 return label;
}
export async function captureServiceKit(page,request,{attempts=60}={}){
 await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:15000});checkPage(page);
 const clear=page.getByRole('button',{name:'Clear',exact:true});
 if(await clear.count()>1)review('KIT_VEHICLE_AMBIGUOUS');
 if(await clear.count()===1&&await clear.isVisible())await clear.click({timeout:10000});
 const field=page.getByPlaceholder('ENTER REG / VIN',{exact:true});
 await field.waitFor({state:'visible',timeout:12000});
 if(await field.count()!==1)review('KIT_VEHICLE_AMBIGUOUS');
 await field.fill(request.registration);
 await page.getByRole('button',{name:'Search VRM Button',exact:true}).click({timeout:10000});
 let before;
 for(let i=0;i<attempts;i++){
  checkPage(page);before=await page.evaluate(readServiceCategory,{registration:request.registration,category:'Service Kit'});
  if(before.selectedRegistration)break;
  await page.waitForTimeout(200);
 }
 const selected=identity(before,request.registration);
 const link=page.getByText('Service Kit',{exact:true});
 if(await link.count()!==1||!await link.isVisible())review('SERVICE_KIT_LINK_MISSING');
 await link.click({timeout:10000});
 let kit,previous='',stable=0;
 for(let i=0;i<attempts;i++){
  checkPage(page);
  if(new URL(page.url()).pathname==='/kit/2'){
   kit=await page.evaluate(readServiceKit);
   const key=JSON.stringify(kit);
   stable=key===previous?stable+1:0;previous=key;
   if(kit.status==='CAPTURED_FOR_REVIEW'&&stable>=3)break;
  }
  await page.waitForTimeout(250);
 }
 if(kit?.status!=='CAPTURED_FOR_REVIEW'||stable<3)review(kit?.reason||'SERVICE_KIT_NOT_READY');
 // Kit pages do not repeat the VRM. Re-open the visible home link in the same
 // tab and verify that the selected identity is unchanged before using rows.
 await page.getByRole('link',{name:'TradeHub',exact:true}).click({timeout:10000});
 let after;
 for(let i=0;i<attempts;i++){
  checkPage(page);after=await page.evaluate(readServiceCategory,{registration:request.registration,category:'Service Kit'});
  if(after.selectedRegistration)break;
  await page.waitForTimeout(200);
 }
 if(identity(after,request.registration)!==selected)review('KIT_VEHICLE_CHANGED');
 return {...kit,vehicleCapture:before,registration:request.registration};
}

const descriptionKey=(value,brand='')=>String(value||'').replace(/^\d+(?:\.\d+)?\s*L\s*[-–]\s*/i,'').replace(new RegExp('^'+String(brand).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+','i'),'').replace(/\s+/g,' ').trim().toUpperCase();
export async function readKitProduct(page,row,request,{capture=captureServiceCategory,read=readProductDialog,attempts=60}={}){
 let quantityMilli=1000;
 if(row.kind==='oil'){
  const oil=await capture(page,request.registration,'Engine Oils (Applied)');
  const fill=oilFillEvidence(oil,request.registration);
  if(!fill)review('OIL_FILL_UNCONFIRMED');
  quantityMilli=fill.requiredMl;
 }
 await openSelectedProduct(page,row);
 let product;
 for(let i=0;i<attempts;i++){
  checkPage(page);
  try{product=await page.evaluate(read,{allowUnavailablePrice:true});break;}catch{await page.waitForTimeout(200);}
 }
 if(!product||!String(row.searchTerm).toUpperCase().endsWith(String(product.sku||'').toUpperCase())||!product.sku||descriptionKey(row.description,product.brand)!==descriptionKey(product.description,product.brand)||row.expectedPricePence!==product.unitNetPence)review('KIT_PRODUCT_OR_PRICE_CHANGED');
 if(product.vatBasis!=='EX_VAT')review('KIT_VAT_UNCONFIRMED');
 const inStock=product.inStock===true;
 return {kind:row.kind,sku:product.sku,brand:product.brand,description:product.description,quantityMilli,
  unitNetPence:Math.ceil(product.unitNetPence*1000/row.packQuantityMilli),
  ...(row.kind==='oil'?{packNetPence:product.unitNetPence,packQuantityMilli:row.packQuantityMilli}:{}),
  vatBasis:'EX_VAT',inStock,...(!inStock?{pricingOnly:true}:{})};
}
