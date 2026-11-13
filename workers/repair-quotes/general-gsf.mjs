import {readServiceCategory,readServiceAttributes} from '../gsf/service-capture.mjs';
import {readProductDialog,openSelectedProduct,selectedProductUrl} from '../gsf/product-dialog.mjs';
import {repairScope} from '../../lib/repair-quote.js';
import {choiceId,requireChoice} from './choice-result.mjs';
import {findCatalogueSearch} from './catalogue-search.mjs';
import {selectCatalogueVehicle} from './catalogue-vehicle.mjs';
import {observedCategory,categoryMatches,labelledDestinationCategory,readCatalogueResults,followExactCategorySuggestion,suggestedCategoryChoices,categoryChoiceId} from './catalogue-results.mjs';
import {readSearchProductFitment,searchProductPositions} from './catalogue-products.mjs';
const reject=(detail,observed)=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail,...(observed?{observed}:{})});};
const searchedProductEvidence=(product,category)=>({stage:'GSF_SEARCH_PRODUCT_VEHICLE_CHECK',category,selectedProduct:{sku:product.sku,brand:product.brand,description:product.description,unitNetPence:product.unitNetPence,inStock:product.inStock}});

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
export function repairFitment(rows,scope,{allowAlternatives=false}={}){
 const positions=(rows||[]).filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>searchProductPositions(r.value));
 if(!scope.axle&&positions.some(p=>p.axles.length)||!scope.side&&positions.some(p=>p.sides.length))return false;
 // Each Fitting Position row is an allowed location. Keep its axle and side
 // together: Front LH plus Rear RH must never become Front RH.
 if(allowAlternatives){
  if((scope.axle||scope.side)&&!positions.some(p=>(!scope.axle||p.axles.includes(scope.axle))&&(!scope.side||p.sides.includes(scope.side))))return false;
 }else{
  if(scope.axle&&(!positions.some(p=>p.axles.includes(scope.axle))||positions.some(p=>p.axles.includes(scope.axle==='front'?'rear':'front'))))return false;
  if(scope.side&&(!positions.some(p=>p.sides.includes(scope.side))||positions.some(p=>p.sides.includes(scope.side==='left'?'right':'left'))))return false;
 }
 // A set of pads is one axle set; a pair of discs requires two individually
 // priced discs. Ambiguous pack sizes must not silently double/halve a price.
 const pack=(rows||[]).filter(r=>/^(?:quantity per pack|pack quantity|pack size)$/i.test(r.attribute));
 if(scope.quantity>1&&pack.length!==1)return false;
 if(pack.some(r=>!/^1$/.test(String(r.value))))return false;
 return true;
}
export async function lookupGeneralGSF(page,request,{capture=captureRepairCatalogue,selectVehicle=selectCatalogueVehicle,now=Date.now,onProgress=()=>{}}={}){
 const scope=repairScope.resolve(request.work);
 if(scope.status!=='SUPPORTED')reject('PART_NOT_RECOGNISED');
 let category=await discoverRepairCategory(page,scope.query,{request,now,selectVehicle,onProgress}),searchProduct;
 if(typeof category==='object'&&category.kind==='search-product'){
  const selected=category;
  onProgress('GSF_PRODUCT_FITMENT');
  try{return await lookupSearchProduct(page,request,selected,{now});}
  catch(error){if(error.detail!=='SEARCH_PRODUCT_FITMENT_NOT_CONFIRMED')throw error;}
  // Product dialogs can hide the selected-vehicle panel and need not contain
  // a literal compatibility sentence. Verify the SKU in the vehicle catalogue.
  onProgress('GSF_VEHICLE_CATEGORY');
  category=await searchProductVehicleCategory(page,request,selected,{selectVehicle});
  searchProduct=selected.productDetails;
 }
 onProgress('GSF_CATALOGUE');
 const vehicle=await capture(page,request.registration,category);
 if(vehicle.status!=='CAPTURED_FOR_REVIEW'||vehicle.registration!==request.registration||!vehicle.selectedRegistration||vehicle.truncated)reject('VEHICLE_NOT_CONFIRMED');
 onProgress('GSF_CATEGORY_VEHICLE_CONFIRMED',{registration:request.registration,category});
 let snapshot=await waitForRepairGroups(page,request.registration,category);
 let groups=snapshot.groups;
 const selectedProductOption=option=>!searchProduct||option.description.toLowerCase()===searchProduct.description.toLowerCase()&&(!option.brand||option.brand.toLowerCase().replace(/[^a-z0-9]/g,'')===searchProduct.brand.toLowerCase().replace(/[^a-z0-9]/g,''));
 if(searchProduct){
  groups=groups.filter(g=>g.options.some(selectedProductOption));
  const sameSku=groups.filter(g=>g.sku.toUpperCase().endsWith(searchProduct.sku.toUpperCase()));
  if(sameSku.length)groups=sameSku;
 }
 const candidates=[];let matchingGroups=0,groupNumber=0;
 for(const group of groups){
  groupNumber++;
  if(!group.options.some(option=>request.flow||option.inStock))continue;
  if(!request.flow&&!repairScope.matchesDescription(group.description,scope.query))reject('WRONG_CATEGORY_PRODUCT');
  let rows=[];
  if(group.attributesSelector||scope.axle||scope.side||request.quantity>1){
   if(!group.attributesSelector)reject('POSITION_ATTRIBUTES_MISSING');
   onProgress('GSF_ATTRIBUTES',{group:groupNumber,total:groups.length});
   await page.locator(group.attributesSelector).click({timeout:8000});
   let attributes;
   for(let attempt=0;attempt<25;attempt++){attributes=await page.evaluate(readServiceAttributes);if(attributes.status==='ATTRIBUTES_CAPTURED')break;await page.waitForTimeout(200);}
   await page.keyboard.press('Escape');
   if(attributes?.status!=='ATTRIBUTES_CAPTURED')reject('POSITION_ATTRIBUTES_MISSING');rows=attributes.rows;
   if(!repairFitment(rows,scope)&&!request.flow)continue;
  }
  const scopes=request.flow?scopesForFitment(rows,scope):[scope];
  if(!scopes.length)continue;
  matchingGroups++;
  for(const option of group.options.filter(o=>request.flow||o.inStock)){
   if(!selectedProductOption(option))continue;
   for(const candidateScope of scopes)candidates.push({group,option,rows,scope:candidateScope});
  }
 }
 if(searchProduct){
  const sameSku=candidates.filter(c=>c.group.sku.toUpperCase().endsWith(searchProduct.sku.toUpperCase()));
  if(sameSku.length)candidates.splice(0,candidates.length,...sameSku);
  if(!candidates.length)reject('SEARCH_PRODUCT_NOT_LISTED_FOR_VEHICLE',searchedProductEvidence(searchProduct,category));
 }
 if(!request.flow&&matchingGroups>1)reject('MULTIPLE_FITMENT_VARIANTS');
 if(request.flow){
  onProgress('GSF_PART_CHOICES',{count:candidates.length});
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
 onProgress('GSF_FINAL_PRODUCT');
 await page.locator(option.selector).click({timeout:8000});
 const selected=await waitForSelectedRepairProduct(page,request.registration,category,group,option);
 const {searchTerm,url,...target}=selected.target;
 await openSelectedProduct(page,{...target,searchTerm});
 let product;
 for(let i=0;i<40;i++){try{product=await page.evaluate(readProductDialog,{allowUnavailablePrice:request.flow==='guided-v1'&&option.inStock===false});break;}catch{await page.waitForTimeout(200);}}
 const brandKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!product||typeof product.brand!=='string'||!product.brand.trim()||product.unitNetPence!==option.pricePence||product.description.toLowerCase()!==option.description.toLowerCase()||option.brand&&brandKey(product.brand)!==brandKey(option.brand)||product.inStock!==option.inStock||product.inStock&&!product.stock?.some(row=>row.quantity>=request.quantity)||product.vatBasis!=='EX_VAT'||!searchTerm.toUpperCase().endsWith(product.sku.toUpperCase()))reject('SELECTED_PRODUCT_CHANGED');
 if(searchProduct&&(product.sku.toUpperCase()!==searchProduct.sku.toUpperCase()||brandKey(product.brand)!==brandKey(searchProduct.brand)))reject('SEARCH_PRODUCT_NOT_LISTED_FOR_VEHICLE',searchedProductEvidence(searchProduct,category));
 return {vehicle:vehicle.visibleText.split(' Copy VIN')[0].slice(0,250),fitmentEvidence:'GSF registration '+request.registration+'; '+scope.label+'; catalogue position attributes checked',catalogueComplete:true,alternativesChecked:candidates.length,part:{source:'GSF',registration:request.registration,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description,costPence:product.unitNetPence,corePence:0,inStock:product.inStock,imageUrl:product.imageUrl,gsfUrl:url,checkedAt:new Date(now()).toISOString(),...(request.flow?{choiceId:request.choices.part}:{})}};
}

