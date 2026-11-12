import {repairScope} from '../../lib/repair-quote.js';
import {choiceId} from './choice-result.mjs';
const ORIGIN='https://trade.gsfcarparts.com';
export function observedCategory(value){
 let url,category;try{url=new URL(value,ORIGIN);category=decodeURIComponent(decodeURIComponent(url.pathname.slice(7)));}catch{return '';}
 return url.origin===ORIGIN&&!url.username&&!url.password&&url.pathname.startsWith('/parts/')&&category&&category.length<=150&&!category.includes('/')?category:'';
}
export function categoryMatches(category,query){return !!category&&repairScope.words(category).sort().join(' ')===repairScope.words(query).sort().join(' ');}
// The URL segment may be an opaque supplier ID. Its meaning comes from an
// observed label, never from a local ID-to-part mapping.
export function labelledDestinationCategory(url,beforeUrl,query,results){
 const category=observedCategory(url);if(!/^\d+$/.test(category))return '';
 if(new URL(url,ORIGIN).pathname===new URL(beforeUrl,ORIGIN).pathname)return '';
 if(results.pageState?.visibleMainCount!==1||results.pageState?.busy||results.pageState?.loginVisible)return '';
 return (results.mainMatchingLabels||[]).some(label=>categoryMatches(label,query))?category:'';
}
export const categoryChoiceId=control=>choiceId('gsf-category',control.label,control.path);
export function suggestedCategoryChoices(results,request){
 const scope=repairScope.resolve(request.work),counts=new Map();
 for(const c of results.controls){const id=categoryChoiceId(c);counts.set(id,(counts.get(id)||0)+1);}
 return results.controls.filter(c=>counts.get(categoryChoiceId(c))===1).map(c=>({id:categoryChoiceId(c),categoryChoice:categoryChoiceId(c),label:c.label,detail:'GSF search suggestion',work:repairScope.prefix(scope.lookup)+(scope.quantity!==1?scope.quantity+' ':'')+[scope.axle,scope.side,c.label].filter(Boolean).join(' ')}));
}

