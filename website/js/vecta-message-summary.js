/* Titles for saved conversation entries, including older emails without a subject. */
(()=>{'use strict';
 function visible(item){
  // Delivery notices point back to the real message; keep their audit record
  // without showing a second conversation entry about the notification itself.
  return !(item.kind==='correspondence'&&item.actor==='workshop'&&/^Hi [^\r\n]+\. You have a new message in your Vecta customer portal that needs your attention\.\s+Open your customer portal:\s+https:\/\/[^\s]+\/track[^\s]*\s*$/i.test(String(item.message||'')));
 }
 function progress(item){
  // Older audit entries already contain the status at the time of the change.
  // Only reinterpret generic progress events, never genuine booking/work edits.
  if(item.kind!=='booking_update'||item.message!=='Workshop progress updated.')return null;
  return {
   in_progress:{title:'Work started',message:'Work on the vehicle has started.'},
   work_complete:{title:'Work completed',message:'The mechanic has finished the work. Please wait for confirmation that the vehicle is ready to collect.'},
   ready_to_invoice:{title:'Ready to invoice',message:'The job has been marked ready to invoice.'},
   completed:{title:'Job completed',message:'The job has been marked complete.'},
   booked:{title:'Reset to booked',message:'The job has been returned to booked status.'}
  }[item.details?.status]||null;
 }
 function title(item){
  const update=progress(item);if(update)return update.title;
  const decision=item.decision||item.details?.status;
  if(item.kind==='correspondence'){
   const text=String(item.details?.subject||'')+'\n'+String(item.message||'').slice(0,1500);
   if(/\breminder\b/i.test(text)&&/\bbook(?:ing|ed)\b/i.test(text))return 'Booking reminder';
   if(/\byour booking is confirmed\b|\bconfirm your booking\b|\bbooking confirmation\b/i.test(text))return 'Initial booking confirmation';
   return 'Workshop message';
  }
  return {message:item.actor==='customer'?'Customer message':'Workshop message',note:'Workshop note',preferences:'Parts authorisation',amendment:'Booking amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',approval_response:decision==='approved'?'Work authorised':decision==='declined'?'Work not authorised':'Customer decision',approval_request:'Approval requested',booking_update:'Booking updated'}[item.kind]||'Job update';
 }
 window.VectaMessageSummary={title,progress,visible};
})();
