import {selectCatalogueGuides} from '../workers/tyres/tiers.mjs';
import {attachTyreCosts} from './tyre-cost-token.js';
// Stored stock is historical. Use previously stocked tyres for guide prices,
// but never present those quantities as current availability.
export function catalogueGuide(data,{size,quantity,now=Date.now(),password}={}){
 const saved=data.priceSource==='saved';
 const catalogue=saved?data.catalogue.filter(row=>row.defaultStockMinimum>0).map(row=>({...row,defaultStockMinimum:4})):data.catalogue;
 let guide=selectCatalogueGuides(catalogue,{size,quantity,settings:data.settings,now:Date.parse(data.checkedAt)});
 if(saved)guide={...guide,priceSource:'saved',servedAt:new Date(now).toISOString(),availabilityUnconfirmed:true,options:guide.options.map(option=>({...option,stockLevels:[]}))};
 return{status:'MATCHED',...attachTyreCosts(guide,catalogue,password)};
}
