(()=>{'use strict';
 const token=location.hash.slice(1);if(!token)return;
 const $=id=>document.getElementById(id),node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const date=value=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',...(value.includes('T')?{timeStyle:'short'}:{}),timeZone:'Europe/London'}).format(new Date(value.includes('T')?value:value+'T12:00:00Z')):'Date not recorded';
 const root=$('customerPortal'),history=$('portalHistory'),form=$('portalForm'),dialog=$('portalDialog');
 let current=null,busy=false,sending=false,kind='message',requestId=null,older=null,timer,historyKey='',cancelled=false;
 const events=new Map(),announced=new Set();
 async function api(action,body={}){
  const r=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token,...body}),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'The portal is unavailable. Please try again.');return data;
 }
 const labels={message:'Message',amendment:'Booking amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',preferences:'Authorisation updated',booking_update:'Booking updated',approval_request:'Work requested',approval_response:'Customer decision',correspondence:'Workshop message'};
 function colour(item){if(item.kind==='preferences')return item.details?.preferences?.serious_repairs==='change_parts'?'green':'red';const s=item.details?.status;return s==='approved'?'green':s==='declined'?'red':item.kind==='approval_request'||item.kind==='amendment'||item.kind==='additional_work'?'amber':'';}
 function renderHistory(){
  const ordered=Array.from(events.values()).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.seq-b.seq),key=JSON.stringify(ordered);
  if(key===historyKey)return;historyKey=key;history.replaceChildren();
  for(const item of ordered){
   const card=node('article');card.className='portalEvent';card.dataset.signal=colour(item);
   const heading=node('div');heading.className='portalEventHeading';heading.append(node('strong',(item.actor==='customer'?'You · ':'Vecta · ')+(labels[item.kind]||'Update')),node('time',date(item.created_at)));
   card.append(heading);
   if(item.details?.status==='approved'||item.details?.status==='declined'){const badge=node('span',item.details.status==='approved'?'Authorised':'Not authorised');badge.className='portalSignal';card.append(badge);}
   // Raw tracking credentials in historical email bodies stay out of the view.
   card.append(node('p',String(item.message||'').replace(/https:\/\/[^\s]+\/track[^\s]*/g,'[Your personalised portal]')));
   if(item.details?.requested_date)card.append(node('p','Requested date: '+date(item.details.requested_date)+'. Your current date stays booked until Vecta confirms the change.'));
   if(item.details?.work_required)card.append(node('p',item.details.work_required));
   if(Number.isInteger(item.details?.estimated_pence))card.append(node('b','£'+(item.details.estimated_pence/100).toFixed(2)+' including VAT'));
   if(item.details?.delivery==='prepared')card.append(node('small','Email draft prepared — sending has not been confirmed.'));
   history.append(card);
  }
 }
 function showApproval(item){window.VectaProgressApproval?.open(item.id);}
 function render(data){
  current=data;root.hidden=false;$('portalConversation').hidden=false;
  const b=data.booking;cancelled=b.cancelled;
  document.title='Your customer portal | Vecta Motors';
  $('portalHeading').hidden=false;$('portalHeading').textContent='Your customer portal';
  $('portalAuthorisation').dataset.signal=data.preferences?.serious_repairs==='change_parts'?'green':'red';
  $('portalAuthorisationTitle').textContent=data.preferences?.serious_repairs==='change_parts'?'Additional parts pre-authorised':'Additional parts not pre-authorised';
  $('portalAuthorisationText').textContent=data.preferences?.serious_repairs==='change_parts'?'If we find a serious repair and cannot reach you, you have asked us to change the parts.':'We need your approval before fitting additional parts.';
  $('portalParts').textContent=data.preferences?'Your parts preference: '+({budget:'Budget',mid_range:'Mid range',oem:'OEM'}[data.preferences.parts]):'No parts preference recorded.';
  $('portalAmend').hidden=!b.can_amend;$('portalPreferences').hidden=!b.can_amend;$('portalAddWork').hidden=!b.can_amend;$('portalCancel').hidden=!b.can_cancel;$('portalMessage').hidden=!b.can_message;
  $('portalDeadline').textContent=b.cancelled?'Your cancellation is recorded below.':b.can_cancel?'Cancel online until '+date(b.cancellation_deadline)+'.':!b.can_amend?'For booking changes, please contact the workshop.':'Online cancellation has closed. Please call us if you need to cancel.';
  const o=data.original;if(o){$('portalOriginalDate').textContent='Booking created: '+date(o.created_at);$('portalOriginalWork').textContent='Booked for '+date(o.booking_date)+'\n'+o.work_required;$('portalOriginalLegacy').hidden=!o.legacy;}
  for(const e of data.events)events.set(e.id,e);if(!older)older=data.older_cursor;
  $('portalOlder').hidden=!older;renderHistory();
  const approvals=$('portalApprovals');approvals.replaceChildren();
  for(const item of data.approvals){const button=node('button',(item.status==='pending'?'Approval needed':item.status==='approved'?'Authorised':item.status==='declined'?'Not authorised':'Closed')+' · '+item.message);button.type='button';button.className='portalApproval';button.dataset.signal=item.status==='approved'?'green':item.status==='declined'?'red':'amber';button.onclick=()=>showApproval(item);approvals.append(button);}
  const pending=data.approvals.find(item=>item.status==='pending'&&!announced.has(item.id));
  if(pending&&!$('approvalDialog').open&&!dialog.open){announced.add(pending.id);showApproval(pending);}
  if(cancelled){$('identity').hidden=false;$('registration').textContent=b.registration;$('vehicle').textContent=b.vehicle;$('bookingDate').textContent='Booking date: '+date(b.booking_date);$('statusTitle').textContent='Your booking is cancelled';$('statusDescription').textContent='Your reason and cancellation are saved in your conversation.';$('error').hidden=true;$('steps').hidden=true;$('progressScene').hidden=true;$('sceneCaption').hidden=true;}
 }
 async function refresh(){
  clearTimeout(timer);if(busy||document.hidden)return;busy=true;
  try{render(await api('portal-status'));$('portalError').textContent='';form.querySelector('button[type="submit"]').disabled=false;}
  catch(e){$('portalError').textContent=e.message+' Your last displayed conversation may be out of date.';form.querySelector('button[type="submit"]').disabled=true;}
  finally{busy=false;timer=setTimeout(refresh,15000);}
 }
 function compose(action){
  kind=action;requestId=crypto.randomUUID();form.reset();$('portalFormStatus').textContent='';
  $('portalFormTitle').textContent={message:'Message the workshop',amendment:'Amend your booking',additional_work:'Request additional work',cancelled:'Cancel your booking',preferences:'Your parts & authorisation'}[action];
  $('portalMessageFields').hidden=action==='preferences';$('portalDateField').hidden=action!=='amendment';$('portalPreferenceFields').hidden=action!=='preferences';
  $('portalMessageLabel').textContent=action==='cancelled'?'Why are you cancelling?':action==='amendment'?'What would you like to change?':action==='additional_work'?'What else would you like us to do?':'Your message';
  $('portalText').required=action!=='preferences';$('portalText').disabled=action==='preferences';
  $('portalRequestedDate').min=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London'}).format(new Date(Date.now()+86400000));
  $('portalPartChoice').value=current?.preferences?.parts||'mid_range';$('portalRepairChoice').value=current?.preferences?.serious_repairs||'book_later';
  $('portalFormHint').textContent=action==='amendment'?'We will confirm any date or work changes. Your current booking remains in place until then.':action==='additional_work'?'We will confirm availability and any additional price before carrying out the work.':action==='cancelled'?'This will cancel your booking. We will keep your reason in the conversation history.':'';
  $('portalSubmit').textContent=action==='cancelled'?'Confirm cancellation':action==='preferences'?'Save preferences':'Send to workshop';
  dialog.showModal();(action==='preferences'?$('portalPartChoice'):$('portalText')).focus();
 }
 for(const [id,action] of [['portalMessage','message'],['portalAmend','amendment'],['portalAddWork','additional_work'],['portalCancel','cancelled'],['portalPreferences','preferences']])$(id).onclick=()=>compose(action);
 $('portalFormClose').onclick=()=>dialog.close();
 form.onsubmit=async e=>{
  e.preventDefault();if(sending)return;sending=true;$('portalSubmit').disabled=true;$('portalFormStatus').textContent='Saving…';
  const body={id:requestId,kind,message:$('portalText').value,requested_date:$('portalRequestedDate').value,preferences:{version:1,parts:$('portalPartChoice').value,serious_repairs:$('portalRepairChoice').value}};
  try{await api('portal-write',body);dialog.close();await refresh();window.dispatchEvent(new Event('vecta-portal-updated'));}
  catch(error){$('portalFormStatus').textContent=error.message;}
  finally{sending=false;$('portalSubmit').disabled=false;}
 };
 // Editing after a failed/uncertain send starts a new operation; an unchanged
 // retry keeps its original UUID and cannot duplicate the saved message.
 form.addEventListener('input',()=>{if(!sending)requestId=crypto.randomUUID();});
 $('portalOlder').onclick=async()=>{if(!older)return;$('portalOlder').disabled=true;try{const data=await api('portal-status',{before:older});for(const e of data.events)events.set(e.id,e);older=data.older_cursor;$('portalOlder').hidden=!older;renderHistory();}catch(e){$('portalError').textContent=e.message;}finally{$('portalOlder').disabled=false;}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);window.addEventListener('vecta-approval-decided',refresh);
 window.VectaCustomerPortal={refresh,isCancelled:()=>cancelled};refresh();
})();
