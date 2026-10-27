import {navigateGSFAlternator} from './gsf-navigation.mjs';
// Read-only supplier inspection. No prices are approved and no orders are placed.
export const DISCOVERY_PARTS=Object.freeze([
 ['alternator','Alternator'],['starter-motor','Starter motor'],['battery','Battery'],
 ['brake-pads','Brake Pad Set'],['brake-discs','Brake Disc'],['brake-caliper','Brake Caliper'],
 ['coil-spring','Coil Spring'],['shock-absorber','Shock Absorber'],['suspension-arm','Suspension Arm'],
 ['track-rod-end','Track Rod End'],['wheel-bearing','Wheel Bearing'],['water-pump','Water Pump'],
 ['thermostat','Thermostat'],['radiator','Radiator'],['auxiliary-belt','Auxiliary Drive Belt'],
 ['clutch-kit','Clutch Kit'],['drive-shaft','Drive Shaft'],['oil-filter','Oil Filter'],
 ['air-filter','Air Filter'],['cabin-filter','Cabin Filter'],['fuel-filter','Fuel Filter']
].map(([id,label])=>Object.freeze({id,label})));
const TERMS={
 'alternator':['Alternator','Alternator',['Alternator','Ancillary drive belt']],
 'starter-motor':['Starter Motor','Starter motor',['Starter motor']],
 'battery':['Battery','Battery',['Battery']],
 'brake-pads':['Brake Pads','Brake pad',['Brake pad','Brake pads']],
 'brake-discs':['Brake Discs','Brake disc',['Brake disc']],
 'brake-caliper':['Brake Caliper','Brake caliper',['Brake caliper']],
 'coil-spring':['Coil Springs','Coil spring',['Coil spring']],
 'shock-absorber':['Shock Absorber','Shock absorber',['Shock absorber']],
 'suspension-arm':['Suspension Arm','Suspension arm',['Suspension wishbone arm','Control arm','Suspension link arm']],
 'track-rod-end':['Tie Rod End','Track rod',['Track rod']],
 'wheel-bearing':['Wheel Bearing','Wheel bearing',['Wheel bearing/wheel hub','Wheel hub assembly']],
 'water-pump':['Water Pump','Coolant pump',['Coolant pump','Water pump']],
 'thermostat':['Thermostat','Thermostat',['Thermostat']],
 'radiator':['Radiator','Radiator',['Radiator']],
 'auxiliary-belt':['Drive Belt','Ancillary drive belt',['Ancillary drive belt']],
 'clutch-kit':['Clutch Kit','Clutch',['Clutch']],
 'drive-shaft':['Driveshaft','Drive shaft',['Drive shaft s','Drive shafts','Drive shaft']],
 'oil-filter':['Oil Filter','Oil filter',['Oil filter']],
 'air-filter':['Air Filter','Air filter',['Air filter']],
 'cabin-filter':['Cabin Filter','Interior ventilation filter',['Interior ventilation filter','Cabin filter','Pollen filter']],
 'fuel-filter':['Fuel Filter','Fuel filter',['Fuel filter']]
};
export function discoveryTerms(part){const t=TERMS[part.id];if(!t)throw Error('UNKNOWN_PART_CATEGORY');return {gsfCategory:t[0],haynesSearch:t[1],haynesHeadings:t[2]};}
export async function expandHaynesSearchResults(page,headings){
 const expanded=[];
 for(const label of headings){
  const candidates=page.getByText(label,{exact:true});
  const count=await candidates.count();if(count>8)throw Error('HAYNES_GROUP_AMBIGUOUS');
  for(let i=0;i<count;i++){
   const heading=candidates.nth(i);if(!await heading.isVisible())continue;
   const alreadyOpen=await heading.evaluate(el=>{if(el.getAttribute('aria-expanded')==='true')return true;return [el.nextElementSibling,el.parentElement?.nextElementSibling].some(n=>n&&getComputedStyle(n).display!=='none'&&/\b\d[A-Z0-9]{9,23}\b/.test(n.innerText||''));});
   if(alreadyOpen){expanded.push(label);continue;}
   // The operation is read only. Never click + or Add to Cost Estimate.
   await heading.click({timeout:5000});await page.waitForTimeout(300);expanded.push(label);
  }
 }
 return expanded;
}
export async function openGSFCategoryResult(page,part,registration,{navigate=navigateGSFAlternator}={}){
 const label=discoveryTerms(part).gsfCategory;
 let clicked=false;
 for(const find of [()=>page.getByRole('button',{name:label,exact:true}),()=>page.getByText(label,{exact:true})]){
  const items=find(),visible=[];for(let i=0;i<await items.count();i++)if(await items.nth(i).isVisible())visible.push(items.nth(i));
  if(visible.length>1)throw Error('GSF_CATEGORY_AMBIGUOUS');
  if(visible.length===1){await visible[0].click({timeout:10000});clicked=true;break;}
 }
 if(!clicked)throw Error('GSF_CATEGORY_NOT_FOUND');
 await page.waitForURL(url=>url.origin==='https://trade.gsfcarparts.com'&&url.pathname.startsWith('/parts/'),{timeout:12000});
 // Use the URL observed after selecting the actual category, never a guessed slug.
 return navigate(page,registration,{categoryUrl:page.url(),anyPart:true});
}
// DOM only, bounded and scrubbed. Excludes input values, VINs and account areas.
export function readDiscoveryPage({registration,term},doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const scrub=v=>clean(v).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]');
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&!visible(n)?'':[...n.childNodes].map(text).join(' ');
 const scope=doc.querySelector('main,[role="main"]')||doc.querySelector('.repairTimes')||doc.body;
 if(!scope)return {ready:false};
 const nodes=[scope,...scope.querySelectorAll('*')].filter(el=>visible(el)&&!el.closest('nav,header,footer,[role="dialog"],[role="menu"],script,style'));
 const leaves=nodes.filter(el=>!el.children.length).map(el=>scrub(text(el))).filter(Boolean);
 const identities=nodes.filter(el=>clean(text(el)).replace(/\s/g,'').toUpperCase().includes(registration)&&clean(text(el)).length<260&&![...el.children].some(c=>clean(text(c)).replace(/\s/g,'').toUpperCase().includes(registration))).map(el=>scrub(text(el))).slice(0,4);
 const cards=nodes.filter(el=>{const t=clean(text(el));return t.length<900&&/£\s*\d/.test(t)&&/Local Branch|RDC|Branch Network|Out Of Stock/i.test(t)&&![...el.children].some(c=>/£\s*\d/.test(text(c))&&/Local Branch|RDC|Branch Network|Out Of Stock/i.test(text(c)));}).map(el=>({text:scrub(text(el)),parent:scrub(text(el.parentElement)).slice(0,1500),images:[...el.querySelectorAll('img')].map(img=>({alt:scrub(img.alt),src:(()=>{try{const u=new URL(img.src);return u.protocol==='https:'&&/gsf|catalogue/i.test(u.hostname)?u.origin+u.pathname:'';}catch{return '';}})()})).slice(0,6)}));
 const operationNodes=nodes.filter(el=>{const t=clean(text(el));return t.length<400&&/\b\d[A-Z0-9]{9,23}\b/.test(t)&&![...el.children].some(c=>/\b\d[A-Z0-9]{9,23}\b/.test(text(c)));});
 const jobs=operationNodes.map(el=>scrub(text(el.closest('li')||el.parentElement)).slice(0,900));
 const jobRows=operationNodes.slice(0,100).map(el=>{const ancestors=[];for(let n=el.parentElement,depth=1;n&&depth<=3;n=n.parentElement,depth++){const value=scrub(text(n));if(value.length>1800)break;ancestors.push({depth,text:value});}return {text:scrub(text(el)),ancestors};});
 const controls=[...scope.querySelectorAll('button,a,[role="button"]')].filter(visible).map(el=>scrub(el.getAttribute('aria-label')||text(el))).filter(t=>t&&t.length<100&&!/basket|buy|checkout|order|account/i.test(t)).slice(0,60);
 return {ready:true,registration,term,identities,headings:[...scope.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(el=>scrub(text(el))).slice(0,30),cards:cards.slice(0,100),cardCount:cards.length,jobs:jobs.slice(0,100),jobRows,controls,labels:leaves.filter(t=>t.length<100&&/SKU:|Show More|Show Less|products|results|Front|Rear|Left|Right|Brake|Filter|Alternator|Starter|Spring|Bearing|Clutch|Drive|Renew|Replace|Remove|Refit/i.test(t)).slice(0,120),truncated:cards.length>100||jobs.length>100,pricingApproved:false};
}
export async function discoverGSFParts(page,registration,{log=()=>{},parts=DISCOVERY_PARTS,openCategory=openGSFCategoryResult}={}){
 const captures=[];
 for(const part of parts){
  log('GSF: inspecting '+part.label);
  try{
   const search=page.getByPlaceholder("Search for OE (cross ref), aftermarket or categories like 'Air filter'",{exact:true});
   await search.fill(part.label);await search.press('Enter');
   await page.getByText('Search Results for \"'+part.label+'\"',{exact:true}).waitFor({state:'visible',timeout:15000});
   if(new URL(page.url()).origin!=='https://trade.gsfcarparts.com')throw Error('LOGIN_REQUIRED');
   const category=await openCategory(page,part,registration);
   // Expand visible alternative groups, with a bounded number of actions.
   for(let n=0;n<15;n++){
    const more=page.getByText('Show More',{exact:true});let opened=false;
    for(let i=0;i<await more.count();i++)if(await more.nth(i).isVisible()){await more.nth(i).click();await page.waitForTimeout(250);opened=true;break;}
    if(!opened)break;
   }
   captures.push({partId:part.id,status:'INSPECTED',categoryVerified:category.registrationSubmitted&&category.observed.selectedRegistration,url:new URL(page.url()).origin+new URL(page.url()).pathname,snapshot:await page.evaluate(readDiscoveryPage,{registration,term:part.label})});
  }catch(error){captures.push({partId:part.id,status:error.message==='LOGIN_REQUIRED'?'LOGIN_REQUIRED':'INSPECTION_UNAVAILABLE',detail:/^[A-Z_]{3,80}$/.test(error.detail||error.message)?error.detail||error.message:undefined});if(error.message==='LOGIN_REQUIRED')break;}
 }
 return captures;
}
// Haynes renders Search as a styled link on some WorkshopData versions.
// Scope to the search field's surrounding rows so the top navigation Search
// and Add to Cost Estimate controls can never be mistaken for this action.
export async function submitHaynesJobSearch(page,field){
 let scope=field;
 for(let depth=0;depth<4;depth++){
  scope=scope.locator('..');
  const strategies=[['button',()=>scope.getByRole('button',{name:'Search',exact:true})],['text',()=>scope.getByText('Search',{exact:true})],['input',()=>scope.locator('input[type="submit"][value="Search"],input[type="button"][value="Search"]')]];
  for(const [kind,find] of strategies){
   const matches=find(),visible=[];
   for(let i=0;i<await matches.count();i++)if(await matches.nth(i).isVisible())visible.push(matches.nth(i));
   if(visible.length>1)throw Error('HAYNES_SEARCH_CONTROL_AMBIGUOUS');
   if(visible.length===1){await visible[0].click({timeout:10000});return kind;}
  }
 }
 throw Error('HAYNES_SEARCH_CONTROL_NOT_FOUND');
}
export async function discoverHaynesJobs(page,registration,{log=()=>{},parts=DISCOVERY_PARTS}={}){
 const captures=[];
 for(const part of parts){
  log('Haynes: inspecting '+part.label);
  try{
   const field=page.getByPlaceholder('Search job',{exact:true});await field.fill(discoveryTerms(part).haynesSearch);
   const submittedBy=await submitHaynesJobSearch(page,field);await page.waitForTimeout(1000);
   const expanded=await expandHaynesSearchResults(page,discoveryTerms(part).haynesHeadings);
   if(await page.locator('input[type="password"]').count())throw Error('LOGIN_REQUIRED');
   captures.push({partId:part.id,status:'INSPECTED',searchSubmitted:true,submittedBy,expanded,snapshot:await page.evaluate(readDiscoveryPage,{registration,term:part.label})});
  }catch(error){const detail=/^HAYNES_SEARCH_CONTROL_(?:NOT_FOUND|AMBIGUOUS)$/.test(error.message)?error.message:undefined;captures.push({partId:part.id,status:error.message==='LOGIN_REQUIRED'?'LOGIN_REQUIRED':'INSPECTION_UNAVAILABLE',detail});if(error.message==='LOGIN_REQUIRED'||detail)break;}
 }
 return captures;
}
