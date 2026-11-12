(()=>{'use strict';
 if(window.VECTA_MECHANIC_DEPLOYMENT)return;
 const selector='.job[data-job-id],.mobileJob[data-open-job],.sideJob[data-open-job],.sideJob[data-job-id]';
 const key='vecta:quote-parts:pending:v1',valid=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id);
 const clean=rows=>Array.isArray(rows)?rows.filter(row=>valid(row?.approval_id)&&valid(row?.job_id)).map(({approval_id,job_id})=>({approval_id,job_id})):[];
 let pending=[];try{pending=clean(JSON.parse(localStorage.getItem(key)||'[]'));}catch{}
 let revision=0,polling=false,toast;
 const busy=new Set(),attempts=new Map(),observed=new Set();
 const save=()=>{try{localStorage.setItem(key,JSON.stringify(pending));}catch{}paint();};
 async function api(action,body={}){const response=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save the parts order. Please retry.');return result;}
 function notice(message,undo){
  toast?.remove();toast=document.createElement('div');toast.className='partsOrderNotice';toast.setAttribute('role','status');
  const text=document.createElement('span');text.textContent=message;toast.append(text);
  if(undo){const button=document.createElement('button');button.type='button';button.textContent='Undo';button.onclick=async()=>{button.disabled=true;try{await undo();toast?.remove();}catch(error){text.textContent=error.message;button.disabled=false;}};toast.append(button);}
  const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>toast.remove();toast.append(close);document.body.append(toast);
 }
 const idsFor=job=>pending.filter(row=>row.job_id===job).map(row=>row.approval_id);
 async function ordered(job){
  if(busy.has(job))return;
  if(!navigator.onLine){notice('Reconnect before marking the parts as ordered. The reminder is still active.');return;}
  const ids=idsFor(job);if(!ids.length)return;
  const previous=attempts.get(job),signature=[...ids].sort().join(',');
  const body=previous?.signature===signature?previous.body:{job_id:job,approval_ids:ids,order_id:crypto.randomUUID(),undo:false};
  attempts.set(job,{signature,body});busy.add(job);revision++;paint();
  try{
   const result=await api('parts-order-save',body);
   if(!Array.isArray(result.confirmed_ids)||!Array.isArray(result.undo_ids))throw Error('The order was not confirmed. The reminder is still active.');
   const confirmed=new Set(result.confirmed_ids);pending=pending.filter(row=>!confirmed.has(row.approval_id));attempts.delete(job);save();
   notice('Parts marked as ordered.',result.undo_ids.length?async()=>{
    revision++;
    try{const undone=await api('parts-order-save',{...body,approval_ids:result.undo_ids,undo:true});
     const restored=clean(undone.confirmed_ids.map(approval_id=>({approval_id,job_id:job})));pending=[...new Map([...pending,...restored].map(row=>[row.approval_id,row])).values()];save();
    }finally{revision++;refresh();}
   }:null);
  }catch(error){notice(error.message);}finally{busy.delete(job);revision++;paint();refresh();}
 }
 function reserve(card){
  if(!card.matches('.job.partsOrderHost')||!card.getBoundingClientRect)return;
  const work=card.querySelector('.plannerWorkRequired');if(!work)return;
  const height=Math.max(0,Math.floor(card.getBoundingClientRect().bottom-work.getBoundingClientRect().top-39));
  const value=height+'px';if(card.style.getPropertyValue('--parts-work-height')!==value)card.style.setProperty('--parts-work-height',value);
 }
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{for(const {target} of entries)reserve(target);}):null;
 function paint(){
  for(const card of observed)if(!card.isConnected){resize?.unobserve(card);observed.delete(card);}
  for(const card of document.querySelectorAll(selector)){
   const job=card.dataset.jobId||card.dataset.openJob,ids=idsFor(job);let badge=card.querySelector('.partsOrderBadge');
   if(!ids.length){badge?.remove();card.classList.remove('partsOrderHost');card.style.removeProperty('--parts-work-height');continue;}
   card.classList.add('partsOrderHost');
   if(!badge){
    badge=document.createElement(card.tagName==='BUTTON'?'span':'button');badge.className='partsOrderBadge';
    if(badge.tagName==='BUTTON')badge.type='button';else{badge.setAttribute('role','button');badge.tabIndex=0;badge.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();ordered(job);}};}
    badge.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/></svg><span>Order parts</span>';
    badge.title='Parts need ordering — click when ordered';badge.setAttribute('aria-label','Parts need ordering — mark as ordered');
    badge.onpointerdown=badge.onmousedown=e=>e.stopPropagation();badge.ondragstart=e=>{e.preventDefault();e.stopPropagation();};
    badge.onclick=e=>{e.preventDefault();e.stopPropagation();ordered(job);};card.append(badge);
   }
   badge.disabled=busy.has(job);badge.setAttribute('aria-disabled',String(busy.has(job)));badge.lastElementChild.textContent=busy.has(job)?'Saving…':'Order parts';
   reserve(card);if(resize&&!observed.has(card)){observed.add(card);resize.observe(card);}
  }
 }
 async function refresh(){
  if(polling||document.hidden||!navigator.onLine)return;polling=true;const started=revision;
  try{let after;const rows=[];do{const page=await api('parts-order-queue',after?{after}:{});if(!Array.isArray(page.reminders))throw Error('Parts reminder refresh unavailable');rows.push(...page.reminders);after=page.next_cursor;}while(after);
   if(started===revision){pending=clean(rows);save();}
  }catch{/* Retain last confirmed warnings when the network or server is unavailable. */}finally{polling=false;}
 }
 function install(){
  const root=document.querySelector('main.main');if(!root)return;
  paint();refresh();setInterval(refresh,15000);
  if(typeof MutationObserver!=='undefined')new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.(selector)||n.querySelector?.(selector)))))paint();}).observe(root,{subtree:true,childList:true});
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);window.addEventListener('vecta-portal-changed',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('storage',e=>{if(e.key===key){revision++;try{pending=clean(JSON.parse(localStorage.getItem(key)||'[]'));paint();}catch{}refresh();}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
