(function(root){
 'use strict';
 const doc=root.document,current=doc.querySelector('meta[name="vecta-booking-version"]')?.content;
 if(!current)return;
 let busy=false,lastCheck=0;
 async function check(force=false){
  if(busy||doc.hidden||doc.querySelector('.success')||(!force&&Date.now()-lastCheck<20000))return;
  busy=true;lastCheck=Date.now();
  try{
   const response=await root.fetch('/booking?version-check='+Date.now(),{cache:'no-store',signal:root.AbortSignal.timeout(5000)});if(!response.ok)return;
   const html=await response.text(),next=html.match(/<meta name="vecta-booking-version" content="([A-Za-z0-9._-]{1,80})">/)?.[1];
   if(!next||next===current||doc.getElementById('bookingUpdateNotice'))return;
   const notice=doc.createElement('aside');notice.id='bookingUpdateNotice';notice.setAttribute('role','status');
   notice.style.cssText='margin:12px 0;padding:14px 16px;border:1px solid #e35a69;border-radius:10px;background:#251b22;color:#fff;font:14px/1.5 Arial';
   const text=doc.createElement('span');text.textContent='A newer booking page is available. Your current details are still here. ';
   const link=doc.createElement('a');link.href='/booking?v='+encodeURIComponent(next);link.target='_blank';link.rel='noopener';link.textContent='Open the latest version';link.style.cssText='color:#ffbbc3;font-weight:700;text-decoration:underline';
   notice.append(text,link);(doc.querySelector('.shell')||doc.body).prepend(notice);
  }catch{ /* A version check must never interrupt a customer’s booking. */ }
  finally{busy=false;}
 }
 root.addEventListener('pageshow',()=>check());
 doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)check();});
 const timer=root.setInterval(()=>check(),60000);timer.unref?.();
 root.VectaBookingUpdates={check};
})(window);
