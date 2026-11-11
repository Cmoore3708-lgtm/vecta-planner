import {captureServiceCategory,readServiceCategory,readServiceAttributes} from '../gsf/service-capture.mjs';
import {readProductDialog,openSelectedProduct} from '../gsf/product-dialog.mjs';
import {repairScope} from '../../lib/repair-quote.js';
const reject=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail});};

// Read the rendered catalogue, keeping each SKU, its alternatives and its
// Attributes control together. Never derive a manufacturer's SKU from a logo.
export function readRepairGroups(doc=document){
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&!visible(n)?'':[...n.childNodes].filter(c=>!['SCRIPT','STYLE','INPUT','TEXTAREA','NAV'].includes(c.tagName)).map(text).join(' ');
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return parts.join(' > ');};
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);if(mains.length!==1)return {complete:false,groups:[]};
 const main=mains[0],nodes=[...main.querySelectorAll('*')].filter(visible);
 const skus=nodes.filter(n=>/^SKU:\s*\S+$/i.test(clean(text(n)))&&![...n.children].some(c=>/^SKU:\s*\S+$/i.test(clean(text(c)))));
 const loading=nodes.some(n=>n.getAttribute('aria-busy')==='true'||n.getAttribute('role')==='progressbar');
 const pagination=nodes.filter(n=>/^(next(?: page)?|load more|show more)$/i.test(clean(text(n)))&&![...n.children].some(c=>clean(text(c))===clean(text(n))));
 const groups=[];
 for(const sku of skus){
  let group=sku;
  for(let parent=sku.parentElement;parent&&parent!==main&&skus.filter(s=>parent.contains(s)).length===1;parent=parent.parentElement)group=parent;
  const headings=[...group.querySelectorAll('h2,h3,h4,h5')].filter(visible).map(n=>clean(text(n))).filter(s=>s&&!/^£|^(Fitment|Attributes)$/i.test(s));
  const descriptions=[...new Set(headings)];
  const attributes=[...group.querySelectorAll('button')].filter(visible).filter(n=>clean(text(n))==='Attributes');
  const options=[];
  for(const n of [...group.querySelectorAll('*')].filter(visible)){
   const t=clean(text(n));
   const m=t.match(/^£\s*(\d+(?:,\d{3})*\.\d{2})\s+(.*?)\b(?:Gold|Silver|Bronze)\s+(.+?)\s+(Local Branch|RDC|NDC|Branch Network|Out Of Stock)$/i);
   if(!m||[...n.children].some(c=>/^£\s*\d[\s\S]*\b(?:Gold|Silver|Bronze)\b[\s\S]*(?:Local Branch|RDC|NDC|Branch Network|Out Of Stock)$/i.test(clean(text(c)))))continue;
   const price=Math.round(Number(m[1].replaceAll(',',''))*100);
   if(!Number.isSafeInteger(price)||price<=0)continue;
   options.push({selector:selector(n),pricePence:price,description:m[3],inStock:!/^Out Of Stock$/i.test(m[4])});
  }
  const links=[...group.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/^(?:https:\/\/trade\.gsfcarparts\.com)?\/partdetails\//.test(h));
  const gradeCount=[...group.querySelectorAll('*')].filter(visible).filter(n=>/^(?:Gold|Silver|Bronze)$/i.test(clean(text(n)))&&!n.children.length).length;
  groups.push({parsedAll:gradeCount===options.length,selector:selector(group),sku:clean(text(sku)).replace(/^SKU:\s*/i,''),description:descriptions.length===1?descriptions[0]:'',attributesSelector:attributes.length===1?selector(attributes[0]):'',options,links:[...new Set(links)]});
 }
 return {complete:!loading&&!pagination.length&&groups.length>0&&groups.length<=40&&groups.every(g=>g.parsedAll&&g.description&&g.options.length),groups};
}
export function repairFitment(rows,scope){
 const values=(rows||[]).filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>String(r.value).toLowerCase());
 if(!scope.axle&&values.some(v=>/\b(?:front|rear)\b/.test(v)))return false;
 if(!scope.side&&values.some(v=>/\b(?:left|right)\b/.test(v)))return false;
 if(scope.axle&&!values.some(v=>new RegExp('\\b'+scope.axle+'(?: axle)?\\b').test(v)))return false;
 if(scope.axle&&values.some(v=>new RegExp('\\b'+(scope.axle==='front'?'rear':'front')+'\\b').test(v)))return false;
 if(scope.side&&!values.some(v=>new RegExp('\\b'+scope.side+'\\b').test(v)))return false;
 if(scope.side&&values.some(v=>new RegExp('\\b'+(scope.side==='left'?'right':'left')+'\\b').test(v)))return false;
 // A set of pads is one axle set; a pair of discs requires two individually
 // priced discs. Ambiguous pack sizes must not silently double/halve a price.
 const pack=(rows||[]).filter(r=>/^(?:quantity per pack|pack quantity|pack size)$/i.test(r.attribute));
 if(scope.quantity>1&&pack.length!==1)return false;
 if(pack.some(r=>!/^1$/.test(String(r.value))))return false;
 return true;
}
export async function lookupGeneralGSF(page,request,{capture=captureServiceCategory,now=Date.now}={}){
 const scope=repairScope.resolve(request.work);
 if(scope.status!=='SUPPORTED')reject('PART_NOT_RECOGNISED');
 const category=await discoverRepairCategory(page,scope.query);
 const vehicle=await capture(page,request.registration,category);
 if(vehicle.status!=='CAPTURED_FOR_REVIEW'||vehicle.registration!==request.registration||!vehicle.selectedRegistration||vehicle.truncated)reject('VEHICLE_NOT_CONFIRMED');
 // The service reader can leave its read-only Attributes dialog open.
 await page.keyboard.press('Escape');
 for(let clicks=0;clicks<40;clicks++){
  const more=page.getByText('Show More',{exact:true}),visible=[];
  for(let i=0;i<await more.count();i++)if(await more.nth(i).isVisible())visible.push(more.nth(i));
  if(!visible.length)break;
  await visible[0].click({timeout:8000});await page.waitForTimeout(250);
 }
 let snapshot=await page.evaluate(readRepairGroups);await page.waitForTimeout(300);
 const repeated=await page.evaluate(readRepairGroups);
 if(JSON.stringify(snapshot)!==JSON.stringify(repeated)||!snapshot.complete)reject('CATALOGUE_INCOMPLETE');
 const candidates=[];let matchingGroups=0;
 for(const group of snapshot.groups){
  if(!repairScope.matchesDescription(group.description,scope.query))reject('WRONG_CATEGORY_PRODUCT');
  let rows=[];
  if(group.attributesSelector||scope.axle||scope.side||request.quantity>1){
   if(!group.attributesSelector)reject('POSITION_ATTRIBUTES_MISSING');
   await page.locator(group.attributesSelector).click({timeout:8000});
   let attributes;
   for(let attempt=0;attempt<25;attempt++){attributes=await page.evaluate(readServiceAttributes);if(attributes.status==='ATTRIBUTES_CAPTURED')break;await page.waitForTimeout(200);}
   await page.keyboard.press('Escape');
   if(attributes?.status!=='ATTRIBUTES_CAPTURED')reject('POSITION_ATTRIBUTES_MISSING');rows=attributes.rows;
   if(!repairFitment(rows,scope))continue;
  }
  matchingGroups++;
  for(const option of group.options.filter(o=>o.inStock))candidates.push({group,option});
 }
 if(matchingGroups>1)reject('MULTIPLE_FITMENT_VARIANTS');
 if(!candidates.length)reject('NO_CONFIRMED_POSITION');
 candidates.sort((a,b)=>a.option.pricePence-b.option.pricePence);
 const {group,option}=candidates[0];
 if(!repairScope.matchesDescription(option.description,scope.query))reject('OPTION_DESCRIPTION_MISMATCH');
 // Use the actual rendered choice, then re-read its selected SKU. A group's
 // original/default SKU is never assigned to another brand's cheaper option.
 await page.locator(option.selector).click({timeout:8000});await page.waitForTimeout(300);
 snapshot=await page.evaluate(readRepairGroups);
 const selected=snapshot.groups.find(g=>g.selector===group.selector);
 if(!selected||selected.links.length!==1)reject('SELECTED_PRODUCT_LINK_MISSING');
 const stillSelected=await page.evaluate(readServiceCategory,{registration:request.registration,category});
 if(!stillSelected.selectedRegistration||stillSelected.registration!==request.registration)reject('VEHICLE_CHANGED');
 const url=new URL(selected.links[0],'https://trade.gsfcarparts.com');
 const searchTerm=decodeURIComponent(url.pathname.slice('/partdetails/'.length));
 await openSelectedProduct(page,{detailUrl:url.href,searchTerm});
 let product;
 for(let i=0;i<40;i++){try{product=await page.evaluate(readProductDialog);break;}catch{await page.waitForTimeout(200);}}
 if(!product||product.unitNetPence!==option.pricePence||product.description.toLowerCase()!==option.description.toLowerCase()||product.inStock!==true||!product.stock?.some(row=>row.quantity>=request.quantity)||product.vatBasis!=='EX_VAT'||!searchTerm.toUpperCase().endsWith(product.sku.toUpperCase()))reject('SELECTED_PRODUCT_CHANGED');
 return {vehicle:vehicle.visibleText.split(' Copy VIN')[0].slice(0,250),fitmentEvidence:'GSF registration '+request.registration+'; '+scope.label+'; catalogue position attributes checked',catalogueComplete:true,alternativesChecked:candidates.length,part:{source:'GSF',registration:request.registration,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description,costPence:product.unitNetPence,corePence:0,inStock:true,imageUrl:product.imageUrl,gsfUrl:url.href,checkedAt:new Date(now()).toISOString()}};
}

