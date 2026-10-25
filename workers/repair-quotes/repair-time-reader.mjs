// Read-only capture of one visible, priced alternator operation.
export function readAlternatorTime(doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const fail=reason=>{throw Error('LABOUR_REVIEW_REQUIRED:'+reason);};
 const operation=/\b(?:Renew|Replace|Remove\s+and\s+refit)\s+(?:the\s+)?alternator\b/i;
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const nodes=[...doc.querySelectorAll('td,span,a,div,p,label')].filter(el=>visible(el)&&clean(el.textContent).length<160&&operation.test(clean(el.textContent))&&![...el.children].some(child=>operation.test(clean(child.textContent))));
 if(!nodes.length)fail('OPERATION_NOT_VISIBLE');
 const matches=new Map();let ambiguous=false;
 for(const target of nodes){
  for(let node=target,depth=0;node&&depth<8;depth++,node=node.parentElement){
   const label=clean([...node.childNodes].map(child=>child.innerText||child.textContent).join(' '));
   if(label.length>350||(label.match(new RegExp(operation.source,'ig'))||[]).length>1)break;
   const times=[...label.matchAll(/(?:^|\s)(\d{1,2}[.,]\d{2})(?=\s|$)/g)].map(m=>m[1].replace(',','.'));
   if(times.length>1){ambiguous=true;break;}
   if(times.length===1){
    // Identical duplicate DOM rows are one operation; different IDs/times are not.
    const match={operationText:label,hoursText:times[0]};
    matches.set(label.toUpperCase()+'|'+times[0],match);break;
   }
  }
 }
 if(ambiguous)fail('MULTIPLE_TIMES');
 if(matches.size!==1)fail(matches.size?'MULTIPLE_PRICED_OPERATIONS':'TIME_NOT_FOUND');
 const matched=[...matches.values()][0],unitText=clean(doc.body?.innerText||doc.body?.textContent);
 if(!/TOTAL\s*TIME\s*\(H\)/i.test(unitText)&&!/hours\s+and\s+hundredths\s+of\s+hours/i.test(unitText))fail('HOURS_UNIT_NOT_CONFIRMED');
 const hoursMilli=Math.round(Number(matched.hoursText)*1000);
 if(hoursMilli<=0||hoursMilli>100000)fail('INVALID_TIME');
 const plate=doc.querySelector('#numberPlate,input[name="numberPlate"]');
 return {...matched,hoursMilli,unit:'hours',registrationVisible:String(plate?.value||'').toUpperCase().replace(/\s/g,''),fitmentConfirmed:false};
}
// Minimal diagnostic fields only; no page HTML, account text or credentials.
export function repairTimeDiagnostics(doc=document){
 const operation=/\b(?:Renew|Replace|Remove\s+and\s+refit)\s+(?:the\s+)?alternator\b/i;
 const nodes=[...doc.querySelectorAll('td,span,a,div,p,label')].filter(el=>String(el.textContent||'').length<160&&operation.test(el.textContent||'')&&![...el.children].some(c=>operation.test(c.textContent||'')));
 return {matchingLabels:nodes.length,rows:nodes.slice(0,6).map(el=>{const row=el.closest('tr,[role="row"]');const text=String(row?.innerText||row?.textContent||'');return {operation:(el.textContent.match(operation)||[])[0]||'',tableRowFound:!!row,times:[...text.matchAll(/\b(\d{1,2}[.,]\d{2})\b/g)].map(m=>m[1]),operationCodes:(text.match(/\b[A-Z0-9]{8,24}\b/g)||[]).filter(code=>code.length!==17).slice(0,3)};})};
}
