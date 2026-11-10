(()=>{'use strict';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const mechanic=()=>!!window.VECTA_MECHANIC_DEPLOYMENT;
 const date=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value));
 async function api(action,body={}){const r=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Customer messages are unavailable.');return data;}
 let pendingEvent=new URLSearchParams(location.search).get('portal_event'),popup,active,refreshQueue;
 const panels=new Map(),known=new Set();
 function button(text,fn){const b=node('button',text);b.type='button';b.className='btn';b.onclick=fn;return b;}
 const alertStates={sent:'accepted by provider',pending:'send unconfirmed — check before resending',failed:'send failed',queued:'queued',unavailable:'status unavailable',missing_contact:'missing contact details',no_permission:'customer agreement needed',manual:'tap to send',not_configured:'sender not connected',sender_unverified:'sender domain needs verification',test:'Test only',contact_changed:'contact changed — not sent',closed:'booking closed — not sent'};
 function showAlerts(host,receipt,jobId){
  host.replaceChildren();host.classList.add('portalAlertReceipt');host.setAttribute('role','status');
  const channels=receipt?.channels||{};
  host.append(node('p','Email: '+(alertStates[channels.email]||'status unavailable')+' · WhatsApp: '+(alertStates[channels.whatsapp]||'status unavailable')));
  if(receipt?.manual_url&&/^https:\/\/wa\.me\/\d+\?text=/.test(receipt.manual_url)){
   const link=node('a','Open WhatsApp and tap Send');link.href=receipt.manual_url;link.target='_blank';link.rel='noopener noreferrer';link.className='btn';host.append(link);
  }
  if(receipt?.event_id&&Object.values(channels).some(s=>!['sent','test','closed','contact_changed'].includes(s))){
   const retry=button('Check / retry alerts',async()=>{retry.disabled=true;try{showAlerts(host,await api('portal-alert-retry',{job_id:jobId,event_id:receipt.event_id}),jobId);}catch(e){host.append(node('p',e.message));retry.disabled=false;}});host.append(retry);
  }
 }
 function eventCard(item,canForward,alerts){
  const c=node('article');c.className='portalWorkshopEvent';c.dataset.eventId=item.id;
  const decision=item.decision||item.details?.status;
  const titles={message:'Message',preferences:'Parts authorisation',amendment:'Amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',approval_response:decision==='approved'?'Work authorised':decision==='declined'?'Work not authorised':'Customer decision',approval_request:'Approval requested',booking_update:'Booking updated',correspondence:'Workshop message'};
  c.append(node('strong',titles[item.kind]||'Job update'),node('small',date(item.created_at)),node('p',item.message));
  if(item.details?.requested_date)c.append(node('p','Requested date: '+item.details.requested_date+' — awaiting workshop confirmation.'));
  if(item.details?.work_required)c.append(node('p',item.details.work_required));
  const green=decision==='approved'||item.authorised===true||item.details?.preferences?.serious_repairs==='change_parts',red=decision==='declined'||item.authorised===false||item.details?.preferences?.serious_repairs==='book_later';
  c.dataset.signal=green?'green':red?'red':item.kind==='approval_request'?'amber':'';
  if(Number.isInteger(item.details?.estimated_pence))c.append(node('p','£'+(item.details.estimated_pence/100).toFixed(2)+' including VAT'));
  if(canForward&&item.actor==='customer'){
   const send=button(item.forwarded?'Sent to mechanic':'Send to mechanic',async()=>{send.disabled=true;try{await api('portal-forward',{event_id:item.id});send.textContent='Sent to mechanic';window.dispatchEvent(new Event('vecta-portal-changed'));}catch(e){send.disabled=false;status.textContent=e.message;}});
   send.disabled=item.forwarded;const status=node('p');status.setAttribute('role','status');c.append(send,status);
  }
  if(canForward&&alerts){const delivery=node('div');showAlerts(delivery,alerts,item.job_id);c.append(delivery);}
  return c;
 }
 function mount(modal,job,saved){
  const after=modal.querySelector('.jobWorkSection');if(!after||!saved||job.no_vehicle||job.card_type&&job.card_type!=='job')return;
  const panel=node('section');panel.className='jobFormSection portalWorkshop';panel.dataset.jobId=job.id;
  const heading=node('h3',mechanic()?'Office messages & approvals':'Customer portal & conversation'),consent=node('p'),list=node('div'),status=node('p');status.setAttribute('role','status');
  const enable=button('Enable notifications on this device',async()=>{await window.vectaEnablePortalAlerts?.();});
  panel.append(heading,consent,enable,status,list);after.after(panel);
  let busy=false,key='',older=null;
  async function refresh(before){
   if(busy||!panel.isConnected||document.hidden||!navigator.onLine)return;busy=true;
   try{
    const data=await api('portal-job',{job_id:job.id,...(before?{before}:{})});
    const allowed=data.preferences?.serious_repairs==='change_parts';consent.className='portalWorkshopConsent';consent.dataset.signal=allowed?'green':'red';consent.textContent=allowed?'Additional parts pre-authorised':'Additional parts not pre-authorised — approval required';
    const hash=JSON.stringify([data.events,data.alerts]);
    if(hash!==key){key=hash;const cards=data.events.map(item=>eventCard(item,!mechanic(),data.alerts?.find(a=>a.event_id===item.id)));if(before)list.prepend(...cards);else list.replaceChildren(...cards);}
    if(!data.events.length&&!before)list.append(node('p',mechanic()?'No office messages or approvals yet.':'No messages yet.'));
    older=data.older_cursor;olderButton.hidden=!older;status.textContent='';
   }catch(e){status.textContent=e.message;}finally{busy=false;}
  }
  const olderButton=button('Earlier messages',()=>refresh(older));olderButton.hidden=true;panel.insertBefore(olderButton,list);
  if(!mechanic()){
   const form=node('form'),label=node('label','Reply to customer'),input=node('textarea'),send=node('button','Send message & alerts'),note=node('div');input.rows=3;input.maxLength=3000;input.required=true;label.append(input);send.type='submit';send.className='btn green';
   const permissionLabel=node('label'),permissionBox=node('input'),permissionText=node('span'),permissionStatus=node('p');permissionBox.type='checkbox';permissionLabel.className='portalWhatsappPermission';permissionLabel.hidden=true;permissionLabel.append(permissionBox,permissionText);
   form.append(label,permissionLabel,permissionStatus,send,note);panel.append(form);
   let contact=null;
   api('approval-list',{job_id:job.id}).then(data=>{contact=data.whatsapp;if(contact?.phone&&!contact.unavailable){permissionBox.checked=contact.allowed;permissionText.textContent='Customer agreed to WhatsApp updates on the number ending '+contact.phone.slice(-4);permissionLabel.hidden=false;}}).catch(()=>{});
   permissionBox.onchange=async()=>{permissionBox.disabled=true;send.disabled=true;try{await api('approval-whatsapp-permission',{job_id:job.id,phone:contact.phone,contact_binding:contact.contact_binding,allowed:permissionBox.checked});contact.allowed=permissionBox.checked;permissionStatus.textContent='WhatsApp preference saved.';}catch(e){permissionBox.checked=contact.allowed;permissionStatus.textContent=e.message;}finally{permissionBox.disabled=false;send.disabled=false;}};
   let id=crypto.randomUUID(),sending=false;input.oninput=()=>{if(!sending)id=crypto.randomUUID();};
   form.onsubmit=async e=>{e.preventDefault();if(sending||permissionBox.disabled)return;sending=true;send.disabled=true;permissionBox.disabled=true;note.textContent='Saving your message and preparing customer alerts…';try{const result=await api('portal-reply',{job_id:job.id,id,message:input.value});input.value='';id=crypto.randomUUID();note.replaceChildren(node('p','Message saved in the customer portal.'));const delivery=node('div');showAlerts(delivery,result.alerts,job.id);note.append(delivery);await refresh();}catch(error){note.textContent=error.message;}finally{sending=false;send.disabled=false;permissionBox.disabled=false;}};
  }
  panels.set(job.id,{panel,refresh});refresh();
 }
 function seen(){try{return new Set(JSON.parse(localStorage.getItem('vecta:portal:seen:'+ (mechanic()?'mechanic':'manager'))||'[]'));}catch{return new Set();}}
 function ack(item){const ids=seen();ids.add(item.id);try{localStorage.setItem('vecta:portal:seen:'+(mechanic()?'mechanic':'manager'),JSON.stringify([...ids].slice(-1000)));}catch{}if(pendingEvent===item.id)pendingEvent=null;refreshQueue?.();}
 function install(){
  if(!document.querySelector('main.main>header.top'))return;
  popup=node('aside');popup.className='portalWorkshopPopup';popup.hidden=true;popup.setAttribute('aria-label','Customer portal notification');document.body.append(popup);
  let busy=false;
  refreshQueue=async()=>{
   if(busy||document.hidden||!navigator.onLine)return;busy=true;
   try{
    const {events}=await api('portal-queue');
    const fresh=events.filter(item=>!known.has(item.id));let synced=true;
    if(fresh.length){
     try{synced=typeof window.vectaRefreshPortalJobs==='function'&&await window.vectaRefreshPortalJobs()!==false;}catch{synced=false;}
     // A failed refresh must not acknowledge receipt of the saved job update.
     // Keep its alert visible and retry on the next poll/reconnection.
     if(synced)for(const e of events)known.add(e.id);
     for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);
    }
    const ids=seen(),next=events.find(x=>x.id===pendingEvent)||events.find(x=>!ids.has(x.id));
    if(!next){active=null;popup.hidden=true;return;}
    if(active&&active.id===next.id&&active.forwarded===next.forwarded&&active.synced===synced)return;
    active={...next,synced};popup.hidden=false;popup.replaceChildren(node('strong',(mechanic()?'Job update':'Customer message')+' · '+next.registration),eventCard(next,!mechanic()));
    const message=node('p',synced?'':'Message saved. Reconnecting to update this device’s job card…');message.setAttribute('role','status');
    popup.append(button('Open job card',async()=>{
     if(!next.job_id){message.textContent='This booking is waiting in Website Bookings. Accept it to create its job card.';return;}
     const state=await window.vectaOpenFindingJob?.(next.job_id);
     if(state==='busy'){message.textContent='Save or close your current card, then open this message.';return;}
     if(state==='open'){document.querySelector('.portalWorkshop')?.scrollIntoView({behavior:'smooth',block:'center'});ack(next);}else message.textContent='The job could not be opened. Please retry.';
    }),button('Dismiss',()=>ack(next)),message);
   }catch{}finally{busy=false;}
  };
  window.addEventListener('vecta-portal-changed',()=>{active=null;refreshQueue();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQueue();});window.addEventListener('online',refreshQueue);
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='vecta-portal-notification'){if(e.data.eventId)pendingEvent=e.data.eventId;refreshQueue();}});
  refreshQueue();setInterval(refreshQueue,10000);
  setInterval(()=>{for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);},15000);
 }
 async function confirmation(job){
  const dialog=node('dialog');dialog.className='portalEmailDialog';const title=node('h2','Booking confirmation'),status=node('p','Preparing your formatted email…'),preview=node('iframe');preview.title='Customer confirmation email preview';preview.setAttribute('sandbox','');const send=button('Send confirmation email',async()=>{send.disabled=true;status.textContent='Sending…';try{const result=await api('confirmation-send',{job_id:job.id});status.textContent=result.audit_pending?'Accepted by the email provider; the delivery record needs checking.':'Confirmation email sent.';}catch(e){status.textContent=e.message;send.disabled=false;}});send.disabled=true;
  dialog.append(title,status,preview,send,button('Close',()=>dialog.close()));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  try{const data=await api('confirmation-preview',{job_id:job.id});preview.srcdoc=data.html;status.textContent='To: '+data.email+(data.has_image?' · Includes saved vehicle image.':' · No saved vehicle image available.')+(data.test?' Test preview — email sending is disabled.':'');send.disabled=data.test||data.status==='sent'||data.status==='pending';if(data.status==='sent')send.textContent='Already sent';}catch(e){status.textContent=e.message;}
 }
 window.VectaPortalWorkshop={mount,confirmation};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
