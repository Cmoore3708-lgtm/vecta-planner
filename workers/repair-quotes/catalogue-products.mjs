import {repairScope} from '../../lib/repair-quote.js';
import {choiceId} from './choice-result.mjs';

// Search cards are different from the category catalogue's SKU/grade groups.
// Keep each visible product title with its own price and click target; never
// pair the separate diagnostic lists of titles and prices by their indices.
export function readSearchProducts({query},doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;const s=doc.defaultView?.getComputedStyle?.(n)||n.style;if(s&&(s.display==='none'||s.visibility==='hidden'||s.opacity==='0'))return false;}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&!visible(n)?'':[...n.childNodes].filter(c=>!['SCRIPT','STYLE','INPUT','TEXTAREA','NAV','ASIDE'].includes(c.tagName)).map(text).join(' ');
 const selector=el=>{const p=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];p.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return p.join(' > ');};
 const words=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(w=>w.replace(/s$/,''));
 const wanted=words(query).filter(w=>!['the','a','an','and','for','with'].includes(w));
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);
 if(mains.length!==1)return {products:[],busy:false};
 const main=mains[0],nodes=[...main.querySelectorAll('*')].filter(visible);
 const excluded=n=>n.closest('nav,aside,form,[role="listbox"],[role="option"],[contenteditable="true"]')||['SCRIPT','STYLE','INPUT','TEXTAREA'].includes(n.tagName);
 const leaf=nodes.filter(n=>!excluded(n)&&![...n.children].some(c=>clean(text(c))===clean(text(n))));
 const titles=leaf.filter(n=>{const value=clean(text(n));return value.length>=2&&value.length<=160&&wanted.length&&wanted.every(w=>words(value).includes(w))&&!/£|\b(?:search|results?|related|categor(?:y|ies)|buy|add|basket|checkout|order|account)\b/i.test(value);});
 const prices=leaf.filter(n=>/^£\s*\d+(?:,\d{3})*\.\d{2}(?:\s+(?:ex|excluding|inc|including)\s+VAT)?$/i.test(clean(text(n)))&&!n.closest('button,[role="button"]'));
 const products=[];
 for(const title of titles){
  let card=title.parentElement;
  while(card&&card!==main&&!prices.some(p=>card.contains(p)))card=card.parentElement;
  if(!card||card===main||titles.filter(t=>card.contains(t)).length!==1)continue;
  const cardPrices=prices.filter(p=>card.contains(p));if(cardPrices.length!==1)continue;
  const price=Number(clean(text(cardPrices[0])).match(/£\s*([\d,.]+)/)[1].replaceAll(',',''));
  const displayPricePence=Math.round(price*100);if(!Number.isSafeInteger(displayPricePence)||displayPricePence<=0)continue;
  const label=clean(text(title));
  const target=title.closest('a[href],button,[role="button"]')||title;
  if(!card.contains(target)||target.disabled||/\b(?:buy|add|basket|checkout|order|delete|account)\b/i.test(target.getAttribute('aria-label')||''))continue;
  let path='';const href=target.getAttribute('href');
  if(href){try{const u=new URL(href,'https://trade.gsfcarparts.com');if(u.origin!=='https://trade.gsfcarparts.com'||u.username||u.password||u.search||u.hash||!/^\/(?:partdetails|parts)\/[^/]+\/?$/.test(u.pathname))continue;path=u.pathname;}catch{continue;}}
  const skuNodes=leaf.filter(n=>card.contains(n)&&/^SKU:\s*[a-z0-9][a-z0-9._/-]{1,99}$/i.test(clean(text(n))));
  const sku=skuNodes.length===1?clean(text(skuNodes[0])).replace(/^SKU:\s*/i,''):'';
  products.push({label,sku,path,displayPricePence,selector:selector(target),cardSelector:selector(card)});
 }
 return {products:products.slice(0,100),busy:nodes.some(n=>n.getAttribute('aria-busy')==='true'||n.getAttribute('role')==='progressbar')};
}

