// Read-only capture of one visible alternator operation. No assumed labour time.
export function readAlternatorTime(doc=document){
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const fail=reason=>{throw Error('LABOUR_REVIEW_REQUIRED:'+reason);};
 const operation=/\b(?:Renew|Replace|Remove\s+and\s+refit)\s+(?:the\s+)?alternator\b/i;
 const visible=el=>{for(let n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;if(typeof getComputedStyle==='function'){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden')return false;}}return true;};
 const nodes=[...doc.querySelectorAll('td,span,a,div,p,label')].filter(el=>visible(el)&&clean(el.textContent).length<160&&operation.test(clean(el.textContent))&&![...el.children].some(child=>operation.test(clean(child.textContent))));
 if(nodes.length!==1)fail(nodes.length?'MULTIPLE_OPERATIONS':'OPERATION_NOT_VISIBLE');
 let node=nodes[0],matched=null;
 for(let depth=0;node&&depth<8;depth++,node=node.parentElement){
  const label=clean([...node.childNodes].map(child=>child.innerText||child.textContent).join(' '));if(label.length>350)break;
  const times=[...label.matchAll(/(?:^|\s)(\d{1,2}[.,]\d{2})(?=\s|$)/g)].map(m=>m[1].replace(',','.'));
  if(times.length>1)fail('MULTIPLE_TIMES');
  if(times.length===1){matched={operationText:label,hoursText:times[0]};break;}
 }
 if(!matched)fail('TIME_NOT_FOUND');
 const unitText=clean(doc.body?.innerText||doc.body?.textContent);
 if(!/TOTAL\s*TIME\s*\(H\)/i.test(unitText)&&!/hours\s+and\s+hundredths\s+of\s+hours/i.test(unitText))fail('HOURS_UNIT_NOT_CONFIRMED');
 const hoursMilli=Math.round(Number(matched.hoursText)*1000);
 if(hoursMilli<=0||hoursMilli>100000)fail('INVALID_TIME');
 const plate=doc.querySelector('#numberPlate,input[name="numberPlate"]');
 return {...matched,hoursMilli,unit:'hours',registrationVisible:String(plate?.value||'').toUpperCase().replace(/\s/g,''),fitmentConfirmed:false};
}
