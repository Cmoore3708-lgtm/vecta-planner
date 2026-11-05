import {structuredRepairSelection,repairOperation} from '../../lib/repair-operation-catalogue.js';
import {readVehicle} from '../haynes/dom.mjs';
import {readProductDialog} from '../gsf/product-dialog.mjs';
import {repairTimesLink} from './haynes-navigation.mjs';
import {DISCOVERY_PARTS,discoveryTerms,openGSFCategoryResult,readDiscoveryPage,captureHaynesFrames,submitHaynesJobSearch,expandHaynesSearchResults} from './catalogue-discovery.mjs';
import {analyseStructuredGSF,normalPart} from './gsf-option-match.mjs';
import {matchHaynesReplacement} from './haynes-operation-match.mjs';
const GSF='https://trade.gsfcarparts.com',HAYNES='https://www.workshopdata.com';
const fail=(code,detail)=>{throw Object.assign(Error(code),{code,detail});};
const sameOrigin=(page,origin)=>{try{if(new URL(page.url()).origin!==origin)fail('LOGIN_REQUIRED');}catch(error){if(error.code)throw error;fail('LOGIN_REQUIRED');}};
export function readCatalogueBoundary(doc=document){
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;const s=typeof getComputedStyle==='function'?getComputedStyle(n):null;if(s&&(s.display==='none'||s.visibility==='hidden'))return false;}return true;};
 const scope=doc.querySelector('main,[role="main"]');if(!scope)return {loading:true};
 const nodes=[...scope.querySelectorAll('*')].filter(visible),clean=el=>String(el.textContent||'').trim().replace(/\s+/g,' ');
 const labels=nodes.filter(el=>!el.children.length).map(clean);
 const groupSkus=nodes.filter(el=>/^SKU:\s*\S+$/i.test(clean(el))&&![...el.children].some(c=>/^SKU:\s*\S+$/i.test(clean(c)))).map(el=>clean(el).replace(/^SKU:\s*/i,''));
 const paging=[...scope.querySelectorAll('button,a,[role="button"]')].filter(visible).map(el=>el.getAttribute('aria-label')||clean(el)).filter(t=>/^(?:next|previous|load more|(?:go to )?page\s+\d+|\d+)$/i.test(t));
 const view=doc.defaultView,root=doc.scrollingElement||doc.documentElement;
 const atBottom=!view||!Number.isFinite(view.innerHeight)||Math.ceil((view.scrollY||root.scrollTop||0)+view.innerHeight)>=root.scrollHeight-5;
 return {loading:nodes.some(el=>el.getAttribute('aria-busy')==='true'||el.getAttribute('role')==='progressbar'),showMore:labels.filter(t=>/^show more$/i.test(t)).length,paginationControls:paging,groupSkus:[...new Set(groupSkus)],atBottom};
}
export async function completeGSFCatalogue(page,registration,term){
 let last='',stable=0;
 for(let n=0;n<50;n++){
  sameOrigin(page,GSF);
  const more=page.getByText('Show More',{exact:true});let clicked=false;
  for(let i=0;i<await more.count();i++)if(await more.nth(i).isVisible()){await more.nth(i).click({timeout:5000});clicked=true;break;}
  await page.locator('body').press('End');await page.waitForTimeout(300);
  const snapshot=await page.evaluate(readDiscoveryPage,{registration,term}),boundary=await page.evaluate(readCatalogueBoundary);
  const signature=JSON.stringify([snapshot.cards,boundary]);stable=!clicked&&signature===last?stable+1:0;last=signature;
  if(stable>=3&&snapshot.cardCount>0&&!boundary.loading&&!boundary.showMore&&boundary.atBottom&&!boundary.paginationControls.length)return {...snapshot,boundary};
 }
 fail('REVIEW_REQUIRED','CATALOGUE_NOT_COMPLETE');
}
// Search results only identify the exact product to verify in Part Details.
export function readGSFSearchCards(doc=document){
 const textOf=node=>node.nodeType===3?node.textContent:[...node.childNodes].map(textOf).join(' ');
 const clean=el=>String(textOf(el)||'').replace(/\s+/g,' ').trim();
 const scope=doc.querySelector('main,[role="main"]');if(!scope)return [];
 const matches=[];
 for(const el of scope.querySelectorAll('div')){
  const t=clean(el);if(t.length>600||!/£\s*\d/.test(t)||!/\bIn stock\b/i.test(t))continue;
  if([...el.children].some(c=>/£\s*\d/.test(clean(c))&&/\bIn stock\b/i.test(clean(c))))continue;
  const m=t.match(/^([A-Z0-9][A-Z0-9._/-]{0,79})\s+(.+?)\s+£\s*(\d+(?:,\d{3})*)\.(\d{2})\s+In stock\b/i);if(!m)continue;
  matches.push({sku:m[1],description:m[2],costPence:Number(m[3].replaceAll(',',''))*100+Number(m[4])});
 }
 return [...new Map(matches.map(row=>[row.sku, row])).values()];
}
export async function verifyStructuredProduct(page,choice){
 const term=choice.groupSku;if(!/^[A-Z0-9._/-]{1,80}$/i.test(term))fail('REVIEW_REQUIRED','INVALID_GROUP_SKU');
 await page.goto(GSF+'/enhancedSearch/'+encodeURIComponent(term),{waitUntil:'domcontentloaded',timeout:15000});sameOrigin(page,GSF);
 await page.getByRole('heading',{name:'Search Results for "'+term+'"',exact:true}).waitFor({state:'visible',timeout:15000});
 const deadline=Date.now()+12000;let matches=[];
 while(Date.now()<deadline){matches=(await page.evaluate(readGSFSearchCards)).filter(row=>row.costPence===choice.costPence&&normalPart(row.description)===normalPart(choice.description));if(matches.length)break;await page.waitForTimeout(250);}
 if(matches.length!==1)fail('REVIEW_REQUIRED','EXACT_PRODUCT_NOT_UNIQUE');
 const match=matches[0],sku=page.getByRole('main').getByText(match.sku,{exact:true});if(await sku.count()!==1)fail('REVIEW_REQUIRED','EXACT_SKU_NOT_UNIQUE');await sku.click({timeout:10000});
 const details=page.getByRole('dialog',{name:'Part Details',exact:true});
 for(let n=0;n<48;n++){if(await details.count()===1&&await details.isVisible())break;if(new URL(page.url()).origin===GSF&&/^\/partdetails\//.test(new URL(page.url()).pathname))break;await page.waitForTimeout(250);}
 let product;
 for(let n=0;n<30;n++){try{product=await page.evaluate(readProductDialog);break;}catch(error){if(!['SETTINGS_REQUIRED','PRODUCT_DETAILS_NOT_OPEN'].includes(error.message))throw error;await page.waitForTimeout(200);}}
 if(!product||product.sku!==match.sku||normalPart(product.brand)!==normalPart(choice.brand)||normalPart(product.description)!==normalPart(choice.description)||product.unitNetPence!==choice.costPence||!product.stock.some(row=>row.quantity>=choice.packsRequired))fail('REVIEW_REQUIRED','PRODUCT_CHANGED_OR_QUANTITY_UNAVAILABLE');
 return {...product,gsfUrl:page.url(),totalCostPence:choice.totalCostPence};
}
export async function findHaynesVehicle(page,registration){
 await page.goto(HAYNES+'/touch/site/layout/makesOverview',{waitUntil:'domcontentloaded',timeout:15000});sameOrigin(page,HAYNES);
 if(await page.locator('input[type="password"]').count())fail('LOGIN_REQUIRED');
 const field=page.locator('#numberPlate,input[name="numberPlate"]');await field.fill(registration,{timeout:10000});await page.locator('#licencePlateBtn').click({timeout:10000});
 let vehicle;
 for(let n=0;n<60;n++){sameOrigin(page,HAYNES);try{vehicle=await page.evaluate(readVehicle);}catch{}if(vehicle?.login)fail('LOGIN_REQUIRED');if(vehicle?.registration===registration)break;await page.waitForTimeout(200);}
 if(!vehicle||vehicle.registration!==registration||vehicle.ambiguous||vehicle.blocked||!/^t_\d+$/.test(vehicle.typeId||'')||!vehicle.make||!vehicle.model||!vehicle.variant)fail('LABOUR_REVIEW_REQUIRED','VEHICLE_VARIANT_NOT_CONFIRMED');
 return vehicle;
}
export async function readStructuredHaynes(page,request,selection){
 const vehicle=await findHaynesVehicle(page,request.registration),part=DISCOVERY_PARTS.find(p=>p.id===selection.partId),terms=discoveryTerms(part),definition=repairOperation(selection.partId);
 const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href));await page.goto(repairTimesLink(links,vehicle.typeId),{waitUntil:'domcontentloaded',timeout:15000});
 const field=page.getByPlaceholder('Search job',{exact:true});await field.fill(terms.haynesSearch);await submitHaynesJobSearch(page,field);await page.waitForTimeout(500);
 const section=selection.axle==='rear'&&definition.section==='Front suspension'?'Rear suspension':definition.section;
 const tabs=page.getByText(section,{exact:true}),visible=[];for(let i=0;i<await tabs.count();i++)if(await tabs.nth(i).isVisible())visible.push(tabs.nth(i));
 if(visible.length===1){await visible[0].click({timeout:5000});await page.waitForTimeout(300);}else if(visible.length>2)fail('LABOUR_REVIEW_REQUIRED','REPAIR_SECTION_AMBIGUOUS');
 await expandHaynesSearchResults(page,terms.haynesHeadings);
 sameOrigin(page,HAYNES);if(new URL(page.url()).searchParams.get('typeId')!==vehicle.typeId)fail('LABOUR_REVIEW_REQUIRED','VEHICLE_CHANGED');
 const operation=matchHaynesReplacement(await captureHaynesFrames(page,request.registration,part.label),selection);
 return {vehicle,operation};
}
export async function lookupStructuredRepair({gsfPage,haynesPage},request,{now=Date.now}={}){
 const selection=structuredRepairSelection(request.selection),part=DISCOVERY_PARTS.find(p=>p.id===selection.partId);
 let stage='GSF_CATEGORY_SEARCH';
 try{
 await gsfPage.goto(GSF,{waitUntil:'domcontentloaded',timeout:15000});sameOrigin(gsfPage,GSF);
 const search=gsfPage.getByPlaceholder("Search for OE (cross ref), aftermarket or categories like 'Air filter'",{exact:true});await search.fill(part.label);await search.press('Enter');
 await gsfPage.getByText('Search Results for "'+part.label+'"',{exact:true}).waitFor({state:'visible',timeout:15000});
 stage='GSF_VEHICLE_FILTER';await openGSFCategoryResult(gsfPage,part,request.registration);
 stage='GSF_COMPLETE_CATALOGUE';
 const snapshot=await completeGSFCatalogue(gsfPage,request.registration,part.label),analysis=analyseStructuredGSF(snapshot,selection);
 stage='GSF_PRODUCT_DETAILS';
 const product=await verifyStructuredProduct(gsfPage,analysis.selected),gsfCheckedAt=new Date(now()).toISOString();
 stage='HAYNES_REPLACEMENT_OPERATION';
 const {vehicle,operation}=await readStructuredHaynes(haynesPage,request,selection),checkedAt=new Date(now()).toISOString();
 const variant=[vehicle.make,vehicle.model,vehicle.variant].join(' ');
 return {request,variant,fitmentEvidence:'Fresh GSF category registration filter and independently confirmed Haynes registration '+request.registration,catalogueComplete:true,checkedAt,parts:[{source:'GSF',registration:request.registration,variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:product.sku,brand:product.brand,description:product.description+(selection.quantity>1?' · '+selection.quantity+' required':''),costPence:product.totalCostPence,unitCostPence:product.unitNetPence,packsRequired:analysis.selected.packsRequired,unitsPerPack:analysis.selected.packQuantity,corePence:0,inStock:true,imageUrl:product.imageUrl,gsfUrl:product.gsfUrl,checkedAt:gsfCheckedAt}],labour:{source:'HAYNES_PRO',registration:request.registration,variant,operation:request.operation,...operation,checkedAt},alternativesChecked:analysis.optionsChecked};
 }catch(error){error.stage||=stage;throw error;}
}
