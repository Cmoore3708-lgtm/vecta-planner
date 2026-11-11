import {captureServiceCategory,readServiceCategory,readServiceAttributes} from '../gsf/service-capture.mjs';
import {readProductDialog,openSelectedProduct} from '../gsf/product-dialog.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {choiceId,requireChoice} from './choice-result.mjs';
import {findCatalogueSearch} from './catalogue-search.mjs';
import {selectCatalogueVehicle} from './catalogue-vehicle.mjs';
import {observedCategory,categoryMatches,readCatalogueResults,followExactCategorySuggestion,suggestedCategoryChoices} from './catalogue-results.mjs';
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
   options.push({selector:selector(n),pricePence:price,description:m[3],grade:(t.match(/\b(Gold|Silver|Bronze)\b/i)||[])[1]||'',brand:[...n.querySelectorAll('img[alt]')].map(i=>i.getAttribute('alt')).filter(Boolean).join(' ').slice(0,80),inStock:!/^Out Of Stock$/i.test(m[4])});
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
export async function lookupGeneralGSF(page,request,{capture=captureServiceCategory,selectVehicle=selectCatalogueVehicle,now=Date.now}={}){
 const scope=repairScope.resolve(request.work);
 if(scope.status!=='SUPPORTED')reject('PART_NOT_RECOGNISED');
 const category=await discoverRepairCategory(page,scope.query,{request,now,selectVehicle});
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
  if(!request.flow&&!repairScope.matchesDescription(group.description,scope.query))reject('WRONG_CATEGORY_PRODUCT');
  let rows=[];
  if(group.attributesSelector||scope.axle||scope.side||request.quantity>1){
   if(!group.attributesSelector)reject('POSITION_ATTRIBUTES_MISSING');
   await page.locator(group.attributesSelector).click({timeout:8000});
   let attributes;
   for(let attempt=0;attempt<25;attempt++){attributes=await page.evaluate(readServiceAttributes);if(attributes.status==='ATTRIBUTES_CAPTURED')break;await page.waitForTimeout(200);}
   await page.keyboard.press('Escape');
   if(attributes?.status!=='ATTRIBUTES_CAPTURED')reject('POSITION_ATTRIBUTES_MISSING');rows=attributes.rows;
   if(!repairFitment(rows,scope)&&!request.flow)continue;
  }
  const candidateScope=request.flow?scopeForFitment(rows,scope):scope;
  if(!candidateScope)continue;
  matchingGroups++;
  for(const option of group.options.filter(o=>o.inStock))candidates.push({group,option,rows,scope:candidateScope});
 }
 if(!request.flow&&matchingGroups>1)reject('MULTIPLE_FITMENT_VARIANTS');
 if(request.flow){
  const options=gsfPartChoices(candidates,request,category);
  const index=options.findIndex(o=>o.id===request.choices?.part&&o.work===scope.work);
  if(index<0)requireChoice(request,'GSF_PART',options,{now});
  // Preserve the selected row, even when another compatible row is cheaper.
  candidates.splice(0,candidates.length,candidates[index]);
 }
 if(!candidates.length)reject('NO_CONFIRMED_POSITION');
 candidates.sort((a,b)=>a.option.pricePence-b.option.pricePence);
 const {group,option}=candidates[0];
 if(!request.flow&&!repairScope.matchesDescription(option.description,scope.query))reject('OPTION_DESCRIPTION_MISMATCH');
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
 return {vehicle:vehicle.visibleText.split(' Copy VIN')[0].slice(0,250),fitmentEvidence:'GSF registration '+request.registration+'; '+scope.label+'; catalogue position attributes checked',catalogueComplete:true,alternativesChecked:candidates.length,part:{source:'GSF',registration:request.registration,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description,costPence:product.unitNetPence,corePence:0,inStock:true,imageUrl:product.imageUrl,gsfUrl:url.href,checkedAt:new Date(now()).toISOString(),...(request.flow?{choiceId:request.choices.part}:{})}};
}

