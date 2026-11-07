(function(root){
 'use strict';
 const sentence='Track your car on the day of your booking by clicking HERE.';
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const base64=value=>root.btoa(unescape(encodeURIComponent(value)));
 function create({email,subject,body,trackingUrl}){
  if(!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw Error('Please check the customer email address.');
  let url=new URL(trackingUrl);
  if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid tracking link.');
  const link=url.href;
  const text=body.replace(sentence,'Track your car on the day of your booking: '+link);
  const html='<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">'+escape(body).replace(escape(sentence),'Track your car on the day of your booking by clicking <a href="'+escape(link)+'">HERE</a>.').replace(/\r?\n/g,'<br>')+'</body></html>';
  const encode=value=>base64(value).match(/.{1,76}/g).join('\r\n');
  const boundary='vecta-booking-draft';
  const eml=['X-Unsent: 1','To: '+email,'Subject: =?UTF-8?B?'+base64(subject.replace(/[\r\n]/g,' '))+'?=','MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(text),'--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',encode(html),'--'+boundary+'--',''].join('\r\n');
  const mailto='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject.replace(/[\r\n]/g,' '))+'&body='+encodeURIComponent(text);
  return {eml,text,html,mailto,email};
 }
 function mobileDevice(){
  const nav=root.navigator||{};
  return !!(nav.userAgentData&&nav.userAgentData.mobile)||/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||(/Mac/i.test(nav.platform||'')&&nav.maxTouchPoints>1);
 }
 function open(draft){
  const doc=root.document,previous=doc.getElementById('vectaBookingEmailReady');if(previous)previous.remove();
  const dialog=doc.createElement('dialog');dialog.id='vectaBookingEmailReady';dialog.setAttribute('aria-labelledby','vectaBookingEmailTitle');
  dialog.style.cssText='background:#171717;color:#fff;border:1px solid #555;border-radius:14px;padding:24px;width:calc(100vw - 32px);max-width:440px;max-height:85vh;overflow:auto;box-sizing:border-box;';
  dialog.innerHTML='<h2 id="vectaBookingEmailTitle" style="margin:0 0 12px;font-size:22px;color:#fff">Booking saved</h2>'+
   '<p style="line-height:1.5">Your confirmation email is ready. Open your email app, then tap Send.</p>'+
   '<p style="overflow-wrap:anywhere">To: '+escape(draft.email)+'</p>'+
   '<a data-booking-email-open class="btn green" style="display:block;text-align:center;padding:14px;margin:20px 0 12px;text-decoration:none" href="'+escape(draft.mailto)+'">Open email app</a>'+
   '<button data-booking-email-close type="button" class="btn" style="width:100%;min-height:44px">Close</button>';
  doc.body.appendChild(dialog);
  dialog.querySelector('[data-booking-email-close]').onclick=function(){if(typeof dialog.close==='function')dialog.close();dialog.remove();};
  dialog.addEventListener('close',function(){dialog.remove();});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  // Saving and fetching the tracking link can outlive iOS's tap permission.
  // Keep a real link available for a fresh tap, even if an automatic launch fails.
  const activation=(root.navigator||{}).userActivation;
  if(!mobileDevice()||(activation&&activation.isActive)){try{root.location.href=draft.mailto;}catch(error){/* The visible link remains available. */}}
 }
 root.VectaBookingEmailDraft={create,open};
})(window);