export function searchProductPositions(value){
 const text=String(value).toLowerCase().replace(/\b(?:lh|n\/?s|nearside)\b/g,'left').replace(/\b(?:rh|o\/?s|offside)\b/g,'right');
 return {axles:[...new Set(text.match(/\b(?:front|rear)\b/g)||[])],sides:[...new Set(text.match(/\b(?:left|right)\b/g)||[])]};
}
export function searchProductChoices(products,request){
 const scope=repairScope.resolve(request.work),found=[];
 for(const product of products){
  const p=searchProductPositions(product.label);
  if(scope.axle&&p.axles.length&&!p.axles.includes(scope.axle)||scope.side&&p.sides.length&&!p.sides.includes(scope.side))continue;
  const axles=scope.axle?[scope.axle]:p.axles.length?p.axles:[''],sides=scope.side?[scope.side]:p.sides.length?p.sides:[''];
  for(const axle of axles)for(const side of sides){
   const selected=repairScope.scope(scope.part,axle,side,scope.quantity,scope.lookup);if(selected.status!=='SUPPORTED')continue;
   // A later detail-page attribute may refine a position absent from the card.
   // Keep navigation identity stable across that refinement, while distinguishing
   // the explicit alternatives offered by a Front/Rear or LH/RH card.
   const id=choiceId('gsf-search-product',product.label,product.sku,product.path,product.displayPricePence,p.axles.length?axle:'',p.sides.length?side:'');
   found.push({product,scope:selected,choice:{id,categoryChoice:id,label:product.label,detail:[product.sku?'SKU '+product.sku:'',axle,side,'Product result — check vehicle fitment and price next'].filter(Boolean).join(' · '),work:selected.work}});
  }
 }
 const counts=new Map();for(const item of found)counts.set(item.choice.id,(counts.get(item.choice.id)||0)+1);
 return found.filter(item=>counts.get(item.choice.id)===1);
}

// Selected search results may be from the whole catalogue. A selected vehicle
// or a product title alone cannot prove that a globally searched part fits it.
export function readSearchProductFitment(doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;const s=doc.defaultView?.getComputedStyle?.(n)||n.style;if(s&&(s.display==='none'||s.visibility==='hidden'))return false;}return true;};
 const dialogs=[...doc.querySelectorAll('[role="dialog"]')].filter(visible).filter(n=>[...n.querySelectorAll('h2')].some(h=>clean(h.textContent)==='Part Details'));
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible),root=dialogs.length===1?dialogs[0]:dialogs.length===0&&mains.length===1?mains[0]:null;
 if(!root)return {fitsSelectedVehicle:false,rows:[]};
 const labels=[...root.querySelectorAll('*')].filter(visible).filter(n=>!n.closest('button,a,form,nav,aside')&&!['SCRIPT','STYLE','INPUT','TEXTAREA'].includes(n.tagName)&&![...n.children].some(c=>clean(c.textContent))).map(n=>clean(n.textContent));
 const fitsSelectedVehicle=labels.some(t=>/^(?:this part (?:is )?)?(?:fits (?:your|the selected) vehicle|compatible with (?:your|the selected) vehicle|suitable for (?:your|the selected) vehicle)[.!]?$/i.test(t))&&!labels.some(t=>/\b(?:not compatible|not suitable|does not fit|doesn't fit)\b/i.test(t));
 const rows=[...root.querySelectorAll('tr')].filter(visible).map(n=>[...n.querySelectorAll('td')].map(c=>clean(c.textContent))).filter(c=>c.length===2&&/^(?:fitting position|quantity per pack|pack quantity|pack size)$/i.test(c[0])).map(([attribute,value])=>({attribute,value}));
 for(const p of [...root.querySelectorAll('p')].filter(visible).filter(n=>/^(?:fitting position|quantity per pack|pack quantity|pack size)$/i.test(clean(n.textContent)))){
  const pair=[...p.parentElement.querySelectorAll(':scope > p')].filter(visible);if(pair.length===2&&pair[0]===p)rows.push({attribute:clean(p.textContent),value:clean(pair[1].textContent)});
 }
 return {fitsSelectedVehicle,rows};
}
