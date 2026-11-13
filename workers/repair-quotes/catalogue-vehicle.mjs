import {readServiceCategory} from '../gsf/service-capture.mjs';
const ORIGIN='https://trade.gsfcarparts.com';
const failure=(detail,observed)=>Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',supplier:'GSF',detail,observed});
function check(page){const url=new URL(page.url());if(url.origin!==ORIGIN||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});}

// The registration can render before the selected car's details. Wait for the
// observed More Details control in that same vehicle panel, with no loading
// indicator, rather than treating the first appearance of the plate as ready.
export function readCatalogueVehicleReadiness({registration},doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=n=>{for(let p=n;p&&p.nodeType===1;p=p.parentElement){const s=doc.defaultView?.getComputedStyle?.(p)||p.style;if(p.hidden||p.getAttribute('aria-hidden')==='true'||s&&(s.display==='none'||s.visibility==='hidden'))return false;}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&(!visible(n)||['SCRIPT','STYLE','INPUT','TEXTAREA','NAV','ASIDE','FORM'].includes(n.tagName))?'':[...n.childNodes].map(text).join(' ');
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);
 if(mains.length!==1)return {ready:false,detailsPresent:false,busy:false};
 const main=mains[0],panels=new Set();
 for(const clear of [...main.querySelectorAll('button')].filter(visible).filter(n=>clean(text(n))==='Clear')){
  for(let p=clear.parentElement,level=0;p&&p!==main&&level<5;p=p.parentElement,level++){
   const value=clean(text(p));
   const plate=[...p.querySelectorAll('*')].filter(visible).some(n=>!n.children.length&&clean(text(n)).toUpperCase().replace(/\s/g,'')===registration);
   const details=[...p.querySelectorAll('button,a')].filter(visible).some(n=>/^More Details$/i.test(clean(text(n))));
   if(plate&&details&&value.length<=650){panels.add(p);break;}
  }
 }
 const busy=[...main.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible)||/\b(?:loading|please wait|finding vehicle|searching vehicle)\b/i.test(clean(text(main)));
 const panel=panels.size===1?[...panels][0]:null;
 return {ready:!!panel&&!busy,detailsPresent:!!panel,busy,signature:panel?clean(text(panel)).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]'):''};
}

// Catalogue discovery needs the requested vehicle context. This uses the same
// visible registration controls as the service reader, before searching parts.
// A recent-vehicle card or a filled input is not selected-vehicle evidence.
export async function selectCatalogueVehicle(page,registration,{attempts=75}={}){
 check(page);
 const field=page.getByPlaceholder('ENTER REG / VIN',{exact:true});
 try{await field.waitFor({state:'visible',timeout:12000});}catch{check(page);throw failure('VEHICLE_SEARCH_UNAVAILABLE',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});}
 check(page);
 if(await field.count()!==1)throw failure('VEHICLE_SEARCH_AMBIGUOUS',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});
 const clear=page.getByRole('button',{name:'Clear',exact:true});
 if(await clear.count()>1)throw failure('VEHICLE_SELECTION_AMBIGUOUS',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false});
 if(await clear.count()===1&&await clear.isVisible())await clear.click({timeout:10000});
 check(page);await field.fill(registration,{timeout:10000});
 await page.getByRole('button',{name:'Search VRM Button',exact:true}).click({timeout:10000});
 let state,readiness,previous='',stable=0;
 for(let i=0;i<attempts;i++){
  check(page);
  try{state=await page.evaluate(readServiceCategory,{registration,category:'Catalogue search'});readiness=await page.evaluate(readCatalogueVehicleReadiness,{registration});}
  catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message||''))throw error;state=null;}
  if(state?.selectedRegistration===true&&state.registration===registration&&readiness?.ready){
   stable=readiness.signature===previous?stable+1:1;previous=readiness.signature;
   if(stable>=4)return {registration,selectedRegistration:true,detailsReady:true};
  }else{stable=0;previous='';}
  if(i+1<attempts)await page.waitForTimeout(200);
 }
 throw failure('VEHICLE_NOT_CONFIRMED_BEFORE_SEARCH',{stage:'GSF_VEHICLE_SELECTION',selectedRegistration:false,detailsPresent:readiness?.detailsPresent===true,busy:readiness?.busy===true,reason:state?.reason||'SELECTION_NOT_READY'});
}
