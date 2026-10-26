// Calibration evidence only. No page HTML, input values, cookies or account panels.
export function inspectRepairCatalogue({registration},doc=document){
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const scrub=value=>clean(value).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi,'[VIN]').slice(0,600);
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const text=node=>node.nodeType===3?node.textContent:node.nodeType===1&&!visible(node)?'':[...node.childNodes].map(text).join(' ');
 const selector=el=>{const parts=[];for(let n=el;n&&n.nodeType===1&&parts.length<64;n=n.parentElement){const tag=n.tagName.toLowerCase(),siblings=n.parentElement?[...n.parentElement.children].filter(s=>s.tagName===n.tagName):[n];parts.unshift(tag+':nth-of-type('+(siblings.indexOf(n)+1)+')');if(tag==='body')break;}return parts.join(' > ');};
 const nodes=[...doc.querySelectorAll('main *,[role="main"] *')].filter(visible);
 const plate=String(registration||'').toUpperCase().replace(/\s/g,'');
 if(!/^[A-Z0-9]{2,8}$/.test(plate))throw Error('INVALID_REGISTRATION');
 // Exclude recent-vehicle menus from identity evidence. Never claim fitment here.
 const identities=nodes.filter(el=>clean(text(el)).replace(/\s/g,'').toUpperCase().includes(plate)&&clean(text(el)).length<=220&&!el.closest('nav,[role="dialog"],[role="menu"]')&&![...el.children].some(c=>clean(text(c)).replace(/\s/g,'').toUpperCase().includes(plate))).slice(0,4).map(el=>({selector:selector(el),text:scrub(text(el.parentElement&&clean(text(el.parentElement)).length<=220?el.parentElement:el))}));
 const candidates=[];
 for(const el of nodes){const value=clean(text(el));if(value.length>600||!/^.*\balternator\b/i.test(value)||!/[£]\s*\d/.test(value))continue;
  if([...el.children].some(child=>/alternator/i.test(text(child))&&/£\s*\d/.test(text(child))))continue;
  const ancestors=[];for(let n=el.parentElement,depth=1;n&&depth<=3;n=n.parentElement,depth++){
   const section=clean(text(n));if(section.length>1200||n.tagName==='MAIN'||n.tagName==='BODY')break;
   ancestors.push({depth,selector:selector(n),text:scrub(section),images:[...n.querySelectorAll('img')].slice(0,8).map(img=>({alt:scrub(img.getAttribute('alt')),src:(()=>{try{const u=new URL(img.getAttribute('src'));return u.protocol==='https:'&&/gsf|catalogue/i.test(u.hostname)&&/ProductImages|brand|logo/i.test(u.pathname)?u.origin+u.pathname:'';}catch{return '';}})()}))});
  }
  candidates.push({selector:selector(el),text:scrub(value),ancestors,fields:[...el.querySelectorAll('p,span,h2,h3,h4,h5,button')].filter(visible).filter(n=>!n.children.length).slice(0,24).map(n=>({selector:selector(n),text:scrub(text(n))}))});
 }
 const controls=[...doc.querySelectorAll('button,a,[role="button"]')].filter(visible).map(el=>({selector:selector(el),label:scrub(el.getAttribute('aria-label')||text(el))})).filter(x=>/^(?:Search VRM Button|Enter reg\s*\/\s*vin|Clear|All categories|Electrical|Rotating|Alternator|Next|Previous|Load more|Show more|\d+)$/i.test(x.label)).slice(0,30);
 const inputs=[...doc.querySelectorAll('input:not([type="password"]),select')].filter(visible).filter(el=>/reg|vrm|vin|search|sort|categor/i.test([el.id,el.name,el.getAttribute('placeholder'),el.getAttribute('aria-label')].join(' '))).map(el=>({selector:selector(el),tag:el.tagName,type:el.getAttribute('type')||'',placeholder:scrub(el.getAttribute('placeholder')),label:scrub(el.getAttribute('aria-label'))})).slice(0,12);
 const counts=nodes.map(el=>clean(text(el))).filter(value=>value.length<100&&/^(?:showing\s+\d+.*\d+|\d+\s+(?:products?|results?|items?)|(?:products?|results?|items?)\s*:?\s*\d+)$/i.test(value));
 return {registration:plate,fitmentConfirmed:false,catalogueComplete:false,identities,inputs,controls,countLabels:[...new Set(counts)].slice(0,8),candidateCount:candidates.length,candidates:candidates.slice(0,30)};
}
