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
   const alreadyOpen=await heading.evaluate(el=>el.getAttribute('aria-expanded')==='true');
   if(alreadyOpen){expanded.push(label);continue;}
   // The operation is read only. Never click + or Add to Cost Estimate.
   await heading.click({timeout:5000});await page.waitForTimeout(300);expanded.push(label);
  }
 }
 return expanded;
}
export async function openGSFCategoryResult(page,part,registration,{navigate=navigateGSFAlternator}={}){
 const label=discoveryTerms(part).gsfCategory;
 const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const accessibleName=new RegExp('^'+escaped+'(?:\\s+'+escaped+')?$','i');
 let clicked=false;
 for(const find of [()=>page.getByRole('button',{name:accessibleName}),()=>page.getByText(label,{exact:true})]){
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
export function readDiscoveryPage({registration,term,supplier='GSF'},doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const scrub=v=>clean(v).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]');
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&!visible(n)?'':[...n.childNodes].map(text).join(' ');
 const scope=supplier==='HAYNES'?doc.body:doc.querySelector('main,[role="main"]')||doc.body;
 if(!scope)return {ready:false};
 const nodes=[scope,...scope.querySelectorAll('*')].filter(el=>visible(el)&&!el.closest(supplier==='HAYNES'?'script,style':'nav,header,footer,[role="dialog"],[role="menu"],script,style'));
 const leaves=nodes.filter(el=>!el.children.length).map(el=>scrub(text(el))).filter(Boolean);
 const identities=nodes.filter(el=>clean(text(el)).replace(/\s/g,'').toUpperCase().includes(registration)&&clean(text(el)).length<260&&![...el.children].some(c=>clean(text(c)).replace(/\s/g,'').toUpperCase().includes(registration))).map(el=>scrub(text(el))).slice(0,4);
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1&&parts.length<48;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return parts.join(' > ');};
 const cards=nodes.filter(el=>{const t=clean(text(el));return t.length<900&&/£\s*\d/.test(t)&&/Local Branch|RDC|Branch Network|Out Of Stock/i.test(t)&&![...el.children].some(c=>/£\s*\d/.test(text(c))&&/Local Branch|RDC|Branch Network|Out Of Stock/i.test(text(c)));}).map(el=>({selector:selector(el),ancestors:(()=>{const rows=[];for(let n=el.parentElement,depth=1;n&&depth<=6;n=n.parentElement,depth++){const value=scrub(text(n));if(value.length>2500||n.tagName==='MAIN'||n.tagName==='BODY')break;rows.push({depth,selector:selector(n),text:value,buttons:[...n.querySelectorAll('button,[role="button"]')].map(b=>scrub(b.getAttribute('aria-label')||text(b))).filter(t=>!/(?:basket|buy|order|checkout)/i.test(t)).slice(0,8),images:[...n.querySelectorAll('img')].map(img=>{try{const u=new URL(img.src);return /gsf|catalogue/i.test(u.hostname)&&u.protocol==='https:'?u.origin+u.pathname:'';}catch{return '';}}).filter(Boolean).slice(0,6)});}return rows;})(),text:scrub(text(el)),parent:scrub(text(el.parentElement)).slice(0,1500),images:[...el.querySelectorAll('img')].map(img=>({alt:scrub(img.alt),src:(()=>{try{const u=new URL(img.src);return u.protocol==='https:'&&/gsf|catalogue/i.test(u.hostname)?u.origin+u.pathname:'';}catch{return '';}})()})).slice(0,6)}));
 const operationNodes=nodes.filter(el=>{const t=clean(text(el));return t.length<400&&/\b\d[A-Z0-9]{9,23}\b/.test(t)&&![...el.children].some(c=>/\b\d[A-Z0-9]{9,23}\b/.test(text(c)));});
 const jobs=operationNodes.map(el=>scrub(text(el.closest('li')||el.parentElement)).slice(0,900));
 const jobRows=operationNodes.slice(0,100).map(el=>{const ancestors=[];for(let n=el.parentElement,depth=1;n&&depth<=3;n=n.parentElement,depth++){const value=scrub(text(n));if(value.length>1800)break;ancestors.push({depth,text:value});}return {text:scrub(text(el)),ancestors};});
 const hiddenJobRows=supplier==='HAYNES'?[...scope.querySelectorAll('li,td,div')].filter(el=>{const t=clean(el.textContent);return !visible(el)&&t.length<650&&/\b\d[A-Z0-9]{9,23}\b/.test(t)&&/\b(?:Renew|Replace|Remove|Refit)\b/i.test(t)&&/\d{1,2}[.,]\d{2}/.test(t)&&![...el.children].some(c=>/\b\d[A-Z0-9]{9,23}\b/.test(c.textContent)&&/\b(?:Renew|Replace|Remove|Refit)\b/i.test(c.textContent)&&/\d{1,2}[.,]\d{2}/.test(c.textContent));}).slice(0,100).map(el=>({visible:false,text:scrub(el.textContent)})):[];
 const controls=[...scope.querySelectorAll('button,a,[role="button"]')].filter(visible).map(el=>scrub(el.getAttribute('aria-label')||text(el))).filter(t=>t&&t.length<100&&!/basket|buy|checkout|order|account/i.test(t)).slice(0,60);
 return {ready:true,registration,term,identities,unitHoursConfirmed:supplier==='HAYNES'&&/TOTAL\s*TIME\s*\(H\)|hours\s+and\s+hundredths\s+of\s+hours/i.test(doc.body?.textContent||''),headings:[...scope.querySelectorAll('h1,h2,h3,h4')].filter(visible).map(el=>scrub(text(el))).slice(0,30),cards:cards.slice(0,100),cardCount:cards.length,jobs:jobs.slice(0,100),jobRows,hiddenJobRows,controls,labels:leaves.filter(t=>t.length<100&&/SKU:|Show More|Show Less|products|results|Front|Rear|Left|Right|Brake|Filter|Alternator|Starter|Spring|Bearing|Clutch|Drive|Renew|Replace|Remove|Refit/i.test(t)).slice(0,120),truncated:cards.length>100||jobs.length>100,pricingApproved:false};
}
export async function settleGSFCapture(page,registration,term,{attempts=20}={}){
 let last='',stable=0,snapshot;
 for(let n=0;n<attempts;n++){
  snapshot=await page.evaluate(readDiscoveryPage,{registration,term});
  const signature=JSON.stringify([snapshot.identities,snapshot.cards]);
  stable=signature===last?stable+1:0;last=signature;
  if(snapshot.cardCount>0&&snapshot.identities?.some(t=>t.replace(/\s/g,'').includes(registration))&&stable>=1)return snapshot;
  await page.waitForTimeout(300);
 }
 return {...snapshot,captureIncomplete:true};
}
export async function captureHaynesFrames(page,registration,term){
 const frames=typeof page.frames==='function'?page.frames():[page],captures=[];
 for(const frame of frames){
  if(frame!==page&&typeof frame.url==='function'){try{if(new URL(frame.url()).origin!=='https://www.workshopdata.com')continue;}catch{continue;}}
  try{captures.push(await frame.evaluate(readDiscoveryPage,{registration,term,supplier:'HAYNES'}));}catch{}
 }
 if(!captures.length)throw Error('HAYNES_CAPTURE_UNAVAILABLE');
 const unique=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
 return {...captures[0],framesChecked:captures.length,unitHoursConfirmed:captures.some(c=>c.unitHoursConfirmed===true),jobs:unique(captures.flatMap(c=>c.jobs||[])),jobRows:unique(captures.flatMap(c=>c.jobRows||[])),hiddenJobRows:unique(captures.flatMap(c=>c.hiddenJobRows||[])),pricingApproved:false};
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
   captures.push({partId:part.id,status:'INSPECTED',categoryVerified:category.registrationSubmitted&&category.observed.selectedRegistration,url:new URL(page.url()).origin+new URL(page.url()).pathname,snapshot:await settleGSFCapture(page,registration,part.label)});
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
   captures.push({partId:part.id,status:'INSPECTED',searchSubmitted:true,submittedBy,expanded,snapshot:await captureHaynesFrames(page,registration,part.label)});
  }catch(error){const detail=/^HAYNES_SEARCH_CONTROL_(?:NOT_FOUND|AMBIGUOUS)$/.test(error.message)?error.message:undefined;captures.push({partId:part.id,status:error.message==='LOGIN_REQUIRED'?'LOGIN_REQUIRED':'INSPECTION_UNAVAILABLE',detail});if(error.message==='LOGIN_REQUIRED'||detail)break;}
 }
 return captures;
}