export function scopeForFitment(rows,scope){
 const position=searchProductPositions(rows.filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>r.value).join(' '));
 const axis=position.axles,sides=position.sides;
 const candidate=repairScope.scope(scope.part,scope.axle||(axis.length===1?axis[0]:''),scope.side||(sides.length===1?sides[0]:''),scope.quantity,scope.lookup);
 return candidate.status==='SUPPORTED'&&repairFitment(rows,candidate,{allowAlternatives:true})?candidate:null;
}
export function scopesForFitment(rows,scope){
 const positions=rows.filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>searchProductPositions(r.value));
 if(!positions.length)positions.push({axles:[],sides:[]});
 const found=new Map();
 for(const p of positions){
  const axles=scope.axle?[scope.axle]:p.axles.length?p.axles:[''],sides=scope.side?[scope.side]:p.sides.length?p.sides:[''];
  for(const axle of axles)for(const side of sides){
   const candidate=repairScope.scope(scope.part,axle,side,scope.quantity,scope.lookup);
   if(candidate.status==='SUPPORTED'&&repairFitment(rows,candidate,{allowAlternatives:true}))found.set(candidate.work,candidate);
  }
 }
 return [...found.values()];
}
export function gsfPartChoices(candidates,request,category){
 candidates.sort((a,b)=>Number(b.option.inStock)-Number(a.option.inStock)||a.option.pricePence-b.option.pricePence);
 return candidates.map(({group,option,rows,scope})=>({
  id:choiceId(request.registration,category,group.sku,group.description,option.description,option.brand,option.grade,option.pricePence,option.inStock,rows.map(r=>[r.attribute,r.value]).sort(),scope.axle,scope.side),
  label:[option.brand,option.description,option.grade].filter(Boolean).join(' · '),
  detail:([scope.axle,scope.side].filter(Boolean).join(' ')+' · GSF fitment group '+group.sku+' · '+rows.map(r=>r.attribute+': '+r.value).join(' · ')).slice(0,500),
  costPence:option.pricePence,inStock:option.inStock,work:scope.work
 }));
}

