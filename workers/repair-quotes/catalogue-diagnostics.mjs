import {observedCategory,readCatalogueResults} from './catalogue-results.mjs';
import {readCatalogueSearchState} from './catalogue-search.mjs';
import {readRepairGroups} from './general-gsf.mjs';

// Only visible, bounded price-card text. No input values, links, raw HTML,
// account panels, cookies or credentials. This evidence never supplies a quote.
export function readRepairCardDiagnostics(doc=document){
 const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=n=>n.nodeType===3?n.textContent:n.nodeType===1&&(!visible(n)||['SCRIPT','STYLE','INPUT','TEXTAREA','NAV','ASIDE','FORM'].includes(n.tagName))?'':[...n.childNodes].map(text).join(' ');
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);if(mains.length!==1)return [];
 const main=mains[0],cards=new Set();
 const price=t=>/^£\s*\d/.test(t)&&(t.match(/£\s*\d/g)||[]).length===1;
 for(const n of [...main.querySelectorAll('*')].filter(visible)){
  if(n.closest('nav,aside,form')||!price(clean(text(n)))||[...n.children].some(c=>price(clean(text(c)))))continue;
  let card=n;
  for(let parent=n.parentElement;parent&&parent!==main;parent=parent.parentElement){
   const value=clean(text(parent));if(value.length>500||!price(value))break;card=parent;
  }
  cards.add(card);if(cards.size>=20)break;
 }
 return [...cards].map(n=>({tag:n.tagName.toLowerCase(),text:clean(text(n)).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]').replace(/https?:\/\/\S+/gi,'[link]'),radioCount:n.querySelectorAll('input[type="radio"],[role="radio"]').length}));
}
export async function captureCatalogueDiagnostics(page,query){
 const catalogue=await page.evaluate(readRepairGroups);
 return {observedCategory:observedCategory(page.url()),...await page.evaluate(readCatalogueResults,{query}),searchControls:await page.evaluate(readCatalogueSearchState),priceCards:await page.evaluate(readRepairCardDiagnostics),
  catalogue:{complete:catalogue.complete,groupCount:catalogue.groups.length,groups:catalogue.groups.slice(0,40).map(g=>({sku:g.sku,description:g.description,parsedAll:g.parsedAll,checks:g.checks,unavailableCount:g.unavailableCount,summaryPriceCount:g.summaryPriceCount,hasAttributes:!!g.attributesSelector,productLinkCount:g.links.length,options:g.options.slice(0,20).map(({description,brand,grade,pricePence,inStock,selected,selectionControlPresent})=>({description,brand,grade,pricePence,inStock,selected,selectionControlPresent}))}))}};
}
