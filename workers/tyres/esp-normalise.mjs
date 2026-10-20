import {parseSize,moneyPence} from './guide.mjs';
export function parseEspProduct(row,{brands=[]}={}){
 const match=String(row.product||'').match(/^(\d{3}\s*\/\s*\d{2}\s*R\s*\d{2})\s+(.+)$/i);
 if(!match)return null;
 const size=parseSize(match[1]).key,description=match[2].trim(),unitPence=moneyPence(row.sellout);
 if(unitPence===null)return null;
 const known=brands.filter(brand=>description.toUpperCase().startsWith(brand.toUpperCase()+' ')).sort((a,b)=>b.length-a.length)[0];
 const brand=known||description.split(/\s/)[0];
 const model=description.slice(brand.length).trim();
 const stockText=String(row.stockColumns?.Default??'').trim();
 // Keep warehouse counts separate; Company may overlap Default.
 const stock=/^(?:\+?\d+|\d+\+)$/.test(stockText)?Number(stockText.replace(/\+/g,'')):null;
 const rating=model.match(/(?:^|\s)(\d{2,3})([A-Z])(?:\s*XL)?(?:\s|$)/i);
 return {size,brand,model,unitPence,defaultStockMinimum:stock,loadRating:rating?Number(rating[1]):null,speedRating:rating?rating[2].toUpperCase():null,extraLoad:/\bXL\b|\d[A-Z]XL\b/i.test(model),specificationUnverified:true};
}