export async function lookupSearchProduct(page,request,selected,{now=Date.now}={}){
 const {product:card,productDetails:product,scope}=selected;
 const sameLabel=(a,b)=>String(a).toLowerCase().replace(/[^a-z0-9]/g,'')===String(b).toLowerCase().replace(/[^a-z0-9]/g,'');
 // The card price is only a navigation identity; the detail reader establishes
 // VAT, brand, SKU and price. Do not treat an isolated search-page £ value as net.
 if(!sameLabel(product.description,card.label)||card.sku&&!card.sku.toUpperCase().endsWith(product.sku.toUpperCase()))reject('SEARCH_PRODUCT_CHANGED');
 if(card.displayPricePence!==product.unitNetPence&&card.displayPricePence!==product.costIncVatPence)reject('SEARCH_PRODUCT_PRICE_CHANGED');
 const vehicle=await page.evaluate(readServiceCategory,{registration:request.registration,category:'Selected search product'});
 const fitment=await page.evaluate(readSearchProductFitment);
 if(!vehicle.selectedRegistration||vehicle.registration!==request.registration||!fitment.fitsSelectedVehicle)reject('SEARCH_PRODUCT_FITMENT_NOT_CONFIRMED');
 const positions=searchProductPositions(fitment.rows.filter(r=>/^fitting position$/i.test(r.attribute)).map(r=>r.value).join(' ')||product.description);
 if(scope.axle&&!positions.axles.includes(scope.axle)||scope.side&&!positions.sides.includes(scope.side))reject('SEARCH_PRODUCT_POSITION_REQUIRED');
 const pack=fitment.rows.filter(r=>/^(?:quantity per pack|pack quantity|pack size)$/i.test(r.attribute));
 if(request.quantity>1&&pack.length!==1||pack.some(r=>String(r.value)!=='1'))reject('SEARCH_PRODUCT_PACK_REQUIRED');
 if(product.inStock&&!product.stock?.some(row=>row.quantity>=request.quantity))reject('SELECTED_PRODUCT_CHANGED');
 const axes=scope.axle?[scope.axle]:positions.axles.length?positions.axles:[''],sides=scope.side?[scope.side]:positions.sides.length?positions.sides:[''];
 const options=[];
 for(const axle of axes)for(const side of sides){
  const fitted=repairScope.scope(scope.part,axle,side,scope.quantity,scope.lookup);if(fitted.status!=='SUPPORTED')continue;
  const positionRows=fitment.rows.some(r=>/^fitting position$/i.test(r.attribute))?fitment.rows:[...fitment.rows,{attribute:'Fitting Position',value:product.description}];
  if(!repairFitment(positionRows,fitted,{allowAlternatives:true}))continue;
  const id=choiceId(request.registration,'search-product',selected.choice.id,product.sku,product.brand,product.description,product.unitNetPence,product.inStock,fitment.rows,fitted.work);
  options.push({id,label:product.brand+' · '+product.description,detail:'SKU '+product.sku+' · '+fitted.label+' · GSF confirms this part fits the selected vehicle',costPence:product.unitNetPence,inStock:product.inStock,work:fitted.work});
 }
 const confirmed=options.find(o=>o.id===request.choices.part&&o.work===scope.work);
 if(!confirmed)requireChoice(request,'GSF_PART',options,{now});
 const url=new URL(page.url()),gsfUrl=url.origin==='https://trade.gsfcarparts.com'&&/^\/partdetails\/[a-z0-9._-]+$/i.test(url.pathname)&&!url.search&&!url.hash?url.href:'';
 return {vehicle:vehicle.visibleText.split(' Copy VIN')[0].slice(0,250),fitmentEvidence:'GSF selected registration '+request.registration+'; explicit product compatibility; '+scope.label,catalogueComplete:true,alternativesChecked:1,part:{source:'GSF',registration:request.registration,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description,costPence:product.unitNetPence,corePence:0,inStock:product.inStock,imageUrl:product.imageUrl,gsfUrl,checkedAt:new Date(now()).toISOString(),choiceId:confirmed.id}};
}