export function scopeForFitment(rows,scope){
 const position=rows.filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>r.value).join(' ').toLowerCase();
 const axis=[...new Set(position.match(/\b(front|rear)\b/g)||[])],sides=[...new Set(position.match(/\b(left|right)\b/g)||[])];
 const candidate=repairScope.scope(scope.part,scope.axle||(axis.length===1?axis[0]:''),scope.side||(sides.length===1?sides[0]:''),scope.quantity);
 return candidate.status==='SUPPORTED'&&repairFitment(rows,candidate)?candidate:null;
}
export function gsfPartChoices(candidates,request,category){
 candidates.sort((a,b)=>a.option.pricePence-b.option.pricePence);
 return candidates.map(({group,option,rows,scope})=>({
  id:choiceId(request.registration,category,group.sku,group.description,option.description,option.brand,option.grade,option.pricePence,rows.map(r=>[r.attribute,r.value]).sort()),
  label:[option.brand,option.description,option.grade].filter(Boolean).join(' · '),
  detail:('GSF fitment group '+group.sku+' · '+rows.map(r=>r.attribute+': '+r.value).join(' · ')).slice(0,500),
  costPence:option.pricePence,work:scope.work
 }));
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
export function catalogueCategoryOptions(links,query,scope){
 const found=new Map(),terms=repairScope.words(query);
 for(const link of links){
  let url,category;try{url=new URL(link.href,'https://trade.gsfcarparts.com');category=decodeURIComponent(decodeURIComponent(url.pathname.slice(7)));}catch{continue;}
  if(url.origin!=='https://trade.gsfcarparts.com'||url.username||url.password||url.hash||url.search||!url.pathname.startsWith('/parts/')||!category||category.length>150||category.includes('/'))continue;
  const label=String(link.text||category).trim();if(!label||label.length>150)continue;
  const score=repairScope.words(label).filter(t=>terms.includes(t)).length;
  const work='Supply and fit '+(scope.quantity!==1?scope.quantity+' ':'')+[scope.axle,scope.side,category].filter(Boolean).join(' ');
  found.set(category,{id:choiceId(category),label,detail:'GSF catalogue category',work,score});
 }
 return [...found.values()].sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).slice(0,40).map(({score,...o})=>o);
}
export async function discoverRepairCategory(page,query,{request,now=Date.now,selectVehicle=selectCatalogueVehicle}={}){
 const origin='https://trade.gsfcarparts.com';
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});
 const check=()=>{const url=new URL(page.url());if(url.origin!==origin||/^\/signin/.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});};check();
 let vehicle;
 if(request?.registration)vehicle=await selectVehicle(page,request.registration);
 // GSF hydrates the catalogue after DOMContentLoaded. Wait for its actual
 // visible control; wording and text/search input roles can vary by layout.
 const search=await findCatalogueSearch(page);
 await search.fill(query,{timeout:10000});
 let observed=[];
 async function find(){const current=observedCategory(page.url());if(categoryMatches(current,query))return [current];observed=await page.locator('a[href]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.closest('[hidden],[aria-hidden="true"]')).map(n=>({href:n.href,text:(n.innerText||n.textContent||'').trim()})));return matchingCatalogueCategories(observed,query);}
 let categories=[],suggestionFollowed=false;
 // The search may offer category links before submission, or on its results page.
 for(let i=0;i<8;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}
 if(!categories.length){const suggestion=await followExactCategorySuggestion(page,query,request?.choices?.gsfCategory);if(suggestion.category)return suggestion.category;suggestionFollowed=suggestion.followed===true;}
 if(!categories.length&&!suggestionFollowed){await search.press('Enter',{timeout:10000});for(let i=0;i<75;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}}
 if(!categories.length&&!suggestionFollowed){const suggestion=await followExactCategorySuggestion(page,query,request?.choices?.gsfCategory);if(suggestion.category)return suggestion.category;}
 if(categories.length!==1){
  if(request?.flow){
   const diagnostics=await page.evaluate(readCatalogueResults,{query});
   const route=new URL(page.url()).pathname;diagnostics.pageType=route.startsWith('/parts/')?'category':route.startsWith('/partdetails/')?'product':route.startsWith('/enhancedSearch/')?'search':route==='/'?'home':'other';
   diagnostics.observedCategory=observedCategory(page.url());
   diagnostics.vehicleConfirmedBeforeSearch=vehicle?.selectedRegistration===true;
   const currentVehicle=await page.evaluate(readServiceCategory,{registration:request.registration,category:'Catalogue search'});
   diagnostics.vehicleConfirmedAfterSearch=currentVehicle.selectedRegistration===true&&currentVehicle.registration===request.registration;
   // GSF can open a differently named category without leaving a category
   // link on the page. Offer that actual destination for confirmation rather
   // than treating it as an empty search or accepting a related part silently.
   if(diagnostics.observedCategory&&repairScope.words(diagnostics.observedCategory).some(w=>repairScope.words(query).includes(w))){
    const reached=new URL(page.url());reached.search='';reached.hash='';
    observed.push({href:reached.href,text:diagnostics.observedCategory});
   }
   const options=catalogueCategoryOptions(observed,query,repairScope.resolve(request.work));
   const labels=new Set(options.map(o=>o.label));
   options.push(...suggestedCategoryChoices(diagnostics,request).filter(o=>!labels.has(o.label)));
   try{requireChoice(request,'GSF_CATEGORY',options,{now});}
   catch(error){error.observed={stage:'GSF_SEARCH_RESULTS',...diagnostics};throw error;}
  }
  reject(categories.length?'MULTIPLE_CATALOGUE_CATEGORIES':'CATALOGUE_CATEGORY_NOT_FOUND');
 }
 return categories[0];
}
