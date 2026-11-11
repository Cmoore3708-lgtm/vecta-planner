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
 const candidates=nodes.map(n=>({node:n,label:clean(text(n))})).filter(o=>o.label&&o.label.length<=100&&!denied.test(o.label)&&!/^repair times?$|^total time/i.test(o.label));
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
 const searches=[...doc.querySelectorAll('input:not([type="password"])')].filter(visible).filter(n=>!n.closest('nav,header,footer,aside')).map(n=>({selector:selector(n),label:clean([n.getAttribute('aria-label'),n.getAttribute('placeholder'),n.getAttribute('title')].filter(Boolean).join(' '))})).filter(n=>/search.*(?:repair|operation)|(?:repair|operation).*search/i.test(n.label));
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