// Minimal evidence from the rendered results only. Excludes input values,
// account panels, raw HTML, URL queries and unrelated headings/text.
export function readCatalogueResults({query},doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const scrub=v=>clean(v).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]').replace(/https?:\/\/\S+/gi,'[url]').slice(0,220);
 const visibility=new WeakMap();
 const visible=n=>{if(!n||n.nodeType!==1)return true;if(visibility.has(n))return visibility.get(n);const s=doc.defaultView?.getComputedStyle?.(n)||n.style;const result=!n.hidden&&n.getAttribute('aria-hidden')!=='true'&&!(s&&(s.display==='none'||s.visibility==='hidden'||s.opacity==='0'))&&visible(n.parentElement);visibility.set(n,result);return result;};
 const selector=el=>{const p=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];p.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return p.join(' > ');};
 const words=v=>clean(v).toLowerCase().replace(/[.,:;()]/g,' ').split(/\s+/).filter(Boolean).map(w=>w.replace(/s$/,''));
 const terms=words(query),related=label=>terms.some(t=>words(label).includes(t));
 const nodes=[...doc.querySelectorAll('a,button,[role="button"],[role="option"],h1,h2,h3,h4,h5,span,p,li')].filter(visible);
 const controls=[];
 for(const n of nodes){
  const label=clean(n.getAttribute('aria-label')||n.innerText||n.textContent),role=n.getAttribute('role')||'';
  if(!label||label.length>180||!related(label)||n.disabled||n.getAttribute('type')==='submit')continue;
  if(!['A','BUTTON'].includes(n.tagName)&&!['option','button'].includes(role))continue;
  if(/\b(?:buy|add|basket|checkout|order|delete|remove|quote|estimate|account)\b/i.test(label))continue;
  let path='';const href=n.getAttribute('href')||n.closest('a[href]')?.getAttribute('href');
  if(href){try{const u=new URL(href,'https://trade.gsfcarparts.com');if(u.origin!=='https://trade.gsfcarparts.com'||!u.pathname.startsWith('/parts/'))continue;path=u.pathname;}catch{continue;}}
  controls.push({label:scrub(label),selector:selector(n),tag:n.tagName,role,path});
 }
 const leaf=nodes.filter(n=>clean(n.innerText||n.textContent).length<=220&&![...n.children].some(c=>clean(c.innerText||c.textContent)===clean(n.innerText||n.textContent)));
 const labels=[...new Set(leaf.map(n=>clean(n.innerText||n.textContent)).filter(t=>t&&related(t)).map(scrub))].slice(0,30);
 const headings=[...doc.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"]')].filter(visible).map(n=>clean(n.innerText||n.textContent)).filter(t=>t.length<=220&&(/search|results?|categor/i.test(t)||related(t))).map(scrub).slice(0,12);
 const emptyMessages=[...new Set(leaf.map(n=>clean(n.innerText||n.textContent)).filter(t=>/\bno (?:matching )?(?:parts|products|results|items|matches)\b|\b0 (?:results|products|items)\b/i.test(t)).map(scrub))].slice(0,4);
 const mains=[...doc.querySelectorAll('main,[role="main"]')].filter(visible);
 const mainMatchingLabels=[...new Set(mains.flatMap(m=>[...m.querySelectorAll('*')]).filter(visible).filter(n=>!n.closest('nav,aside,form,a,button,select,[contenteditable="true"],[role="option"],[role="listbox"]')&&!['SCRIPT','STYLE','INPUT','TEXTAREA'].includes(n.tagName)&&![...n.children].some(c=>clean(c.innerText||c.textContent))).map(n=>clean(n.innerText||n.textContent)).filter(t=>t&&t.length<=150&&related(t)).map(scrub))].slice(0,30);
 const mainHeadings=[...new Set(mains.flatMap(m=>[...m.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"]')]).filter(visible).map(n=>scrub(n.innerText||n.textContent)).filter(Boolean))].slice(0,15);
 const statusText=leaf.map(n=>clean(n.innerText||n.textContent)).join(' ');
 const pageState={readyState:doc.readyState||'unknown',visibleMainCount:mains.length,mainHeadings,busy:[...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible),loadingMessage:/\b(?:loading|please wait)\b/i.test(statusText),vehiclePrompt:/\b(?:enter|select|search|add) (?:a |your |the )?(?:vehicle|registration|reg(?:istration)? number)\b/i.test(statusText),loginVisible:[...doc.querySelectorAll('input[type="password"]')].some(visible),iframeCount:doc.querySelectorAll('iframe').length};
 let categoryLinks=0,productLinks=0;
 for(const n of [...doc.querySelectorAll('a[href]')].filter(visible)){try{const u=new URL(n.getAttribute('href'),'https://trade.gsfcarparts.com');if(u.origin!=='https://trade.gsfcarparts.com')continue;if(u.pathname.startsWith('/parts/'))categoryLinks++;if(u.pathname.startsWith('/partdetails/'))productLinks++;}catch{}}
 return {headings,matchingLabels:labels,mainMatchingLabels,controls:controls.slice(0,30),categoryLinks,productLinks,emptyMessages,pageState};
}

// An exact observed suggestion can be a button/option rather than an anchor.
// Accept a matching named route, or a new numeric route reached by clicking
// the exact observed category label. The subsequent capture still verifies
// the selected registration and presents actual parts for explicit selection.
export async function followExactCategorySuggestion(page,query,selected){
 const current=observedCategory(page.url());if(categoryMatches(current,query))return {category:current};
 const results=await page.evaluate(readCatalogueResults,{query});
 const exact=results.controls.filter(c=>selected?categoryChoiceId(c)===selected:categoryMatches(c.label,query));
 if(exact.length!==1)return {category:'',observed:results};
 const control=page.locator(exact[0].selector);
 if(await control.count()!==1||!await control.isVisible())return {category:'',observed:results};
 const beforePath=new URL(page.url()).pathname;await control.click({timeout:8000});
 for(let i=0;i<20;i++){
  const u=new URL(page.url());if(u.origin!==ORIGIN||/^\/(?:signin|login)/i.test(u.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});
  const category=observedCategory(u.href);if(categoryMatches(category,query))return {category};
  if(/^\d+$/.test(category)&&categoryMatches(exact[0].label,query)){
   if(u.pathname!==beforePath)return {category};
   // Re-selecting the current category need not change its URL. Require its
   // matching main-content label as well as the explicit suggestion click.
   const reached=await page.evaluate(readCatalogueResults,{query});
   if(reached.pageState?.visibleMainCount===1&&!reached.pageState?.busy&&reached.mainMatchingLabels?.some(label=>categoryMatches(label,query)))return {category};
  }
  if(i<19)await page.waitForTimeout(200);
 }
 return {category:'',followed:true,observed:await page.evaluate(readCatalogueResults,{query})};
}
