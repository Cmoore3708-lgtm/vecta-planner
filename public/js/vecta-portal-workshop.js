(()=>{'use strict';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const mechanic=()=>!!window.VECTA_MECHANIC_DEPLOYMENT;
 const date=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value));
 async function api(action,body={}){const r=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Customer messages are unavailable.');return data;}
 let pendingEvent=new URLSearchParams(location.search).get('portal_event'),popup,active,refreshQueue;
 const panels=new Map(),known=new Set();
 // Pop-up dismissal and reading are separate: hiding a notification must not
 // clear the persistent badge. The server shares receipts across this role’s devices.
 const readKey=()=> 'vecta:portal:read:'+(mechanic()?'mechanic':'manager');
 function readIds(){try{const ids=JSON.parse(localStorage.getItem(readKey())||'[]');return new Set(Array.isArray(ids)?ids:[]);}catch{return new Set();}}
 const inboxKey=()=> 'vecta:portal:inbox:'+(mechanic()?'mechanic':'manager');
 function cachedInbox(){try{const items=JSON.parse(localStorage.getItem(inboxKey())||'[]');return Array.isArray(items)?items:[];}catch{return [];}}
 let inbox=cachedInbox(),read=readIds();
 const reading=new Set();
 const cardSelector='.job[data-job-id],.mobileJob[data-open-job],.sideJob[data-open-job],.sideJob[data-job-id]';
 const incoming=item=>mechanic()?item.forwarded:item.actor==='customer';
 function unread(items){return items.filter(item=>incoming(item)&&!read.has(item.id));}
 function paintBadges(){
  const counts=new Map();for(const item of unread(inbox))if(item.job_id)counts.set(item.job_id,(counts.get(item.job_id)||0)+1);
  for(const card of document.querySelectorAll(cardSelector)){
   const id=card.dataset.jobId||card.dataset.openJob,count=counts.get(id)||0;
   let badge=card.querySelector('.portalMessageBadge');
   const descriptions=card.querySelectorAll('.plannerWorkRequired,.mechanicJobDescription,.provisionalWork,:scope>b,:scope>p');
   for(const description of descriptions)description.classList.toggle('portalMessageText',!!count);
   if(!count){badge?.remove();card.classList.remove('portalMessageHost');continue;}
   card.classList.add('portalMessageHost');
   if(!badge){
    // Some cards are already native buttons; never nest a button inside one.
    badge=node(card.tagName==='BUTTON'?'span':'button');badge.className='portalMessageBadge';
    if(badge.tagName==='BUTTON')badge.type='button';
    const icon=node('span','✉');icon.setAttribute('aria-hidden','true');badge.append(icon,node('span'));card.append(badge);
    badge.onpointerdown=e=>e.stopPropagation();badge.onmousedown=e=>e.stopPropagation();badge.ondragstart=e=>{e.preventDefault();e.stopPropagation();};
    badge.addEventListener('click',async e=>{
     e.preventDefault();e.stopPropagation();
     try{
      const state=await window.vectaOpenFindingJob?.(id);
      if(state!=='open')throw Error(state==='busy'?'Save or close your current card, then open this message.':'The job could not be opened. Please retry.');
      const panel=panels.get(id)?.panel;
      panel?.scrollIntoView({behavior:'smooth',block:'center'});
      const heading=panel?.querySelector('h3');heading?.focus({preventScroll:true});
      const latest=unread(inbox).find(item=>item.job_id===id);
      if(latest)await panels.get(id)?.openMessage(latest);
     }catch(error){window.alert?.(error.message);}
    });
   }
   const label=count+' unread '+(mechanic()?'office update':'customer message')+(count===1?'':'s')+' — open conversation';
   if(badge.getAttribute('aria-label')!==label){badge.setAttribute('aria-label',label);badge.title=label;badge.lastElementChild.textContent=String(count);}
  }
 }
 function refreshReadState(){for(const id of readIds())read.add(id);paintBadges();for(const p of panels.values())if(p.panel.isConnected)p.updateRead?.();}
 function rememberRead(ids){
  for(const id of ids)read.add(id);
  try{localStorage.setItem(readKey(),JSON.stringify([...read]));}catch{}
  if(read.has(pendingEvent))pendingEvent=null;
  if(active&&read.has(active.id)){active=null;if(popup)popup.hidden=true;}
  refreshReadState();
  // Remove delivered notifications belonging to messages confirmed read by the
  // server. This also runs when another device's receipt arrives on resume.
  Promise.resolve(navigator.serviceWorker?.getRegistration?.()).then(async registration=>{
   for(const notification of await registration?.getNotifications?.()||[]){
    const id=notification.tag?.replace(/^vecta-portal-/,'');if(read.has(id))notification.close();
   }
  }).catch(()=>{});
 }
 async function saveReadIds(ids){
  ids=[...new Set(ids)].filter(id=>!reading.has(id));if(!ids.length)return;
  for(const id of ids)reading.add(id);
  try{
   for(let offset=0;offset<ids.length;offset+=100){
    const result=await api('portal-read',{event_ids:ids.slice(offset,offset+100)});
    if(!Array.isArray(result.read_ids))throw Error('Unable to confirm the shared read status.');
    rememberRead(result.read_ids);
   }
  }finally{for(const id of ids)reading.delete(id);}
 }
 async function markRead(items){
  await saveReadIds(unread(items).map(item=>item.id));
  refreshQueue?.();
 }
 function receiveReadState(items){rememberRead(items.filter(item=>item.read_at).map(item=>item.id));}

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
  const c=node('details');c.className='portalWorkshopEvent';c.dataset.eventId=item.id;
  const decision=item.decision||item.details?.status;
  const titles={message:'Message',preferences:'Parts authorisation',amendment:'Amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',approval_response:decision==='approved'?'Work authorised':decision==='declined'?'Work not authorised':'Customer decision',approval_request:'Approval requested',booking_update:'Booking updated',correspondence:'Workshop message'};
  const heading=node('summary');heading.className='portalWorkshopEventHeading';
  const timestamp=node('time',date(item.created_at));timestamp.dateTime=item.created_at;
  heading.append(node('strong',window.VectaMessageSummary?.title(item)||titles[item.kind]||'Job update'),timestamp);
  const progress=window.VectaMessageSummary?.progress?.(item);
  const body=node('div');body.className='portalWorkshopEventBody';c.append(heading,body);body.append(node('p',progress?.message||item.message));
  if(item.details?.requested_date)body.append(node('p','Requested date: '+item.details.requested_date+' — awaiting workshop confirmation.'));
  if(item.details?.work_required&&!progress)body.append(node('p',item.details.work_required));
  const green=decision==='approved'||item.authorised===true||item.details?.preferences?.serious_repairs==='change_parts',red=decision==='declined'||item.authorised===false||item.details?.preferences?.serious_repairs==='book_later';
  c.dataset.signal=green?'green':red?'red':item.kind==='approval_request'?'amber':'';
  if(Number.isInteger(item.details?.estimated_pence))body.append(node('p','£'+(item.details.estimated_pence/100).toFixed(2)+' including VAT'));
  if(canForward&&item.actor==='customer'){
   const send=button(item.forwarded?'Sent to mechanic':'Send to mechanic',async()=>{send.disabled=true;try{await api('portal-forward',{event_id:item.id});send.textContent='Sent to mechanic';window.dispatchEvent(new Event('vecta-portal-changed'));}catch(e){send.disabled=false;status.textContent=e.message;}});
   send.disabled=item.forwarded;const status=node('p');status.setAttribute('role','status');body.append(send,status);
  }
  if(canForward&&alerts){const details=node('details'),delivery=node('div');details.className='portalDeliveryDetails';details.append(node('summary','Alert delivery'),delivery);showAlerts(delivery,alerts,item.job_id);body.append(details);}
  c.addEventListener('toggle',()=>{if(c.open&&c.isConnected&&!document.hidden&&incoming(item))markRead([item]).catch(()=>{c.title='Read status could not sync. Reopen this message or use Mark messages as read to retry.';});});
  return c;
 }
 function mount(modal,job,saved){
  if(saved&&!mechanic()&&(job.website_request_id||/website booking/i.test(job.source||job.booking_source||'')||window.VectaBookingRules?.requestIdFromJob(job)))window.vectaMarkWebsiteBookingRead?.({job_id:job.id});
  const after=modal.querySelector('.jobInternalNotesSection')||modal.querySelector('.jobWorkSection');if(!after||!saved||job.no_vehicle||job.card_type&&job.card_type!=='job')return;
  const panel=node('section');panel.className='jobFormSection portalWorkshop';panel.dataset.jobId=job.id;
  const heading=node('h3',mechanic()?'Office messages & approvals':'Customer messages & updates'),consent=node('p'),list=node('div'),status=node('p');status.setAttribute('role','status');
  const notifications=node('div'),notificationNote=node('p');
  const enable=button('Allow device notifications',async()=>{enable.disabled=true;try{await window.vectaEnablePortalAlerts?.();}finally{enable.disabled=false;updateNotifications();}});
  function updateNotifications(){
   const state=window.vectaPortalAlertsState?.();
   notifications.hidden=!state||state.status==='enabled';
   enable.hidden=!state?.canEnable;
   notificationNote.textContent=state?.message||'';
  }
  notifications.className='portalDeviceNotifications';notificationNote.setAttribute('role','status');notifications.append(notificationNote,enable);updateNotifications();
  heading.tabIndex=-1;
  const readButton=button('Mark messages as read',async()=>{readButton.disabled=true;try{await markRead(visibleEvents());status.textContent='Read status saved across your devices.';}catch{status.textContent='Unable to sync the read status. The message alert is still active. Reconnect and retry.';}finally{readButton.disabled=false;}});
  readButton.classList.add('portalMarkRead');readButton.hidden=true;
  const header=node('div');header.className='portalWorkshopHeading';header.append(heading,readButton);
  panel.append(header,consent,notifications,status,list);after.after(panel);
  let busy=false,key='',older=null,visibleCount=5,paged=false;const displayed=new Map(),receipts=new Map();let latestIds=[];
  const orderedEvents=()=>[...displayed.values()].filter(item=>window.VectaMessageSummary?.visible?.(item)!==false).sort((a,b)=>b.created_at.localeCompare(a.created_at)||Number(b.seq||0)-Number(a.seq||0));
  const visibleEvents=()=>orderedEvents().slice(0,visibleCount);
  function renderMessages(){
   const ordered=orderedEvents();
   const hash=JSON.stringify([ordered,[...receipts],visibleCount]);
   if(hash!==key){
    const expanded=new Set([...list.querySelectorAll('.portalWorkshopEvent[open]')].map(card=>card.dataset.eventId));
    key=hash;const cards=ordered.slice(0,visibleCount).map(item=>eventCard(item,!mechanic(),receipts.get(item.id)));
    if(!cards.length){const empty=node('p',mechanic()?'No office messages or approvals yet.':'No messages yet.');empty.className='portalWorkshopEmpty';cards.push(empty);}
    for(const card of cards)if(expanded.has(card.dataset.eventId))card.setAttribute('open','');
    list.replaceChildren(...cards);
   }
   olderButton.hidden=ordered.length<=visibleCount&&!older;latestButton.hidden=visibleCount<=5;updateRead();
  }
  function updateRead(){const count=unread(visibleEvents()).length;readButton.hidden=!count;readButton.textContent='Mark '+count+' '+(count===1?'message':'messages')+' as read';}

  async function refresh(before){
   if(busy||!panel.isConnected||document.hidden||!navigator.onLine)return;busy=true;
   try{
    const data=await api('portal-job',{job_id:job.id,...(before?{before}:{})});
    const allowed=data.preferences?.serious_repairs==='change_parts';consent.className='portalWorkshopConsent';consent.dataset.signal=allowed?'green':'red';consent.textContent=allowed?'Additional parts pre-authorised':'Additional parts not pre-authorised — approval required';
    if(!before){
     // Retain entries that roll beyond the first server page as new messages arrive.
     const floor=data.events.length?Math.min(...data.events.map(item=>Number(item.seq)||0)):0;
     if(!data.events.length){displayed.clear();receipts.clear();paged=false;}
     for(const id of latestIds)if((Number(displayed.get(id)?.seq)||0)>=floor){displayed.delete(id);receipts.delete(id);}
     latestIds=data.events.map(item=>item.id);
    }
    receiveReadState(data.events);
    for(const item of data.events)displayed.set(item.id,item);
    for(const receipt of data.alerts||[])receipts.set(receipt.event_id,receipt);
    if(before){paged=true;older=data.older_cursor;visibleCount+=5;}else if(!paged)older=data.older_cursor;
    renderMessages();status.textContent='';
   }catch(e){status.textContent=e.message;}finally{busy=false;}
  }
  const olderButton=button('Show earlier messages',()=>{if(orderedEvents().length>visibleCount){visibleCount+=5;renderMessages();}else if(older)return refresh(older);});olderButton.hidden=true;
  const latestButton=button('Show latest only',()=>{visibleCount=5;renderMessages();heading.focus({preventScroll:true});panel.scrollIntoView({block:'start'});});latestButton.hidden=true;
  const historyActions=node('div');historyActions.className='portalWorkshopHistoryActions';historyActions.append(olderButton,latestButton);panel.append(historyActions);
  const controller={panel};
  if(!mechanic()){
   const form=node('form'),label=node('label','Message'),input=node('textarea'),attachments=node('div'),send=node('button','Send message & alerts'),note=node('div');input.rows=3;input.maxLength=3000;input.required=true;input.placeholder='Type your message to the customer…';label.append(input);send.type='submit';send.className='btn green';attachments.className='portalMessageAttachments';note.setAttribute('role','status');
   const permissionLabel=node('label'),permissionBox=node('input'),permissionText=node('span'),permissionStatus=node('p');permissionBox.type='checkbox';permissionLabel.className='portalWhatsappPermission';permissionLabel.hidden=true;permissionLabel.append(permissionBox,permissionText);
   form.append(label,attachments,permissionLabel,permissionStatus,send,note);
   const composer=node('details');composer.className='portalWorkshopComposer';composer.append(node('summary','Message customer'),form);panel.insertBefore(composer,list);
   let photos=null;
   Object.assign(controller,{form,attachments,bindPhotos(value){photos=value;input.required=false;}});
   let contact=null;
   api('approval-list',{job_id:job.id}).then(data=>{contact=data.whatsapp;if(contact?.phone&&!contact.unavailable){permissionBox.checked=contact.allowed;permissionText.textContent='Customer agreed to WhatsApp updates on the number ending '+contact.phone.slice(-4);permissionLabel.hidden=false;}}).catch(()=>{});
   permissionBox.onchange=async()=>{permissionBox.disabled=true;send.disabled=true;try{await api('approval-whatsapp-permission',{job_id:job.id,phone:contact.phone,contact_binding:contact.contact_binding,allowed:permissionBox.checked});contact.allowed=permissionBox.checked;permissionStatus.textContent='WhatsApp preference saved.';}catch(e){permissionBox.checked=contact.allowed;permissionStatus.textContent=e.message;}finally{permissionBox.disabled=false;send.disabled=false;}};
   let id=crypto.randomUUID(),sending=false;input.oninput=()=>{if(!sending)id=crypto.randomUUID();};
   form.onsubmit=async e=>{
    e.preventDefault();if(sending||permissionBox.disabled)return;
    if(photos?.busy()){note.textContent='Please finish the current photo or finding before sending.';return;}
    const message=input.value.trim()||(photos?.hasDraft()?'Workshop photos added. You can view them on your vehicle progress page.':'');
    if(!message){note.textContent='Type a message or add a photo.';input.focus();return;}
    sending=true;send.disabled=true;permissionBox.disabled=true;input.readOnly=true;note.textContent='Saving your message and preparing customer alerts…';
    try{
     if(photos&&!await photos.upload())throw Error('Your message has not been sent. Check the photo notice and retry.');
     photos?.lock(true);send.disabled=true;permissionBox.disabled=true;
     const result=await api('portal-reply',{job_id:job.id,id,message});
     photos?.complete();input.value='';id=crypto.randomUUID();note.replaceChildren(node('p','Message saved in the customer portal.'));const delivery=node('div');showAlerts(delivery,result.alerts,job.id);note.append(delivery);await refresh();
    }catch(error){note.textContent=error.message;}
    finally{sending=false;photos?.lock(false);send.disabled=false;permissionBox.disabled=false;input.readOnly=false;}
   };
  }
  async function openMessage(item){
   if(!panel.isConnected||document.hidden)return;
   displayed.set(item.id,item);
   visibleCount=Math.max(visibleCount,orderedEvents().findIndex(event=>event.id===item.id)+1);
   renderMessages();
   const card=[...list.querySelectorAll('.portalWorkshopEvent')].find(card=>card.dataset.eventId===item.id);
   if(card){card.setAttribute('open','');await markRead([item]);}
  }
  panels.set(job.id,{panel,refresh,updateNotifications,updateRead,openMessage});refresh();
  return controller;
 }
 function seen(){try{return new Set(JSON.parse(localStorage.getItem('vecta:portal:seen:'+ (mechanic()?'mechanic':'manager'))||'[]'));}catch{return new Set();}}
 function ack(item){const ids=seen();ids.add(item.id);try{localStorage.setItem('vecta:portal:seen:'+(mechanic()?'mechanic':'manager'),JSON.stringify([...ids].slice(-1000)));}catch{}if(pendingEvent===item.id)pendingEvent=null;refreshQueue?.();}
 function install(){
  if(!document.querySelector('main.main>header.top'))return;
  popup=node('aside');popup.className='portalWorkshopPopup';popup.hidden=true;popup.setAttribute('aria-label','Customer portal notification');document.body.append(popup);
  let busy=false;
  refreshQueue=async()=>{
   if(busy||document.hidden||!navigator.onLine)return;busy=true;
   window.vectaMaintainPortalAlerts?.();
   try{
    const events=[];let before;
    do{const page=await api('portal-queue',before?{before}:{});events.push(...page.events);before=page.older_cursor;}while(before);
    receiveReadState(events);
    // Upgrade existing device-only receipts once; a failed upload stays eligible
    // for the next poll. Never upload popup dismissals as read receipts.
    const legacy=events.filter(item=>incoming(item)&&!item.read_at&&read.has(item.id));
    if(legacy.length)await saveReadIds(legacy.map(item=>item.id)).catch(()=>{});
    inbox=[...new Map(events.map(item=>[item.id,item])).values()];
    try{localStorage.setItem(inboxKey(),JSON.stringify(inbox.map(({id,job_id,actor,forwarded})=>({id,job_id,actor,forwarded}))));}catch{}
    paintBadges();
    const fresh=events.filter(item=>!known.has(item.id));let synced=true;
    if(fresh.length){
     try{synced=typeof window.vectaRefreshPortalJobs==='function'&&await window.vectaRefreshPortalJobs()!==false;}catch{synced=false;}
     // A failed refresh must not acknowledge receipt of the saved job update.
     // Keep its alert visible and retry on the next poll/reconnection.
     if(synced)for(const e of events)known.add(e.id);
     for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);
    }
    for(const p of panels.values())if(p.panel.isConnected)p.updateRead?.();
    const ids=seen(),next=events.find(x=>x.id===pendingEvent&&!read.has(x.id))||events.find(x=>!ids.has(x.id)&&!read.has(x.id));
    if(!next){active=null;popup.hidden=true;return;}
    if(active&&active.id===next.id&&active.forwarded===next.forwarded&&active.synced===synced)return;
    active={...next,synced};popup.hidden=false;popup.replaceChildren(node('strong',(mechanic()?'Job update':'Customer message')+' · '+next.registration),eventCard(next,!mechanic()));
    const message=node('p',synced?'':'Message saved. Reconnecting to update this device’s job card…');message.setAttribute('role','status');
    popup.append(button('Open job card',async()=>{
     if(!next.job_id){message.textContent='This booking is waiting in Website Bookings. Accept it to create its job card.';return;}
     const state=await window.vectaOpenFindingJob?.(next.job_id);
     if(state==='busy'){message.textContent='Save or close your current card, then open this message.';return;}
     if(state==='open'){document.querySelector('.portalWorkshop')?.scrollIntoView({behavior:'smooth',block:'center'});try{await panels.get(next.job_id)?.openMessage(next);ack(next);}catch{message.textContent='Unable to sync the read status. Reconnect and reopen this message.';}}else message.textContent='The job could not be opened. Please retry.';
    }),button('Dismiss',()=>ack(next)),message);
   }catch{}finally{busy=false;}
  };
  if(typeof MutationObserver!=='undefined'){
   // Observe card replacements, not every attribute/text change on the page.
   const observer=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.(cardSelector)||n.querySelector?.(cardSelector)))))paintBadges();});
   observer.observe(document.querySelector('main.main'),{childList:true,subtree:true});
  }
  window.addEventListener('storage',e=>{if(e.key===readKey()||e.key===null){refreshReadState();active=null;refreshQueue();}});
  window.addEventListener('vecta-portal-changed',()=>{active=null;refreshQueue();});
  window.addEventListener('vecta-notification-state',()=>{for(const [id,p]of panels)if(p.panel.isConnected)p.updateNotifications();else panels.delete(id);});
  window.addEventListener('focus',()=>refreshQueue());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQueue();});
  window.addEventListener('online',()=>{window.vectaMaintainPortalAlerts?.(true);refreshQueue();});
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='vecta-portal-notification'){if(e.data.eventId)pendingEvent=e.data.eventId;refreshQueue();}});
  paintBadges();refreshQueue();setInterval(refreshQueue,10000);
  setInterval(()=>{for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);},15000);
 }
 async function confirmation(job){
  const dialog=node('dialog');dialog.className='portalEmailDialog';const title=node('h2','Booking confirmation'),status=node('p','Preparing your formatted email…'),preview=node('iframe');preview.title='Customer confirmation email preview';preview.setAttribute('sandbox','');const send=button('Send confirmation email',async()=>{send.disabled=true;status.textContent='Sending…';try{const result=await api('confirmation-send',{job_id:job.id});status.textContent=result.audit_pending?'Accepted by the email provider; the delivery record needs checking.':'Confirmation email sent.';}catch(e){status.textContent=e.message;send.disabled=false;}});send.disabled=true;
  dialog.append(title,status,preview,send,button('Close',()=>dialog.close()));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  try{const data=await api('confirmation-preview',{job_id:job.id});preview.srcdoc=data.html;status.textContent='To: '+data.email+(data.has_image?' · Includes saved vehicle image.':' · No saved vehicle image available.')+(data.test?' Test preview — email sending is disabled.':data.status==='pending'?' The earlier send is not yet confirmed. Check its status before sending another copy.':data.send_error?' '+data.send_error:'');send.disabled=data.test||data.status==='sent'||data.status==='pending';if(data.status==='sent')send.textContent='Already sent';else if(data.status==='failed')send.textContent='Retry confirmation email';}catch(e){status.textContent=e.message;}
 }
 let bookingCount=null;
 function clearBookingNotifications(count){
  bookingCount=count;if(count!==0)return;
  Promise.resolve(navigator.serviceWorker?.getRegistration?.()).then(async registration=>{
   for(const notification of await registration?.getNotifications?.()||[])if(bookingCount===0&&notification.tag==='vecta-website-bookings')notification.close();
  }).catch(()=>{});
 }
 window.VectaPortalWorkshop={mount,confirmation,clearBookingNotifications};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
