import {readAlternatorTime} from './repair-time-reader.mjs';
// Read only visible repair-page labels and controls. Never capture input
// values, account panels, cookies, URL queries or raw page HTML.
export function readHaynesRepairPage(input={},doc=globalThis.document){
 if(input?.querySelectorAll){doc=input;input={};}
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;}}return true;};
 const excluded='nav,header,footer,aside,form';
 const text=n=>n.nodeType===3?n.textContent:n.nodeType!==1||!visible(n)||['SCRIPT','STYLE','INPUT','TEXTAREA','SELECT','NAV','HEADER','FOOTER','ASIDE','FORM'].includes(n.tagName)?'':[...n.childNodes].map(text).join(' ');
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1;n=n.parentElement){const siblings=n.parentElement?[...n.parentElement.children].filter(c=>c.tagName===n.tagName):[n];parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(n.tagName==='BODY')break;}return parts.join(' > ');};
 const denied=/\b(?:renew|replace|remove|refit|add|estimate|print|order|basket|cart|checkout|buy|login|logout|sign|save|delete|back|home|help|account|subscription|settings|privacy|cookie)\b|\d{2,}|@/i;
 const nodes=[...doc.querySelectorAll('[aria-expanded],[role="treeitem"],li span,li a,li button,li label,h2,h3,h4')].filter(visible).filter(n=>!n.closest(excluded));
 // These observed page headings are not selectable repair groups. Never
 // turn the empty jobs panel or explanatory notes into supplier choices.
 const pageHeading=/^(?:jobs|(?:important )?notes?|repair times?|total time)(?:\s*\([^)]*\))?\s*:?$/i;
 const candidates=nodes.map(n=>({node:n,label:clean(text(n))})).filter(o=>o.label&&o.label.length<=100&&!denied.test(o.label)&&!pageHeading.test(o.label));
 const menus=[];
 for(const item of candidates){
  // An ARIA tree item and its inner label describe one control. Distinct
  // sibling controls with the same text remain ambiguous.
  if(candidates.some(other=>other!==item&&item.node.contains(other.node)&&other.label===item.label))continue;
  const anchor=item.node.closest('a[href]');
  if(anchor){const href=anchor.getAttribute('href')||'';if(href&&!href.startsWith('#')){try{const u=new URL(href,'https://www.workshopdata.com');if(u.origin!=='https://www.workshopdata.com'||u.pathname!=='/touch/site/layout/repairTimes')continue;}catch{continue;}}}
  const expansion=item.node.closest('[aria-expanded]');
  menus.push({label:item.label,selector:selector(item.node),expanded:expansion?.getAttribute('aria-expanded')==='true'});
 }
 const searchFields=[...doc.querySelectorAll('input:not([type]),input[type="text"],input[type="search"]')].filter(visible).filter(n=>!n.disabled&&!n.readOnly&&!n.closest('nav,header,footer,aside'));
 const searchButtons=[...doc.querySelectorAll('button,a,[role="button"],input[type="submit"],input[type="button"]')].filter(visible).filter(n=>!n.disabled&&!n.closest('nav,header,footer,aside')).filter(n=>/^search$/i.test(clean(n.getAttribute('aria-label')||n.getAttribute('title')||((n.tagName==='INPUT')?n.getAttribute('value'):text(n)))));
 const searches=[];
 for(const field of searchFields){
  const label=clean([field.getAttribute('aria-label'),field.getAttribute('placeholder'),field.getAttribute('title')].filter(Boolean).join(' '));
  let submit;
  for(let parent=field.parentElement;parent&&parent.tagName!=='BODY';parent=parent.parentElement){
   const fields=searchFields.filter(n=>parent.contains(n)),buttons=searchButtons.filter(n=>parent.contains(n));
   if(fields.length===1&&buttons.length===1){submit=buttons[0];break;}
   if(fields.length>1)break;
  }
  if(submit||/search.*(?:repair|operation)|(?:repair|operation).*search/i.test(label))searches.push({selector:selector(field),label:label||'Search',...(submit?{submitSelector:selector(submit)}:{})});
 }
 const scoped=[...doc.querySelectorAll('h1,h2,h3,h4,h5,li,span,p,div,label')].filter(visible).filter(n=>!n.closest(excluded));
 const query=clean(input.query).toLowerCase(),terms=query.split(/\s+/).filter(t=>t.length>2);
 const matchingLabels=scoped.map(n=>({node:n,label:clean(text(n))})).filter(o=>o.label&&o.label.length<=200&&(terms.some(t=>o.label.toLowerCase().includes(t))||/\b(?:Renew|Replace|Remove and refit)\b/i.test(o.label))).filter(o=>![...o.node.children].some(n=>clean(text(n))===o.label)).slice(0,20).map(o=>({tag:o.node.tagName.toLowerCase(),text:o.label}));
 const busy=[...doc.querySelectorAll('[aria-busy="true"],[role="progressbar"]')].some(visible)||scoped.some(n=>/^(?:loading|please wait)(?:\s*[.…]+)?$/i.test(clean(text(n))));
 const login=[...doc.querySelectorAll('input[type="password"]')].some(visible);
 return {readyState:doc.readyState||'complete',busy,login,menus,searches,candidateCount:nodes.length,matchingLabels};
}

export function readRepairMenus(doc=globalThis.document){return readHaynesRepairPage({},doc).menus.map(({expanded,...item})=>item);}

export async function captureHaynesDiagnostics(page,query){
 const scrub=value=>String(value||'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]').replace(/https?:\/\/\S+/gi,'[link]').slice(0,200);
 const frames=[];let skippedFrames=0;
 for(const frame of page.frames()){
  let u;try{u=new URL(frame.url());}catch{skippedFrames++;continue;}
  if(u.origin!=='https://www.workshopdata.com'){skippedFrames++;continue;}
  if(frames.length>=8)break;
  try{const s=await frame.evaluate(readHaynesRepairPage,{query});let operations;
   try{const found=await frame.evaluate(readAlternatorTime,{operationPattern:'\\b(?:Renew|Replace|Remove\\s+and\\s+refit)\\b',allowMultiple:true});operations={operationCount:found.length};}
   catch(error){operations={operationReadError:(error.message||'').match(/LABOUR_REVIEW_REQUIRED:([A-Z_]+)/)?.[1]||'READ_UNAVAILABLE'};}
   frames.push({path:u.pathname,readyState:s.readyState,busy:s.busy,login:s.login,candidateCount:s.candidateCount,menuCount:s.menus.length,menus:s.menus.slice(0,40).map(m=>({label:scrub(m.label),expanded:m.expanded})),searches:s.searches.map(m=>({label:scrub(m.label)})),matchingLabels:s.matchingLabels.map(m=>({tag:m.tag,text:scrub(m.text)})),...operations});}
  catch{frames.push({path:u.pathname,captureUnavailable:true});}
 }
 return {frames,skippedFrames};
}
