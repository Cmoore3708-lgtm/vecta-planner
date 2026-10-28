import {parseSize} from './guide.mjs';
import {requireEspSettings} from './esp-settings.mjs';
// Proposed Vecta merchandising groups, configurable before production release.
export const BRAND_GROUPS={
 budget:['MASSIMO','COMFORSER','MAZZINI','SUNWIDE','ROYAL','RADAR','TOMKET','ACCELERA','TOURADOR','NOVEX','IMPERIAL'],
 midrange:['KUMHO','LASSA','COOPER','TOYO','NANKANG','FALKEN','YOKOHAMA','UNIROYAL','HANKOOK','SUMITOMO','VREDESTEIN'],
 premium:['PIRELLI','BRIDGESTONE','DUNLOP','GOODYEAR','MICHELIN','CONTINENTAL']
};
// Narrow model-scoped aliases observed in the ESP catalogue; other abbreviations
// remain unclassified. These rules must be reviewed before public enablement.
const aliases={PI:['PIRELLI',/^PWRGY/],PIR:['PIRELLI',/^(?:P1|P7)\b/],BST:['BRIDGESTONE',/^TUR/],DU:['DUNLOP',/^(?:BLUER?ESP|BLURESP|SPTMAXX|ALLSEASON|WIN)/],GO:['GOODYEAR',/^(?:EFFGRIP|VEC)/],MI:['MICHELIN',/^(?:PRIM|PILOT|XCLIMATE)/],CO:['CONTINENTAL',/^PC7/],TO:['TOYO',/^(?:PX|CAS)/],YOKO:['YOKOHAMA',/^(?:BLUEARTH|V105)/],HK:['HANKOOK',/^VENP/],UN:['UNIROYAL',/^RS5/],FALK:['FALKEN',/^EUWIN/],VRED:['VREDESTEIN',/^QUAT/],NANKANGXL:['NANKANG',/^AS3/ ]};
export function canonicalBrand(row){
 const brand=String(row.brand||'').trim().toUpperCase();
 const rule=aliases[brand];
 return rule?(rule[1].test(String(row.model||'').toUpperCase())?rule[0]:null):brand;
}
export function isSpecialTyre(row){
 return /\b(?:RFT|RUN[ -]?FLAT|ROF|SSR|ZP|WINTER|ALLSEASON|4SEAS\w*|ASEAS|AS|XCLIMATE\w*|QUAT\w*|SNP\d*|SNW\d*|WIN\d*|WP\d*|EUWIN\w*)\b/i.test(row.model||'');
}
export function selectCatalogueGuides(catalogue,{size,quantity=1,settings,groups=BRAND_GROUPS,now=Date.now()}={}){
 requireEspSettings(settings);
 const key=parseSize(size).key;
 if(!Number.isInteger(quantity)||quantity<1||quantity>4)throw Error('Choose between 1 and 4 tyres');
 const membership=new Map();
 for(const [category,brands] of Object.entries(groups)){
  if(!['budget','midrange','premium'].includes(category))throw Error('Unknown category');
  for(const brand of brands){const name=brand.trim().toUpperCase();if(membership.has(name))throw Error('Duplicate brand group');membership.set(name,category);}
 }
 const options=['budget','midrange','premium'].map(category=>{
  const known=catalogue.filter(row=>{
   let rowKey;try{rowKey=parseSize(row.size).key;}catch{return false;}
   return rowKey===key && membership.get(canonicalBrand(row))===category && !isSpecialTyre(row) && Number.isSafeInteger(row.unitPence) && row.unitPence>0 && Number.isInteger(row.defaultStockMinimum) && row.defaultStockMinimum>=0;
  });
  // Publish only the confirmed online quantity per brand, capped at the four
  // positions a customer can book. Never add Company/Centre stock or mix models.
  const stock=new Map();for(const row of known){const brand=canonicalBrand(row);stock.set(brand,Math.max(stock.get(brand)||0,Math.min(4,row.defaultStockMinimum)));}
  const stockLevels=[...stock].sort(([a],[b])=>a.localeCompare(b)).map(([brand,availableQuantity])=>({brand,availableQuantity}));
  const eligible=known.filter(row=>row.defaultStockMinimum>=quantity).sort((a,b)=>a.unitPence-b.unitPence || canonicalBrand(a).localeCompare(canonicalBrand(b)) || a.model.localeCompare(b.model));
  const seen=new Set(),choices=[];
  for(const tyre of eligible){
   const brand=canonicalBrand(tyre);if(seen.has(brand))continue;
   seen.add(brand);choices.push({category,available:true,brand,model:tyre.model,unitPence:tyre.unitPence,totalPence:tyre.unitPence*quantity,specificationUnverified:true});
   if(choices.length===3)break;
  }
  // Keep the cheapest fields for older website clients while offering more brands.
  return choices.length?{...choices[0],choices,stockLevels}:{category,available:false,choices:[],stockLevels};
 });
 return {size:key,quantity,checkedAt:new Date(now).toISOString(),guideOnly:true,options};
}
