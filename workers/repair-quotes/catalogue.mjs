import {navigateHaynesRepair} from './haynes-navigation.mjs';
import {readAlternatorTime} from './repair-time-reader.mjs';
import {repairRequest,cleanRepairEvidence} from '../../lib/repair-quote.js';
export const GSF_ORIGIN='https://trade.gsfcarparts.com';
function fail(code){throw Object.assign(Error(code),{code});}
export function parsePence(value){
 const m=String(value||'').trim().match(/^£\s*(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})$/);
 if(!m)fail('REVIEW_REQUIRED');const n=Number(m[1].replaceAll(',',''))*100+Number(m[2]);if(!Number.isSafeInteger(n)||n>10000000)fail('REVIEW_REQUIRED');return n;
}
export function parseHours(value,unit){
 if(!/^hours?$/i.test(String(unit).trim())||!/^\d{1,3}(?:\.\d{1,3})?$/.test(String(value).trim()))fail('LABOUR_REVIEW_REQUIRED');
 const n=Math.round(Number(value)*1000);if(n<1||n>100000)fail('LABOUR_REVIEW_REQUIRED');return n;
}
export function reviewedMapping(config,request,now=Date.now()){
 if(config?.calibrationApproved!==true||!Array.isArray(config.vehicles))fail('SETTINGS_REQUIRED');
 const matches=config.vehicles.filter(v=>v.registration===request.registration);
 if(matches.length!==1)fail('REVIEW_REQUIRED');const m=matches[0],date=Date.parse(m.reviewedAt);
 if(m.approved!==true||!m.variant||!m.fitmentEvidence||!m.gsfIdentity||!m.haynesIdentity||!m.haynesOperationId||!m.haynesOperationLabel||!Number.isFinite(date)||date>now||now-date>30*86400000)fail('REVIEW_REQUIRED');
 return m;
}
const normal=s=>String(s).trim().replace(/\s+/g,' ').toUpperCase();
async function unique(loc,code='REVIEW_REQUIRED'){
 if(await loc.count()!==1||!await loc.isVisible())fail(code);return loc;
}
async function read(root,selector,code){if(!selector)fail('SETTINGS_REQUIRED');return (await (await unique(root.locator(selector),code)).innerText()).trim();}
function safeURL(value,origin){const u=new URL(value);if(u.origin!==origin||u.username||u.password||u.hash)fail('SETTINGS_REQUIRED');return u.href;}
async function checkOrigin(page,origin){if(new URL(page.url()).origin!==origin)fail('LOGIN_REQUIRED');if(/login|sign-?in/i.test(new URL(page.url()).pathname))fail('LOGIN_REQUIRED');}
async function navigate(page,config,request,origin){
 await page.goto(safeURL(config.startUrl,origin),{waitUntil:'domcontentloaded',timeout:15000});await checkOrigin(page,origin);
 if(!config.registrationInput||!config.registrationSubmit)fail('SETTINGS_REQUIRED');
 await (await unique(page.locator(config.registrationInput))).fill(request.registration);
 await (await unique(page.locator(config.registrationSubmit))).click({timeout:10000});
 for(const selector of config.navigation||[]){
  // Reviewed configuration can navigate catalogue/repair menus, never purchase.
  if(/basket|checkout|order|buy|cart|delete|remove-account/i.test(selector))fail('SETTINGS_REQUIRED');
  const loc=page.locator(selector);await loc.waitFor({state:'visible',timeout:10000});await (await unique(loc)).click({timeout:10000});
 }
 if(config.searchInput){await (await unique(page.locator(config.searchInput))).fill('alternator');await (await unique(page.locator(config.searchInput))).press('Enter');}
 await checkOrigin(page,origin);
 if(config.ready){await page.locator(config.ready).waitFor({state:'visible',timeout:15000});}
}
// Vehicle identity is checked by the caller before reading any operation.
export async function readReviewedHaynesOperation(page,mapping,origin){
 const captures=[];
 for(const frame of page.frames()){
  let url;try{url=new URL(frame.url());}catch{continue;}
  if(url.origin!==origin)continue;
  try{captures.push(await frame.evaluate(readAlternatorTime));}
  catch(error){
   // A frame containing conflicting operations must never be silently skipped.
   if(/MULTIPLE_TIMES|MULTIPLE_PRICED_OPERATIONS/.test(error.message||''))fail('LABOUR_REVIEW_REQUIRED');
  }
 }
 if(!captures.length)fail('LABOUR_REVIEW_REQUIRED');
 const label=String(mapping.haynesOperationLabel||'').trim();
 const plate=String(mapping.registration||'').replace(/\s/g,'').toUpperCase();
 for(const result of captures){
  if(result.operationId!==mapping.haynesOperationId||!label||!normal(result.operationText).includes(normal(label))||
    (result.registrationVisible&&result.registrationVisible!==plate))fail('LABOUR_REVIEW_REQUIRED');
 }
 const values=new Set(captures.map(result=>result.operationId+'|'+result.hoursMilli));
 if(values.size!==1)fail('LABOUR_REVIEW_REQUIRED');
 const result=captures[0];
 return {operationId:result.operationId,operationLabel:label,hoursMilli:parseHours(String(result.hoursMilli/1000),result.unit)};
}
export async function lookupRepair({gsfPage,haynesPage},raw,config,{now=Date.now}={}){
 const request=repairRequest(raw),mapping=reviewedMapping(config,request,now()),g=config.gsf,h=config.haynes;
 if(!g||!h||!/^https:\/\//.test(h.startUrl||''))fail('SETTINGS_REQUIRED');
 const haynesOrigin=new URL(h.startUrl).origin;
 if(!/^(?:https:\/\/)(?:[a-z0-9-]+\.)*(?:haynespro\.com|workshopdata\.com)$/.test(haynesOrigin))fail('SETTINGS_REQUIRED');
 await navigate(gsfPage,g,request,GSF_ORIGIN);
 const identity=await read(gsfPage,g.identity);
 if(normal(identity)!==normal(mapping.gsfIdentity)||!normal(identity).replace(/\s/g,'').includes(request.registration))fail('REVIEW_REQUIRED');
 if(normal(await read(gsfPage,g.vatBasis))!=='EX VAT')fail('REVIEW_REQUIRED');
 const partsRoot=gsfPage.locator(g.parts),count=await partsRoot.count();
 // The DOM must explicitly say the complete number of matching products.
 // This catches pagination, lazy loading and partial/category search results.
 const total=await read(gsfPage,g.totalCount);
 if(!/^\d+$/.test(total)||Number(total)!==count||count>100)fail('REVIEW_REQUIRED');
 if(count===0)fail('OUT_OF_STOCK');
 const parts=[];
 for(let i=0;i<count;i++){
  const root=partsRoot.nth(i),stock=normal(await read(root,g.stock));
  if(!['IN STOCK','OUT OF STOCK'].includes(stock))fail('REVIEW_REQUIRED');
  const description=await read(root,g.description);
  if(!/\balternator\b/i.test(description))fail('REVIEW_REQUIRED');
  let imageUrl='';if(g.image){const img=root.locator(g.image);if(await img.count()===1)imageUrl=await img.getAttribute('src')||'';if(imageUrl)imageUrl=new URL(imageUrl,GSF_ORIGIN).href;}
  parts.push({source:'GSF',registration:request.registration,variant:mapping.variant,fitmentConfirmed:true,vatBasis:'EX_VAT',sku:await read(root,g.sku),brand:await read(root,g.brand),description,costPence:parsePence(await read(root,g.price)),corePence:0,inStock:stock==='IN STOCK',imageUrl,checkedAt:new Date(now()).toISOString()});
 }
 if(h.navigationMode==='workshopdata-registration'){
  if(haynesOrigin!=='https://www.workshopdata.com')fail('SETTINGS_REQUIRED');
  await navigateHaynesRepair(haynesPage,request,mapping);
 }else{
  await navigate(haynesPage,h,request,haynesOrigin);
  if(normal(await read(haynesPage,h.identity))!==normal(mapping.haynesIdentity))fail('LABOUR_REVIEW_REQUIRED');
 }
 const {operationId,operationLabel,hoursMilli}=await readReviewedHaynesOperation(haynesPage,mapping,haynesOrigin);
 const stamp=new Date(now()).toISOString();
 return cleanRepairEvidence({request,variant:mapping.variant,fitmentEvidence:mapping.fitmentEvidence,catalogueComplete:true,parts,checkedAt:stamp,labour:{source:'HAYNES_PRO',registration:request.registration,variant:mapping.variant,operation:request.operation,operationId,operationLabel,hoursMilli,unit:'hours',scopeConfirmed:true,checkedAt:stamp}},request,{now:now()});
}
