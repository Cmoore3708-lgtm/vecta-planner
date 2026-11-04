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
  return {eml,text,html};
 }
 function open(draft,registration){
  const url=root.URL.createObjectURL(new Blob([draft.eml],{type:'message/rfc822'}));
  const a=root.document.createElement('a');a.href=url;a.download='Vecta-booking-'+String(registration||'confirmation').replace(/[^A-Z0-9]/gi,'')+'.eml';
  root.document.body.appendChild(a);a.click();a.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),60000);
 }
 root.VectaBookingEmailDraft={create,open};
})(window);