export function productVerificationCategory(results,query){
 const controls=results.controls||[],terms=repairScope.words(query),counts=new Map();
 for(const c of controls){const id=categoryChoiceId(c);counts.set(id,(counts.get(id)||0)+1);}
 const unique=controls.filter(c=>counts.get(categoryChoiceId(c))===1);
 const exact=unique.filter(c=>categoryMatches(c.label,query));
 if(exact.length)return exact.length===1?exact[0]:null;
 const related=unique.filter(c=>{const words=repairScope.words(c.label);return terms.length&&terms.every(t=>words.includes(t));});
 if(related.length)return related.length===1?related[0]:null;
 // A single actual related category is a place to verify the chosen SKU,
 // even when GSF calls it something else. This is navigation only: the final
 // catalogue product must still match its manufacturer number and brand.
 const supplied=controls.filter(c=>c.searchSuggestion===true);
 return supplied.length===1&&unique.includes(supplied[0])?supplied[0]:null;
}

export async function searchProductVehicleCategory(page,request,selected,{selectVehicle=selectCatalogueVehicle}={}){
 const {sku,brand,description,unitNetPence,inStock}=selected.productDetails;
 const observed={stage:'GSF_SEARCH_PRODUCT_VEHICLE_CHECK',selectedProduct:{sku,brand,description,unitNetPence,inStock}};
 const fail=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',supplier:'GSF',detail,observed});};
 let searchUrl;try{searchUrl=new URL(selected.searchUrl);}catch{fail('SEARCH_PRODUCT_RESULTS_URL_MISSING');}
 if(searchUrl.origin!=='https://trade.gsfcarparts.com'||searchUrl.username||searchUrl.password||!searchUrl.pathname.startsWith('/enhancedSearch/'))fail('SEARCH_PRODUCT_RESULTS_URL_MISSING');
 const check=()=>{const u=new URL(page.url());if(u.origin!==searchUrl.origin||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(u.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});};
 check();await page.keyboard.press('Escape');
 if(new URL(page.url()).pathname!==searchUrl.pathname)await page.goto(searchUrl.href,{waitUntil:'domcontentloaded',timeout:15000});
 let results;
 for(let i=0;i<15;i++){
  check();results=await page.evaluate(readCatalogueResults,{query:selected.scope.query});
  if(results.pageState?.visibleMainCount===1&&!results.pageState.busy&&!results.pageState.loadingMessage)break;
  // Some product overlays ignore Escape; reload only the actual results URL.
  if(i===4)await page.goto(searchUrl.href,{waitUntil:'domcontentloaded',timeout:15000});
  if(i<14)await page.waitForTimeout(200);
 }
 observed.categoryLabels=results?.controls?.map(c=>c.label).slice(0,30)||[];
 if(results?.pageState?.visibleMainCount!==1||results.pageState.busy||results.pageState.loadingMessage)fail('SEARCH_PRODUCT_RESULTS_NOT_RESTORED');
 const control=productVerificationCategory(results,selected.scope.query);
 if(!control)fail('SEARCH_PRODUCT_VEHICLE_CATEGORY_AMBIGUOUS');
 const followed=await followExactCategorySuggestion(page,control.label,categoryChoiceId(control),{searchQuery:selected.scope.query});
 if(!followed.category)fail('SEARCH_PRODUCT_VEHICLE_CATEGORY_NOT_OPEN');
 observed.category=followed.category;
 // Category pages carry the selected vehicle even when the global search and
 // product overlay do not. Restore the requested registration if necessary.
 for(let i=0;i<5;i++){
  check();const vehicle=await page.evaluate(readServiceCategory,{registration:request.registration,category:followed.category});
  if(vehicle.selectedRegistration&&vehicle.registration===request.registration)return followed.category;
  if(i<4)await page.waitForTimeout(200);
 }
 await selectVehicle(page,request.registration);
 return followed.category; // The normal catalogue capture verifies it again.
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
export async function discoverRepairCategory(page,query,{request,now=Date.now,selectVehicle=selectCatalogueVehicle,onProgress=()=>{}}={}){
 const origin='https://trade.gsfcarparts.com';
 onProgress('GSF_OPEN');
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:15000});
 const check=()=>{const url=new URL(page.url());if(url.origin!==origin||/^\/signin/.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});};check();
 let vehicle;
 if(request?.registration){onProgress('GSF_VEHICLE');vehicle=await selectVehicle(page,request.registration);onProgress('GSF_VEHICLE_READY',{registration:request.registration,detailsReady:vehicle?.detailsReady===true});}
 // GSF hydrates the catalogue after DOMContentLoaded. Wait for its actual
 // visible control; wording and text/search input roles can vary by layout.
 onProgress('GSF_SEARCH');
 const search=await findCatalogueSearch(page);
 const beforeSearchUrl=page.url();
 await search.fill(query,{timeout:10000});
 // Enhanced search is a broad catalogue. A selected registration does not
 // make its product cards vehicle-specific. Use it only to identify the part
 // category; actual product/position choices come from the vehicle catalogue.
 if(request?.flow)return discoverVehicleCategory(page,search,query,{request,now,beforeSearchUrl,onProgress,vehicle});
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
 for(let i=0;i<8;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}
 if(!categories.length){const suggestion=await followExactCategorySuggestion(page,query);if(suggestion.category)return suggestion.category;suggestionFollowed=suggestion.followed===true;}
 if(!categories.length&&!suggestionFollowed){await search.press('Enter',{timeout:10000});for(let i=0;i<75;i++){check();categories=await find();if(categories.length)break;await page.waitForTimeout(200);}}

 if(categories.length!==1)reject(categories.length?'MULTIPLE_CATALOGUE_CATEGORIES':'CATALOGUE_CATEGORY_NOT_FOUND');
 return categories[0];
}

