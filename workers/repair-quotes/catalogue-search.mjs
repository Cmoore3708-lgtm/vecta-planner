const ORIGIN='https://trade.gsfcarparts.com';

// Called in the supplier page. Read labels and control types only: never input
// values, page HTML, cookies, account details or URL query parameters.
export function readCatalogueSearchState(doc=document){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim().replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[email]').replace(/https?:\/\/\S+/gi,'[url]').slice(0,180);
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;const style=doc.defaultView?.getComputedStyle?.(n)||n.style;if(style&&(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0'))return false;}return true;};
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return parts.join(' > ');};
 const fields=[...doc.querySelectorAll('input')].filter(visible).filter(n=>!n.disabled&&!n.readOnly).map(n=>{
  const labels=[...doc.querySelectorAll('label')].filter(l=>l.htmlFor===n.id&&n.id||l.contains(n)).map(l=>l.textContent);
  const labelled=(n.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>doc.getElementById(id)?.textContent||'').join(' ');
  const label=clean(n.getAttribute('aria-label')||labelled||labels.join(' ')||n.getAttribute('title')),placeholder=clean(n.getAttribute('placeholder'));
  const type=(n.getAttribute('type')||'text').toLowerCase(),hint=label+' '+placeholder;
  const excluded=/\b(?:reg(?:istration)?|number plate|vin|email|password|postcode|postal|customer)\b/i.test(hint);
  const catalogue=/\b(?:oe|cross[ -]?ref(?:erence)?|aftermarket|categor(?:y|ies)|parts?|products?)\b/i.test(hint)&&/search|find|oe|aftermarket/i.test(hint);
  return {selector:selector(n),type,label,placeholder,catalogue:!excluded&&['text','search'].includes(type)&&catalogue};
 });
 return {readyState:doc.readyState||'unknown',loginVisible:fields.some(f=>f.type==='password'),busy:!!doc.querySelector('[aria-busy="true"],[role="progressbar"]'),fields:fields.filter(f=>['text','search','password','email'].includes(f.type)).slice(0,30)};
}
export async function findCatalogueSearch(page,{attempts=75,delayMs=200}={}){
 let state={fields:[]};
 for(let i=0;i<attempts;i++){
  const url=new URL(page.url());
  if(url.origin!==ORIGIN||/^\/(?:sign-?in|log-?in)(?:\/|$)/i.test(url.pathname))throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});
  try{state=await page.evaluate(readCatalogueSearchState);}
  catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message||''))throw error;await page.waitForTimeout(delayMs);continue;}
  if(state.loginVisible)throw Object.assign(Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED',supplier:'GSF'});
  const candidates=[];
  for(const field of state.fields.filter(f=>f.catalogue)){
   const control=page.locator(field.selector);
   if(await control.count()===1&&await control.isVisible())candidates.push(control);
  }
  if(candidates.length===1)return candidates[0];
  if(i+1<attempts)await page.waitForTimeout(delayMs);
 }
 const observed={readyState:state.readyState,busy:state.busy,fields:state.fields.map(({type,label,placeholder,catalogue})=>({type,label,placeholder,catalogue}))};
 throw Object.assign(Error('REVIEW_REQUIRED'),{code:'REVIEW_REQUIRED',supplier:'GSF',detail:state.fields.filter(f=>f.catalogue).length>1?'CATALOGUE_SEARCH_AMBIGUOUS':'CATALOGUE_SEARCH_UNAVAILABLE',observed});
}
