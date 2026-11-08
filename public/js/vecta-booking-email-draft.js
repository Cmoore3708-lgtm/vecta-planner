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
 function open(draft){
  const doc=root.document,previous=doc.getElementById('vectaBookingEmailReady');if(previous)previous.remove();
  const dialog=doc.createElement('dialog');dialog.id='vectaBookingEmailReady';dialog.setAttribute('aria-labelledby','vectaBookingEmailTitle');
  dialog.style.cssText='background:#171717;color:#fff;border:1px solid #555;border-radius:14px;padding:24px;width:calc(100vw - 32px);max-width:440px;max-height:85vh;overflow:auto;box-sizing:border-box;';
  dialog.innerHTML='<h2 id="vectaBookingEmailTitle" style="margin:0 0 12px;font-size:22px;color:#fff">Booking saved</h2>'+
   '<p style="line-height:1.5">Your email app should open with the customer, subject and confirmation already filled in. Review the draft and tap Send. If it did not open, use the button below.</p>'+
   '<p style="overflow-wrap:anywhere">To: '+escape(draft.email)+'</p>'+
   '<button data-booking-email-copy type="button" class="btn green" style="width:100%;min-height:44px;margin:12px 0">Copy formatted email</button>'+
   '<p data-booking-email-status role="status" style="line-height:1.5"></p>'+
   '<a data-booking-email-open class="btn green" style="display:block;text-align:center;padding:14px;margin:12px 0;text-decoration:none" href="'+escape(draft.mailto)+'">Open email app</a>'+
   '<details data-booking-email-preview style="margin:16px 0"><summary>Preview email</summary><div data-booking-email-message style="background:#fff;color:#111;padding:14px;margin-top:12px;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text"></div></details>'+
   '<button data-booking-email-close type="button" class="btn" style="width:100%;min-height:44px">Close</button>';
  const preview=dialog.querySelector('[data-booking-email-message]');
  preview.innerHTML=draft.html.replace(/^.*?<body[^>]*>/i,'').replace(/<\/body>.*$/i,'');
  const copy=dialog.querySelector('[data-booking-email-copy]'),link=dialog.querySelector('[data-booking-email-open]'),status=dialog.querySelector('[data-booking-email-status]');
  copy.onclick=async function(){
   copy.disabled=true;status.textContent='';link.hidden=true;link.style.display='none';
   try{
    // Clipboard writes start directly in the tap handler for Safari/iOS.
    if(!root.navigator?.clipboard?.write||!root.ClipboardItem)throw Error('Formatted copy unavailable');
    await root.navigator.clipboard.write([new root.ClipboardItem({'text/html':new Blob([draft.html],{type:'text/html'}),'text/plain':new Blob([draft.text],{type:'text/plain'})})]);
    status.textContent='Copied. Open your email app, press and hold in the blank message, then choose Paste before sending.';
    link.hidden=false;link.style.display='block';copy.textContent='Copy again';
   }catch{
    status.textContent='Automatic copying is unavailable. Select and copy the message below, then open your email app and paste it before sending.';
    dialog.querySelector('[data-booking-email-preview]').open=true;link.hidden=false;link.style.display='block';
   }finally{copy.disabled=false;}
  };
  doc.body.appendChild(dialog);
  dialog.querySelector('[data-booking-email-close]').onclick=function(){if(typeof dialog.close==='function')dialog.close();dialog.remove();};
  dialog.addEventListener('close',function(){dialog.remove();});
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  // Try the default email handler automatically; keep the manual link as a fallback.
  try{root.location.href=draft.mailto;}catch(error){status.textContent='Your email app did not open automatically. Tap Open email app above.';}
 }
 root.VectaBookingEmailDraft={create,open};
})(window);