async function discoverVehicleCategory(page,search,query,{request,now,beforeSearchUrl,onProgress,vehicle}){
 await search.press('Enter',{timeout:10000});onProgress('GSF_SEARCH_RESULTS');
 let results,previous='',stable=0;
 for(let i=0;i<75;i++){
  const url=new URL(page.url());
  if(url.origin!=='https://trade.gsfcarparts.com'||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});
  results=await page.evaluate(readCatalogueResults,{query});
  const current=observedCategory(url.href);
  if(current&&(categoryMatches(current,query)||labelledDestinationCategory(url.href,beforeSearchUrl,query,results)))return current;
  const controls=results.controls||[],signature=JSON.stringify(controls.map(c=>[c.label,c.path]));
  const ready=!results.pageState?.busy&&!results.pageState?.loadingMessage&&(controls.length||results.emptyMessages?.length);
  stable=ready&&signature===previous?stable+1:ready?1:0;previous=signature;
  if(stable>=4){
   const selected=request.choices?.gsfCategory;
   const matches=controls.filter(c=>selected?categoryChoiceId(c)===selected:categoryMatches(c.label,query));
   if(matches.length===1){
    onProgress('GSF_SELECTED_CATEGORY');
    const followed=await followExactCategorySuggestion(page,matches[0].label,categoryChoiceId(matches[0]),{searchQuery:query});
    if(!followed.category)reject('SELECTED_CATEGORY_NOT_OPEN',{stage:'GSF_SELECTED_CATEGORY',...followed.observed,pageType:new URL(page.url()).pathname.startsWith('/partdetails/')?'product':'other'});
    return followed.category;
   }
   break;
  }
  if(i<74)await page.waitForTimeout(200);
 }
 // Different terminology needs a part-type confirmation, never a list of
 // unverified manufacturer SKUs from the global search. Preserve free wording
 // when none of the supplier's categories applies.
 const controls=results?.controls||[],terms=repairScope.words(query);
 const matching=controls.filter(c=>terms.length&&terms.every(t=>repairScope.words(c.label).includes(t)));
 const options=suggestedCategoryChoices({...results,controls:matching.length?matching:controls},request);
 const reached=new URL(page.url()),current=observedCategory(reached.href),route=reached.pathname;
 const numericLabel=/^\d+$/.test(current)&&results?.mainMatchingLabels?.length===1?results.mainMatchingLabels[0]:'';
 if(numericLabel||current&&repairScope.words(current).some(w=>terms.includes(w))){
  reached.search='';reached.hash='';
  const found=catalogueCategoryOptions([{href:reached.href,text:numericLabel||current}],query,repairScope.resolve(request.work));
  options.push(...found.filter(o=>!options.some(existing=>existing.label===o.label)));
 }
 const currentVehicle=await page.evaluate(readServiceCategory,{registration:request.registration,category:'Catalogue search'});
 const observed={...results,stage:'GSF_VEHICLE_CATEGORY_DISCOVERY',globalProductsOffered:false,categoryLabels:controls.map(c=>c.label).slice(0,30),
  observedCategory:current,pageType:route.startsWith('/parts/')?'category':route.startsWith('/partdetails/')?'product':route.startsWith('/enhancedSearch/')?'search':route==='/'?'home':'other',
  vehicleConfirmedBeforeSearch:vehicle?.selectedRegistration===true,vehicleConfirmedAfterSearch:currentVehicle.selectedRegistration===true&&currentVehicle.registration===request.registration};
 try{requireChoice(request,'GSF_CATEGORY',options,{now,selectionKind:'wording'});}
 catch(error){error.observed=observed;throw error;}
}