// Resolve the supplier's own category link from its live search. The label/URL
// comes from GSF; there is no finite list of supported parts or guessed category.
export function matchingCatalogueCategories(links,query){
 const key=value=>repairScope.words(value).sort().join(' '),expected=key(query),found=new Map();
 for(const link of links){
  let url;try{url=new URL(link.href,'https://trade.gsfcarparts.com');}catch{continue;}
  if(url.origin!=='https://trade.gsfcarparts.com'||url.username||url.password||url.hash||url.search||!url.pathname.startsWith('/parts/'))continue;
  let category=url.pathname.slice(7);try{category=decodeURIComponent(decodeURIComponent(category));}catch{continue;}
  if(!category||category.length>150||category.includes('/'))continue;
  if(key(link.text)===expected||key(category)===expected)found.set(category,category);
 }
 return [...found.values()];
}
export async function discoverRepairCategory(page,query){
 const origin='https://trade.gsfcarparts.com';
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});
 const check=()=>{const url=new URL(page.url());if(url.origin!==origin||/^\/signin/.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});};check();
 const search=page.getByRole('textbox',{name:"Search for OE (cross ref), aftermarket or categories like 'Air filter'",exact:true});
 if(await search.count()!==1)reject('CATALOGUE_SEARCH_UNAVAILABLE');
 await search.fill(query,{timeout:10000});
 async function find(){return matchingCatalogueCategories(await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({href:n.href,text:(n.innerText||n.textContent||'').trim()}))),query);}
 let categories=[];
 // The search may offer category links before submission, or on its results page.
 for(let i=0;i<8;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}
 if(!categories.length){await search.press('Enter',{timeout:10000});for(let i=0;i<40;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}}
 if(categories.length!==1)reject(categories.length?'MULTIPLE_CATALOGUE_CATEGORIES':'CATALOGUE_CATEGORY_NOT_FOUND');
 return categories[0];
}
