(function(root){
 'use strict';
 const logoBrands=new Set('accelera bridgestone continental cooper dunlop falken goodyear hankook imperial kumho lassa michelin nankang pirelli radar toyo uniroyal vredestein yokohama'.split(' '));
 function brandLogo(brand){const name=String(brand||'').trim(),key=name.toLowerCase().replace(/\s+(?:tyres?|tires?)$/,'');const text=name.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));return `<span class="tyre-brand-logo">${logoBrands.has(key)?`<img src="/assets/tyre-brands/${key}.png" alt="${text}" width="130" height="40" loading="lazy" decoding="async">`:`<span class="tyre-guide-brand">${text||'&nbsp;'}</span>`}</span>`;}
 // Keep the same white panel when an image is unavailable.
 root.document?.addEventListener('error',event=>{const img=event.target;if(img?.parentElement?.classList.contains('tyre-brand-logo')){const fallback=root.document.createElement('span');fallback.className='tyre-guide-brand';fallback.textContent=img.alt;img.replaceWith(fallback);}},true);
 const categories=['budget','midrange','premium'];
 function sizeKey(value){const m=String(value||'').trim().match(/^(\d{3})\s*[/ ]\s*(\d{2})\s*(?:R|[/ ])\s*(\d{2})$/i);if(!m)return null;const [w,p,r]=m.slice(1).map(Number);return w>=125&&w<=355&&w%5===0&&p>=20&&p<=85&&p%5===0&&r>=10&&r<=24?`${w}/${p}R${r}`:null;}
 function cleanResult(data,size,quantity){
  if(data?.status!=='MATCHED'||data.guideOnly!==true||data.size!==size||data.quantity!==quantity||!Array.isArray(data.options)||data.options.length!==3)throw Error('Guide unavailable');
  const checkedAt=new Date(data.checkedAt).toISOString();
  if(Date.now()-Date.parse(checkedAt)>300000||Date.parse(checkedAt)>Date.now()+60000)throw Error('Guide expired');
  const options=categories.map(category=>{const matches=data.options.filter(o=>o.category===category);if(matches.length!==1)throw Error('Invalid categories');const o=matches[0];if(o.available!==true)return{category,available:false};if(!Number.isSafeInteger(o.unitPence)||o.unitPence<=0||o.unitPence>500000||o.totalPence!==o.unitPence*quantity)throw Error('Invalid guide');return{category,available:true,brand:String(o.brand||'').slice(0,70),model:String(o.model||'').slice(0,120),unitPence:o.unitPence,totalPence:o.totalPence};});
  return{size,quantity,checkedAt,guideOnly:true,options};
 }
 function createController({onChange=()=>{},fetchGuide=async(size,quantity,signal)=>{const r=await fetch('/api/availability?tyres=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({size,quantity}),signal});if(!r.ok)throw Error('Guide unavailable');return r.json();},delay=600}={}){
  let sequence=0,timer,expiry,request,state={status:'idle',result:null},key='';const cache=new Map();
  const emit=(status,result=null)=>{clearTimeout(expiry);state={status,result};onChange(state);if(status==='matched'){expiry=setTimeout(()=>{if(state.result===result)emit('unavailable');},Math.max(1,300000-(Date.now()-Date.parse(result.checkedAt))));expiry.unref?.();}};
  return{getState:()=>state,update(value,quantity=1){const size=sizeKey(value);const next=size&&Number.isInteger(quantity)&&quantity>=1&&quantity<=4?size+':'+quantity:'';
   if(next&&next===key&&(['waiting','loading'].includes(state.status)||(state.status==='matched'&&Date.now()-Date.parse(state.result.checkedAt)<300000)))return;
   sequence++;const current=sequence;clearTimeout(timer);request?.abort();key=next;
   if(!next){emit('idle');return;}
   const saved=cache.get(next);if(saved&&Date.now()-Date.parse(saved.checkedAt)<300000){emit('matched',saved);return;}
   emit('waiting');timer=setTimeout(async()=>{request=new AbortController();const abort=request;const timeout=setTimeout(()=>abort.abort(),50000);emit('loading');try{let data=await fetchGuide(size,quantity,abort.signal);if(current!==sequence||abort.signal.aborted)return;if(data?.status==='UNAVAILABLE'){data=await fetchGuide(size,quantity,abort.signal);if(current!==sequence||abort.signal.aborted)return;}const result=cleanResult(data,size,quantity);if(cache.size>=30)cache.delete(cache.keys().next().value);cache.set(next,result);emit('matched',result);}catch{if(current===sequence)emit('unavailable');}finally{clearTimeout(timeout);}},delay);
  },dispose(){sequence++;clearTimeout(timer);clearTimeout(expiry);request?.abort();}};
 }
 root.VectaTyreBooking={createController,sizeKey,cleanResult,brandLogo};
})(typeof window!=='undefined'?window:globalThis);
