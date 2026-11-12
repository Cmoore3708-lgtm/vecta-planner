/* Titles for saved conversation entries, including older emails without a subject. */
(()=>{'use strict';
 function title(item){
  const decision=item.decision||item.details?.status;
  if(item.kind==='correspondence'){
   const text=String(item.details?.subject||'')+'\n'+String(item.message||'').slice(0,1500);
   if(/\breminder\b/i.test(text)&&/\bbook(?:ing|ed)\b/i.test(text))return 'Booking reminder';
   if(/\byour booking is confirmed\b|\bconfirm your booking\b|\bbooking confirmation\b/i.test(text))return 'Initial booking confirmation';
   return 'Workshop message';
  }
  return {message:item.actor==='customer'?'Customer message':'Workshop message',note:'Workshop note',preferences:'Parts authorisation',amendment:'Booking amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',approval_response:decision==='approved'?'Work authorised':decision==='declined'?'Work not authorised':'Customer decision',approval_request:'Approval requested',booking_update:'Booking updated'}[item.kind]||'Job update';
 }
 window.VectaMessageSummary={title};
})();
