/* Same-origin app/website hand-off. Never reads a session or accepts URL contact data. */
(function(root){'use strict';
 function connect({getForm,render,applyNevos}){
  if(root.parent===root||new URLSearchParams(root.location.search).get('app')!=='1')return null;
  root.document?.documentElement?.classList.add('vecta-app-booking');
  let applied=false;
  const receive=event=>{
   if(applied||event.origin!==root.location.origin||event.source!==root.parent||event.data?.type!=='vecta-garage-prefill')return;
   const data=event.data,form=getForm(),reg=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
   if(!reg(data.registration)||reg(data.registration)!==reg(form.registration))return;
   const profile=data.profile;if(!profile||typeof profile.email!=='string')return;
   // The customer can still edit every contact field before confirming.
   form.customer_name=String(profile.name||'').slice(0,100);form.email=profile.email.slice(0,254);form.phone=String(profile.phone||'').slice(0,40);
   if(['Email','Telephone','WhatsApp'].includes(profile.contact_preference))form.contact_preference=profile.contact_preference;
   form.returning_choice='yes';form.returning_contact=form.email;form.customer_found=true;
   for(const field of ['vehicle','vehicle_make','vehicle_colour'])if(!form[field]&&typeof data[field]==='string')form[field]=data[field].slice(0,200);
   if(!['yes','no'].includes(form.nevos_vehicle)&&['yes','no'].includes(data.nevos_vehicle))applyNevos?.(data.nevos_vehicle);
   root.VectaGarageBooking.prefilled=true;
   applied=true;render();root.removeEventListener('message',receive);
  };
  root.addEventListener('message',receive);root.parent.postMessage({type:'vecta-booking-ready'},root.location.origin);
  return {confirmed(){root.parent.postMessage({type:'vecta-booking-confirmed'},root.location.origin);}};
 }
 root.VectaGarageBooking={connect,rememberNevos(registration,answer){
  if(root.parent!==root&&new URLSearchParams(root.location.search).get('app')==='1'&&['yes','no'].includes(answer))root.parent.postMessage({type:'vecta-nevos-choice',registration,nevos_vehicle:answer},root.location.origin);
 },updateTotal(total){
  if(root.parent!==root&&new URLSearchParams(root.location.search).get('app')==='1')root.parent.postMessage({type:'vecta-booking-total',registration:total.registration,pence:total.pence,pending:total.pending.length>0},root.location.origin);
 }};
})(window);
