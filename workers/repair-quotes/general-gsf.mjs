import {readServiceCategory,readServiceAttributes} from '../gsf/service-capture.mjs';
import {readProductDialog,openSelectedProduct,selectedProductUrl} from '../gsf/product-dialog.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {choiceId,requireChoice} from './choice-result.mjs';
import {findCatalogueSearch} from './catalogue-search.mjs';
import {selectCatalogueVehicle} from './catalogue-vehicle.mjs';
import {observedCategory,categoryMatches,labelledDestinationCategory,readCatalogueResults,followExactCategorySuggestion,suggestedCategoryChoices} from './catalogue-results.mjs';
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
  const headings=[...group.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map(n=>clean(text(n))).filter(s=>s&&!/^£|^(Fitment|Attributes)$/i.test(s));
  let descriptions=[...new Set(headings)];
  const attributes=[...group.querySelectorAll('button')].filter(visible).filter(n=>clean(text(n))==='Attributes');
  const options=[],cards=[];let unavailableCount=0;
  const optionMatch=value=>{
   if((value.match(/£\s*\d/g)||[]).length!==1)return null;
   return value.match(/^£\s*(\d+(?:,\d{3})*\.\d{2})\s+(.*?)\b(Gold|Silver|Bronze)(?:\s+(.+?))?\s+(Local Branch|RDC|NDC|Branch Network|Out Of Stock)$/i);
  };
  for(const n of [...group.querySelectorAll('*')].filter(visible)){
   const t=clean(text(n));
   const m=optionMatch(t);
   if(!m||[...n.children].some(c=>optionMatch(clean(text(c)))))continue;
   // A radio and brand image can be siblings of the price/text div. Keep the
   // whole observed card, stopping before any other card or the SKU header.
   let card=n;
   while(card.parentElement&&card.parentElement!==group&&clean(text(card.parentElement))===t)card=card.parentElement;
   const price=Math.round(Number(m[1].replaceAll(',',''))*100);
   // Calibrated GSF unavailable cards omit a description and display £0.00.
   // Count them only with explicit Out Of Stock evidence; never offer £0 parts.
   if(price===0&&!m[4]&&/^Out Of Stock$/i.test(m[5])){unavailableCount++;cards.push(card);continue;}
   if(!Number.isSafeInteger(price)||price<=0||!m[4])continue;
   cards.push(card);
   const radios=[...card.querySelectorAll('input[type="radio"],[role="radio"]')];
   const selected=radios.length===1&&(radios[0].tagName==='INPUT'?(typeof radios[0].checked==='boolean'?radios[0].checked:radios[0].hasAttribute('checked')):radios[0].getAttribute('aria-checked')==='true');
   const logos=[...card.querySelectorAll('img[src]')].map(img=>{try{const url=new URL(img.getAttribute('src'));return url.origin==='https://gsfappstorage.blob.core.windows.net'?url.pathname.match(/^\/catalogue-assets\/Brands\/([a-z0-9_-]{1,60})\.(?:svg|png|webp)$/i)?.[1]||'':'';}catch{return '';}}).filter(Boolean);
   const brands=[...new Set(logos)];
   const brand=brands.length===1?brands[0].replace(/[_-]/g,' '):[...card.querySelectorAll('img[alt]')].map(i=>i.getAttribute('alt')).filter(Boolean).join(' ').slice(0,80);
   options.push({selector:selector(card),pricePence:price,description:m[4],grade:m[3],brand,selected,selectionControlPresent:radios.length>0,inStock:!/^Out Of Stock$/i.test(m[5])});
  }
  // Some catalogue titles are plain text rather than HTML headings. Use only
  // the unanimous description actually present on the priced alternatives.
  if(!descriptions.length)descriptions=[...new Set(options.map(o=>o.description))];
  const links=[...group.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')).filter(h=>/^(?:https:\/\/trade\.gsfcarparts\.com)?\/partdetails\//.test(h));
  const gradeLabel=n=>/^(?:Gold|Silver|Bronze)$/i.test(clean(text(n)));
  const gradeNodes=[...group.querySelectorAll('*')].filter(visible).filter(n=>gradeLabel(n)&&![...n.children].some(gradeLabel));
  const cardGrades=cards.map(card=>gradeNodes.filter(n=>card.contains(n)).length);
  let list=cards[0];
  while(list&&!cards.every(n=>list.contains(n)))list=list.parentElement;
  const listConfirmed=!!list&&list!==group&&!list.contains(sku);
  // A separate heading repeats an already-parsed card price. It is outside
  // the alternatives list and supplies neither another option nor selection
  // evidence. A decorative grade badge outside the cards is not another part.
  // A clearly labelled RRP is reference information, never a selectable price.
  // Every other price still needs an exact card or this single repeated heading.
  const summaries=listConfirmed?[...group.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).filter(n=>!list.contains(n)&&/^£\s*\d+(?:,\d{3})*\.\d{2}$/.test(clean(text(n)))&&options.some(o=>o.pricePence===Math.round(Number(clean(text(n)).replace(/[£,\s]/g,''))*100))):[];
  const rrpLabel=n=>/^RRP:\s*£\s*\d+(?:,\d{3})*\.\d{2}$/i.test(clean(text(n)));
  const interactive='a,button,input,select,textarea,[role="button"],[role="radio"],[role="option"],[role="checkbox"]';
  const references=[...group.querySelectorAll('*')].filter(visible).filter(n=>rrpLabel(n)&&![...n.children].some(rrpLabel)&&!cards.some(card=>card.contains(n))&&!n.closest(interactive)&&!n.querySelector(interactive));
  const priceCount=(text(group).match(/£\s*\d/g)||[]).length,parsedCount=options.length+unavailableCount;
  const cardGradesValid=cardGrades.length===parsedCount&&parsedCount>0&&cardGrades.every(count=>count===1),pricesAccounted=priceCount===parsedCount+summaries.length+references.length&&summaries.length<=1&&references.length<=1;
  const unparsedPriceNodes=[...group.querySelectorAll('*')].filter(visible).filter(n=>!n.closest('nav,aside,form')&&/£\s*\d/.test(clean(text(n)))&&![...n.children].some(c=>/£\s*\d/.test(clean(text(c))))&&!cards.some(card=>card.contains(n))&&!summaries.some(summary=>summary.contains(n))&&!references.some(reference=>reference.contains(n))).slice(0,20).map(n=>({tag:n.tagName.toLowerCase(),text:clean(text(n)).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]').replace(/https?:\/\/\S+/gi,'[link]').slice(0,200)}));
  const checks={priceCount,parsedCardCount:parsedCount,cardGradeCounts:cardGrades,decorativeGradeCount:gradeNodes.filter(n=>!cards.some(card=>card.contains(n))).length,summaryPriceCount:summaries.length,rrpPriceCount:references.length,cardGradesValid,pricesAccounted,listConfirmed,unparsedPriceNodes};
  groups.push({parsedAll:cardGradesValid&&pricesAccounted,checks,unavailableCount,summaryPriceCount:summaries.length,selector:selector(group),sku:clean(text(sku)).replace(/^SKU:\s*/i,''),description:descriptions.length===1?descriptions[0]:'',attributesSelector:attributes.length===1?selector(attributes[0]):'',options,links:[...new Set(links)]});
 }
 const moreSelectors=pagination.filter(n=>/^show more$/i.test(clean(text(n)))&&groups.some(g=>doc.querySelector(g.selector)?.contains(n))).map(selector);
 return {complete:!loading&&!pagination.length&&groups.length>0&&groups.length<=40&&groups.every(g=>g.parsedAll&&g.description&&(g.options.length||g.unavailableCount)),groups,moreSelectors};
}

function checkCataloguePage(page,category){
 const url=new URL(page.url());
 if(url.origin!=='https://trade.gsfcarparts.com'||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});
 if(observedCategory(url.href)!==category)reject('CATEGORY_REDIRECTED');
}
// Discovery already selected the vehicle. Keep that context and the category
// reached through GSF; the service-calibration flow clears/reselects it and can
// open an Attributes dialog, which is unnecessary for a general parts lookup.
export async function captureRepairCatalogue(page,registration,category,{attempts=75}={}){
 if(observedCategory(page.url())!==category)await page.goto('https://trade.gsfcarparts.com/parts/'+encodeURIComponent(encodeURIComponent(category)),{waitUntil:'domcontentloaded',timeout:15000});
 for(let i=0;i<attempts;i++){
  checkCataloguePage(page,category);
  const vehicle=await page.evaluate(readServiceCategory,{registration,category});
  if(vehicle.selectedRegistration&&vehicle.registration===registration)return vehicle;
  if(i+1<attempts)await page.waitForTimeout(200);
 }
 reject('VEHICLE_NOT_CONFIRMED');
}
export async function waitForRepairGroups(page,registration,category,{attempts=100}={}){
 let previous='',stable=0,expanded='',clicks=0;
 for(let i=0;i<attempts;i++){
  checkCataloguePage(page,category);
  const vehicle=await page.evaluate(readServiceCategory,{registration,category});
  if(!vehicle.selectedRegistration||vehicle.registration!==registration)reject('VEHICLE_CHANGED');
  const snapshot=await page.evaluate(readRepairGroups),signature=JSON.stringify(snapshot);
  if(snapshot.complete){stable=signature===previous?stable+1:1;if(stable>=4)return snapshot;}
  else stable=0;
  // Expand only observed product-group controls. Wait for a changed snapshot
  // before clicking again so a slow response cannot trigger repeated clicks.
  if(snapshot.moreSelectors?.length&&signature!==expanded){
   if(++clicks>40)reject('CATALOGUE_INCOMPLETE');
   await page.locator(snapshot.moreSelectors[0]).click({timeout:8000});expanded=signature;stable=0;
  }
  previous=signature;
  if(i+1<attempts)await page.waitForTimeout(200);
 }
 reject('CATALOGUE_INCOMPLETE');
}
function sameOption(a,b){return a.pricePence===b.pricePence&&a.description===b.description&&a.grade===b.grade&&a.brand===b.brand&&a.inStock===b.inStock;}
export function selectedRepairProduct(group,option){
 const matches=group?.options.filter(o=>sameOption(o,option)&&typeof o.inStock==='boolean')||[],chosen=group?.options.filter(o=>o.selected)||[];
 if(matches.length!==1)reject('SELECTED_OPTION_NOT_CONFIRMED');
 if(group.options.some(o=>o.selectionControlPresent||o.selected)){
  if(chosen.length!==1||!sameOption(chosen[0],option))reject('SELECTED_OPTION_NOT_CONFIRMED');
 }else if(!option.brand&&group.options.filter(o=>o.pricePence===option.pricePence&&o.description===option.description).length!==1)reject('SELECTED_PRODUCT_IDENTITY_AMBIGUOUS');
 const skuPattern=group.links.length?/^[A-Za-z0-9][A-Za-z0-9._/-]{1,99}$/:/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/;
 if(!skuPattern.test(group.sku||'')||group.sku.split('/').some(s=>!s||s==='.'||s==='..'))reject('SELECTED_PRODUCT_SKU_MISSING');
 if(group.links.length>1)reject('SELECTED_PRODUCT_LINK_AMBIGUOUS');
 const target={searchTerm:group.sku,...(group.links.length?{detailUrl:new URL(group.links[0],'https://trade.gsfcarparts.com').href}:{})};
 // Some cards use drawn circles rather than semantic radios. In that case the
 // click is not proof of selection: the observed SKU's fresh product details
 // must match the chosen brand when known, description, price, stock and VAT.
 // Without a readable logo, a unique price/description in this fitment group
 // identifies the card and the full observed SKU identifies the fresh product.
 // The product reader must supply its brand; never infer one from the SKU.
 return {...target,url:selectedProductUrl(target)};
}
export async function waitForSelectedRepairProduct(page,registration,category,group,option,{attempts=40}={}){
 let previous='',stable=0;
 for(let i=0;i<attempts;i++){
  checkCataloguePage(page,category);
  const vehicle=await page.evaluate(readServiceCategory,{registration,category});
  if(!vehicle.selectedRegistration||vehicle.registration!==registration)reject('VEHICLE_CHANGED');
  const snapshot=await page.evaluate(readRepairGroups),selected=snapshot.groups.find(g=>g.selector===group.selector);
  if(snapshot.complete&&selected){
   try{
    const target=selectedRepairProduct(selected,option),signature=JSON.stringify(selected);
    stable=signature===previous?stable+1:1;previous=signature;
    if(stable>=4)return {group:selected,target};
   }catch(error){if(error.detail!=='SELECTED_OPTION_NOT_CONFIRMED')throw error;stable=0;previous='';}
  }else{stable=0;previous='';}
  if(i+1<attempts)await page.waitForTimeout(200);
 }
 reject('SELECTED_OPTION_NOT_CONFIRMED');
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
export async function lookupGeneralGSF(page,request,{capture=captureRepairCatalogue,selectVehicle=selectCatalogueVehicle,now=Date.now}={}){
 const scope=repairScope.resolve(request.work);
 if(scope.status!=='SUPPORTED')reject('PART_NOT_RECOGNISED');
 const category=await discoverRepairCategory(page,scope.query,{request,now,selectVehicle});
 const vehicle=await capture(page,request.registration,category);
 if(vehicle.status!=='CAPTURED_FOR_REVIEW'||vehicle.registration!==request.registration||!vehicle.selectedRegistration||vehicle.truncated)reject('VEHICLE_NOT_CONFIRMED');
 let snapshot=await waitForRepairGroups(page,request.registration,category);
 const candidates=[];let matchingGroups=0;
 for(const group of snapshot.groups){
  if(!group.options.some(option=>request.flow||option.inStock))continue;
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
  for(const option of group.options.filter(o=>request.flow||o.inStock))candidates.push({group,option,rows,scope:candidateScope});
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
 await page.locator(option.selector).click({timeout:8000});
 const selected=await waitForSelectedRepairProduct(page,request.registration,category,group,option);
 const {searchTerm,url,...target}=selected.target;
 await openSelectedProduct(page,{...target,searchTerm});
 let product;
 for(let i=0;i<40;i++){try{product=await page.evaluate(readProductDialog,{allowUnavailablePrice:request.flow==='guided-v1'&&option.inStock===false});break;}catch{await page.waitForTimeout(200);}}
 const brandKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!product||typeof product.brand!=='string'||!product.brand.trim()||product.unitNetPence!==option.pricePence||product.description.toLowerCase()!==option.description.toLowerCase()||option.brand&&brandKey(product.brand)!==brandKey(option.brand)||product.inStock!==option.inStock||product.inStock&&!product.stock?.some(row=>row.quantity>=request.quantity)||product.vatBasis!=='EX_VAT'||!searchTerm.toUpperCase().endsWith(product.sku.toUpperCase()))reject('SELECTED_PRODUCT_CHANGED');
 return {vehicle:vehicle.visibleText.split(' Copy VIN')[0].slice(0,250),fitmentEvidence:'GSF registration '+request.registration+'; '+scope.label+'; catalogue position attributes checked',catalogueComplete:true,alternativesChecked:candidates.length,part:{source:'GSF',registration:request.registration,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description,costPence:product.unitNetPence,corePence:0,inStock:product.inStock,imageUrl:product.imageUrl,gsfUrl:url,checkedAt:new Date(now()).toISOString(),...(request.flow?{choiceId:request.choices.part}:{})}};
}

export function scopeForFitment(rows,scope){
 const position=rows.filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>r.value).join(' ').toLowerCase();
 const axis=[...new Set(position.match(/\b(front|rear)\b/g)||[])],sides=[...new Set(position.match(/\b(left|right)\b/g)||[])];
 const candidate=repairScope.scope(scope.part,scope.axle||(axis.length===1?axis[0]:''),scope.side||(sides.length===1?sides[0]:''),scope.quantity,scope.lookup);
 return candidate.status==='SUPPORTED'&&repairFitment(rows,candidate)?candidate:null;
}
export function gsfPartChoices(candidates,request,category){
 candidates.sort((a,b)=>Number(b.option.inStock)-Number(a.option.inStock)||a.option.pricePence-b.option.pricePence);
 return candidates.map(({group,option,rows,scope})=>({
  id:choiceId(request.registration,category,group.sku,group.description,option.description,option.brand,option.grade,option.pricePence,option.inStock,rows.map(r=>[r.attribute,r.value]).sort()),
  label:[option.brand,option.description,option.grade].filter(Boolean).join(' · '),
  detail:('GSF fitment group '+group.sku+' · '+rows.map(r=>r.attribute+': '+r.value).join(' · ')).slice(0,500),
  costPence:option.pricePence,inStock:option.inStock,work:scope.work
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
  const label=String(link.text||category).trim();if(!label||label.length>150||!/[a-z]/i.test(label))continue;
  const score=repairScope.words(label).filter(t=>terms.includes(t)).length;
  const work=repairScope.prefix(scope.lookup)+(scope.quantity!==1?scope.quantity+' ':'')+[scope.axle,scope.side,/^\d+$/.test(category)?label:category].filter(Boolean).join(' ');
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
 const beforeSearchUrl=page.url();
 await search.fill(query,{timeout:10000});
 let observed=[];
 async function find(){
  const current=observedCategory(page.url());if(categoryMatches(current,query))return [current];
  if(/^\d+$/.test(current)){
   const results=await page.evaluate(readCatalogueResults,{query});
   const labelled=labelledDestinationCategory(page.url(),beforeSearchUrl,query,results);if(labelled)return [labelled];
  }
  observed=await page.locator('a[href]').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&!n.closest('[hidden],[aria-hidden="true"]')).map(n=>({href:n.href,text:(n.innerText||n.textContent||'').trim()})));return matchingCatalogueCategories(observed,query);
 }
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
   const numericLabel=/^\d+$/.test(diagnostics.observedCategory)&&diagnostics.mainMatchingLabels.length===1?diagnostics.mainMatchingLabels[0]:'';
   if(numericLabel||diagnostics.observedCategory&&repairScope.words(diagnostics.observedCategory).some(w=>repairScope.words(query).includes(w))){
    const reached=new URL(page.url());reached.search='';reached.hash='';
    observed.push({href:reached.href,text:numericLabel||diagnostics.observedCategory});
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
