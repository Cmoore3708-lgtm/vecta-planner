import {parseSize} from '../workers/tyres/guide.mjs';
import {requireEspSettings} from '../workers/tyres/esp-settings.mjs';
export function cleanTyreCatalogue(data,size,now=Date.now()){
 const key=parseSize(size).key;if(data?.size!==key||!Array.isArray(data.catalogue)||data.catalogue.length>3000)throw Error('INVALID_RESULT');
 const checked=Date.parse(data.checkedAt);if(!Number.isFinite(checked)||now-checked>=300000||checked>now+60000)throw Error('EXPIRED_RESULT');
 requireEspSettings(data.settings);
 const catalogue=data.catalogue.filter(row=>row.defaultStockMinimum!==null&&row.defaultStockMinimum!==undefined).map(row=>{if(row.size!==key||!Number.isSafeInteger(row.unitPence)||row.unitPence<1||row.unitPence>500000||!Number.isSafeInteger(row.defaultStockMinimum)||row.defaultStockMinimum<0||row.defaultStockMinimum>100000||typeof row.brand!=='string'||!row.brand.trim()||row.brand.length>70||typeof row.model!=='string'||row.model.length>180)throw Error('INVALID_RESULT');return{size:key,brand:row.brand,model:row.model,unitPence:row.unitPence,defaultStockMinimum:row.defaultStockMinimum};});
 return{size:key,checkedAt:new Date(checked).toISOString(),catalogue,settings:{showSellout:true,vatIncluded:true,priceList:'Vecta',multiplier:1}};
}
