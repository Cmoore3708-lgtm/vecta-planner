// Read-only capture of one visible, priced alternator operation.
export function readAlternatorTime(input={},doc=globalThis.document){
 if(typeof input?.querySelectorAll==='function'){doc=input;input={};}
 const expectedOperationId=input?.operationId||'';
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const fail=reason=>{throw Error('LABOUR_REVIEW_REQUIRED:'+reason);};
 if(expectedOperationId&&!/^[0-9][A-Z0-9]{9,23}$/.test(expectedOperationId))fail('INVALID_OPERATION_ID');
 const operation=/\b(?:Renew|Replace|Remove\s+and\s+refit)\s+(?:the\s+)?alternator\b/i;
 const visible=(el,viewport=!expectedOperationId)=>{
  let bounds=null;if(Number.isFinite(doc.defaultView?.innerHeight)&&doc.defaultView.innerHeight>0&&typeof el.getBoundingClientRect==='function'){
   const r=el.getBoundingClientRect(),view=doc.defaultView;
   if(r.width<=0||r.height<=0)return false;
   if(viewport&&(r.bottom<=0||r.right<=0||r.top>=view.innerHeight||r.left>=view.innerWidth))return false;
   bounds={left:r.left,right:r.right,top:r.top,bottom:r.bottom};
  }
  for(let n=el;n&&n.nodeType===1;n=n.parentElement){
   if(n.hidden||n.getAttribute('aria-hidden')==='true')return false;
   if(typeof getComputedStyle==='function'){
    const style=getComputedStyle(n);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||style.opacity==='0')return false;
    if(bounds&&n!==el&&typeof n.getBoundingClientRect==='function'){
     const r=n.getBoundingClientRect();
     if(/hidden|clip|auto|scroll/.test(style.overflowX||style.overflow||'')){bounds.left=Math.max(bounds.left,r.left);bounds.right=Math.min(bounds.right,r.right);}
     if(/hidden|clip|auto|scroll/.test(style.overflowY||style.overflow||'')){bounds.top=Math.max(bounds.top,r.top);bounds.bottom=Math.min(bounds.bottom,r.bottom);}
     if(bounds.left>=bounds.right||bounds.top>=bounds.bottom)return false;
    }
   }
  }return true;
 };
 const textOf=(node,viewport=!expectedOperationId)=>node.nodeType===3?node.textContent:node.nodeType===1&&!visible(node,viewport)?'':[...node.childNodes].map(child=>textOf(child,viewport)).join(' ');
 const nodes=[...doc.querySelectorAll('td,span,a,div,p,label')].filter(el=>visible(el)&&clean(textOf(el)).length<160&&operation.test(clean(textOf(el)))&&![...el.children].some(child=>operation.test(clean(textOf(child)))));
 if(!nodes.length)fail('OPERATION_NOT_VISIBLE');
 const matches=new Map();let ambiguous=false;
 for(const target of nodes){
  for(let node=target,depth=0;node&&depth<8;depth++,node=node.parentElement){
   const label=clean(textOf(node));
   if(label.length>350||(label.match(new RegExp(operation.source,'ig'))||[]).length>1)break;
   const times=[...label.matchAll(/(?:^|\s)(\d{1,2}[.,]\d{2})(?=\s|$)/g)].map(m=>m[1].replace(',','.'));
   const codes=label.match(/\b[0-9][A-Z0-9]{9,23}\b/g)||[];
   if(times.length&&expectedOperationId&&(codes.length!==1||codes[0]!==expectedOperationId))break;
   if(times.length>1){ambiguous=true;break;}
   if(times.length===1){
    // Identical duplicate DOM rows are one operation; different IDs/times are not.
    const operationId=codes.length===1?codes[0]:'';
    const match={operationText:label,hoursText:times[0],operationId};
    // Different layout wrappers/OE labels must not create different operations.
    const identity=operationId||label.toUpperCase();
    matches.set(identity+'|'+times[0],match);break;
   }
  }
 }
 if(ambiguous)fail('MULTIPLE_TIMES');
 if(matches.size!==1)fail(matches.size?'MULTIPLE_PRICED_OPERATIONS':'TIME_NOT_FOUND');
 const matched=[...matches.values()][0],unitText=clean(textOf(doc.body,false));
 if(!/TOTAL\s*TIME\s*\(H\)/i.test(unitText)&&!/hours\s+and\s+hundredths\s+of\s+hours/i.test(unitText))fail('HOURS_UNIT_NOT_CONFIRMED');
 const hoursMilli=Math.round(Number(matched.hoursText)*1000);
 if(hoursMilli<=0||hoursMilli>100000)fail('INVALID_TIME');
 const plate=doc.querySelector('#numberPlate,input[name="numberPlate"]');
 return {...matched,hoursMilli,unit:'hours',registrationVisible:String(plate?.value||'').toUpperCase().replace(/\s/g,''),fitmentConfirmed:false};
}
// Minimal diagnostic fields only; no page HTML, account text or credentials.
export function repairTimeDiagnostics(doc=document){
 const operation=/\b(?:Renew|Replace|Remove\s+and\s+refit)\s+(?:the\s+)?alternator\b/i;
 const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
 const textOf=n=>n.nodeType===3?n.textContent:[...n.childNodes].map(textOf).join(' ');
 const nodes=[...doc.querySelectorAll('td,span,a,div,p,label')].filter(el=>clean(textOf(el)).length<160&&operation.test(textOf(el))&&![...el.children].some(c=>operation.test(textOf(c))));
 return {matchingLabels:nodes.length,rows:nodes.slice(0,6).map(el=>{
  const ancestors=[];for(let n=el,depth=0;n&&depth<8;n=n.parentElement,depth++){
   const text=clean(textOf(n));if(text.length>350)break;
   const times=[...text.matchAll(/(?:^|\s)(\d{1,2}[.,]\d{2})(?=\s|$)/g)].map(m=>m[1]);
   const operationCodes=(text.match(/\b[A-Z0-9]{8,24}\b/g)||[]).filter(c=>c.length!==17).slice(0,4);
   const rect=typeof n.getBoundingClientRect==='function'?n.getBoundingClientRect():null;
   const geometry=rect?{top:Math.round(rect.top),bottom:Math.round(rect.bottom),height:Math.round(rect.height),width:Math.round(rect.width)}:null;
   const style=typeof getComputedStyle==='function'?getComputedStyle(n):null;
   ancestors.push({depth,tag:n.tagName,times,operationCodes,geometry,...(style?{display:style.display,visibility:style.visibility,overflow:style.overflow}:{} )});if(times.length)break;
  }
  return {operation:(textOf(el).match(operation)||[])[0]||'',ancestors};
 })};
}
