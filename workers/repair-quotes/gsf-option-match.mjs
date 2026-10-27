import {structuredRepairSelection} from '../../lib/repair-operation-catalogue.js';
const review=detail=>{throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',detail});};
export const normalPart=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const parts={
 alternator:/^alternator(?:\s*[-;]|$)/i,'starter-motor':/^starter motor(?:\s*[-;]|$)/i,battery:/^(?:car )?battery(?:\s*[-;]|$)/i,
 'brake-pads':/^brake pad set(?:\s*[-;]|$)/i,'brake-discs':/^(?:(?:front|rear)\s+)?(?:(?:vented|solid)\s+)?brake discs?(?:\s+pair)?(?:\s*[-;]|\s+(?:coated|vented|solid)|$)/i,
 'brake-caliper':/^brake caliper(?:\s*[-;]|$)/i,'coil-spring':/^coil springs?(?:\s*[-;]|$)/i,'shock-absorber':/^shock absorber(?:\s*[-;]|$)/i,
 'suspension-arm':/^suspension (?:control )?arm(?:\s*[-;]|\s+and ball joint assembly|$)/i,'track-rod-end':/^(?:track|tie) rod end(?:\s*[-;]|$)/i,
 'wheel-bearing':/^wheel (?:bearing(?: kit)?|hub assembly)(?:\s*[-;]|$)/i,'water-pump':/^(?:water|coolant) pump(?:\s*[-;]|$)/i,
 thermostat:/^thermostat(?:\s*[-;]|$)/i,radiator:/^radiator(?:\s*[-;]|$)/i,'auxiliary-belt':/^(?:(?:auxiliary )?drive belt|v-ribbed belts?)(?:\s*[-;]|$)/i,
 'clutch-kit':/^clutch kit(?:\s*[-;]|$)/i,'drive-shaft':/^drive\s?shaft(?:\s*[-;]|$)/i,
 'oil-filter':/^oil filter(?:\s*[-;]|$)/i,'air-filter':/^air filter(?:\s*[-;]|$)/i,'cabin-filter':/^(?:cabin|pollen) filter(?:\s*[-;]|$)/i,'fuel-filter':/^fuel filter(?:\s*[-;]|$)/i
};
function brandOf(card,prefix){
 const logos=(card.images||[]).map(img=>{
  try{const u=new URL(img.src);if(u.origin!=='https://gsfappstorage.blob.core.windows.net')return '';const m=u.pathname.match(/^\/catalogue-assets\/Brands\/([^/]+)\.svg$/i);return m?decodeURIComponent(m[1]).replace(/[-_]/g,' '):'';}catch{return '';}
 }).filter(Boolean);
 const values=logos.concat(prefix?[prefix]:[]);const brands=new Map(values.map(value=>[normalPart(value),value]));
 if(brands.size!==1)review('PART_BRAND_UNCONFIRMED');return [...brands.values()][0];
}
export function parseGSFOption(card){
 const value=String(card?.text||'').trim().replace(/\s+/g,' ');
 // The stock summary/ordering panel is not another product alternative.
 if(/^Stock Type Quantity\b/.test(value)&&/\bRRP:/.test(value))return null;
 const m=value.match(/^£(\d+(?:,\d{3})*)\.(\d{2})\s+(.*?)\b(Silver|Gold|Bronze)\s+(.*?)\s*(Local Branch|RDC|Branch Network|Out Of Stock)$/i);
 if(!m)review('UNPARSED_PART_ALTERNATIVE');
 const costPence=Number(m[1].replaceAll(',',''))*100+Number(m[2]);
 if(!Number.isSafeInteger(costPence)||costPence>10000000)review('INVALID_PART_COST');
 const inStock=!/^out of stock$/i.test(m[6]);if(costPence===0&&!inStock)return {inStock:false,costPence:0};
 if(costPence===0||!m[5])review('UNPRICED_AVAILABLE_PART');
 const group=(card.ancestors||[]).find(row=>{const codes=row.text?.match(/\bSKU:\s*([A-Z0-9./-]+)/gi)||[];return codes.length===1&&/\bAttributes\b/.test(row.text);});
 if(!group)review('PART_GROUP_UNCONFIRMED');
 const groupSku=group.text.match(/\bSKU:\s*([A-Z0-9./-]+)/i)[1];
 const groupDescription=group.text.split(/\s+SKU:/)[0].trim();
 return {costPence,inStock,brand:brandOf(card,m[3].trim()),description:m[5].trim(),groupDescription,groupSku,selector:card.selector,packQuantity:/\bpair\b/i.test(m[5])?2:1};
}
function scopeMatches(option,selection){
 const text=option.description+' '+option.groupDescription;
 const front=/\bfront\b/i.test(text),rear=/\brear\b/i.test(text);
 if(selection.axle&&(selection.axle==='front'?(!front||rear):(!rear||front)))return false;
 const both=/\bLH\s*\/\s*RH\b|\bRH\s*\/\s*LH\b|\bboth\b/i.test(text);
 const left=/\bLH\b|\bleft\b/i.test(text),right=/\bRH\b|\bright\b/i.test(text);
 if(selection.side==='both'&&!both&&option.packQuantity!==2)return false;
 if(selection.side==='left'&&!both&&(!left||right))return false;
 if(selection.side==='right'&&!both&&(!right||left))return false;
 return true;
}
export function analyseStructuredGSF(snapshot,rawSelection,{requireComplete=true}={}){
 const selection=structuredRepairSelection(rawSelection);
 if(!snapshot||snapshot.captureIncomplete||snapshot.truncated||!Array.isArray(snapshot.cards)||snapshot.cardCount!==snapshot.cards.length||!snapshot.identities?.some(t=>t.replace(/\s/g,'')===snapshot.registration))review('VEHICLE_CATALOGUE_NOT_CONFIRMED');
 if(requireComplete){const b=snapshot.boundary;if(!b||b.loading||b.showMore||b.paginationControls?.length||!b.atBottom||!b.groupSkus?.length)review('CATALOGUE_NOT_COMPLETE');}
 const options=snapshot.cards.map(parseGSFOption).filter(Boolean),compatible=options.filter(option=>option.inStock&&parts[selection.partId].test(option.description)&&scopeMatches(option,selection));
 if(!compatible.length)review('NO_PART_WITH_CONFIRMED_SCOPE');
 for(const option of compatible){option.packsRequired=Math.ceil(selection.quantity/option.packQuantity);option.totalCostPence=option.costPence*option.packsRequired;}
 const fingerprints=new Set(compatible.map(option=>[...option.groupDescription.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:mm|amp|kw)\b/gi)].map(m=>normalPart(m[0])).sort().join('|')).filter(Boolean));
 if(fingerprints.size>1)review('MULTIPLE_FITMENT_SPECIFICATIONS');
 compatible.sort((a,b)=>a.totalCostPence-b.totalCostPence||a.brand.localeCompare(b.brand));
 return {catalogueComplete:requireComplete,optionsChecked:options.length,compatible,selected:compatible[0],pricingApproved:false};
}
