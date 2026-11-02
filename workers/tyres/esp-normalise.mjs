import {parseSize,moneyPence} from './guide.mjs';
export function parseEspProduct(row,{brands=[]}={}){
 const match=String(row.product||'').match(/^(\d{3}\s*\/\s*\d{2}\s*R\s*\d{2})\s+(.+)$/i);
 if(!match)return null;
 const size=parseSize(match[1]).key,description=match[2].trim(),unitPence=moneyPence(row.sellout);
 if(unitPence===null)return null;
 const known=brands.filter(brand=>description.toUpperCase().startsWith(brand.toUpperCase()+' ')).sort((a,b)=>b.length-a.length)[0];
 const brand=known||description.split(/\s/)[0];
 const model=description.slice(brand.length).trim();
 // Include the confirmed transfer-warehouse column as well as Default stock.
 // Take the largest single pool: counts can overlap, so never add them together.
 // Company alone remains unverified and must not imply available stock.
 const counts=['Default','Centre Stock','Warehouse','Other Warehouse','Other Stock'].map(label=>{
  const text=String(row.stockColumns?.[label]??'').trim();
  if(!/^(?:\+?\d+|\d+\+)$/.test(text))return null;
  const count=Number(text.replace(/\+/g,''));
  return Number.isSafeInteger(count)&&count<=100000?count:null;
 }).filter(count=>count!==null);
 // Preserve the relay's legacy field name for compatibility with the installed site.
 const stock=counts.length?Math.max(...counts):null;
 const rating=model.match(/(?:^|\s)(\d{2,3})([A-Z])(?:\s*XL)?(?:\s|$)/i);
 const cost=moneyPence(row.cost);
 return {size,brand,model,unitPence,...(Number.isSafeInteger(cost)&&cost>0&&cost<=500000?{costNetPence:cost}:{}),defaultStockMinimum:stock,loadRating:rating?Number(rating[1]):null,speedRating:rating?rating[2].toUpperCase():null,extraLoad:/\bXL\b|\d[A-Z]XL\b/i.test(model),specificationUnverified:true};
}
