(()=>{'use strict';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const mechanic=()=>!!window.VECTA_MECHANIC_DEPLOYMENT;
 const date=value=>new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value));
 async function api(action,body={}){const r=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});const data=await r.json();if(!r.ok)throw Error(data.error||'Customer messages are unavailable.');return data;}
 let pendingEvent=new URLSearchParams(location.search).get('portal_event'),popup,active,refreshQueue;
 const panels=new Map(),known=new Set();let viewingEvent=null,paintOutstanding=()=>{},queueReady=false;
 // Opening is device-local; acknowledgement is shared across this role’s devices.
 // Old read receipts deliberately cannot clear the outstanding queue.
 const acknowledgedKey=()=> 'vecta:portal:acknowledged:'+(mechanic()?'mechanic':'manager');
 function acknowledgedIds(){try{const ids=JSON.parse(localStorage.getItem(acknowledgedKey())||'[]');return new Set(Array.isArray(ids)?ids:[]);}catch{return new Set();}}
 const inboxKey=()=> 'vecta:portal:inbox:'+(mechanic()?'mechanic':'manager');
 function cachedInbox(){try{const items=JSON.parse(localStorage.getItem(inboxKey())||'[]');return Array.isArray(items)?items:[];}catch{return [];}}
 let inbox=cachedInbox(),acknowledged=acknowledgedIds();
 const acknowledging=new Set();
 const cardSelector='.job[data-job-id],.mobileJob[data-open-job],.sideJob[data-open-job],.sideJob[data-job-id]';
 const incoming=item=>mechanic()?item.forwarded:item.actor==='customer';
 function outstanding(items){return items.filter(item=>incoming(item)&&!acknowledged.has(item.id));}
 function paintBadges(){
  const counts=new Map();for(const item of outstanding(inbox))if(item.job_id)counts.set(item.job_id,(counts.get(item.job_id)||0)+1);
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
      const latest=outstanding(inbox).find(item=>item.job_id===id);
      if(latest)await openJobMessage(latest);
     }catch(error){window.alert?.(error.message);}
    });
   }
   const label=count+' outstanding '+(mechanic()?'office update':'customer message')+(count===1?'':'s')+' — open conversation';
   if(badge.getAttribute('aria-label')!==label){badge.setAttribute('aria-label',label);badge.title=label;badge.lastElementChild.textContent=String(count);}
  }
 }
 function refreshAcknowledgements(){for(const id of acknowledgedIds())acknowledged.add(id);paintBadges();paintOutstanding();for(const p of panels.values())if(p.panel.isConnected)p.updateRead?.();}
 function rememberAcknowledged(ids){
  for(const id of ids)acknowledged.add(id);
  try{localStorage.setItem(acknowledgedKey(),JSON.stringify([...acknowledged]));}catch{}
  if(acknowledged.has(pendingEvent))pendingEvent=null;
  if(active&&acknowledged.has(active.id)){active=null;if(popup)popup.hidden=true;}
  refreshAcknowledgements();
  // Remove delivered notifications belonging to messages confirmed acknowledged by the
  // server. This also runs when another device's receipt arrives on resume.
  Promise.resolve(navigator.serviceWorker?.getRegistration?.()).then(async registration=>{
   for(const notification of await registration?.getNotifications?.()||[]){
    const id=notification.tag?.replace(/^vecta-portal-/,'');if(acknowledged.has(id))notification.close();
   }
  }).catch(()=>{});
 }
 async function saveAcknowledgements(ids){
  ids=[...new Set(ids)].filter(id=>!acknowledging.has(id));if(!ids.length)return;
  for(const id of ids)acknowledging.add(id);
  try{
   for(let offset=0;offset<ids.length;offset+=100){
    const result=await api('portal-acknowledge',{event_ids:ids.slice(offset,offset+100)});
    if(!Array.isArray(result.acknowledged_ids))throw Error('Unable to confirm the shared acknowledgement.');
    rememberAcknowledged(result.acknowledged_ids);
    if(ids.slice(offset,offset+100).some(id=>!result.acknowledged_ids.includes(id)))throw Error('Acknowledgement not confirmed. Please retry.');
   }
  }finally{for(const id of ids)acknowledging.delete(id);}
 }
 async function acknowledge(items){
  await saveAcknowledgements(outstanding(items).map(item=>item.id));
  refreshQueue?.();
 }
 function receiveAcknowledgements(items){rememberAcknowledged(items.filter(item=>item.acknowledged_at).map(item=>item.id));}

 function acknowledgeButton(item,status,label='Acknowledge message'){
  const control=button(label,async()=>{
   control.disabled=true;status.textContent='Saving acknowledgement…';
   try{await acknowledge([item]);control.hidden=acknowledged.has(item.id);status.textContent=control.hidden?'Acknowledged.':'Acknowledgement not confirmed. Please retry.';}
   catch{status.textContent='Unable to save the acknowledgement. This message remains outstanding. Reconnect and retry.';}
   finally{control.disabled=false;}
  });
  control.dataset.acknowledgeId=item.id;control.hidden=acknowledged.has(item.id);return control;
 }
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
 const decisionOf=item=>item.decision||item.details?.status;
 function responseBody(item){
  const body=node('div');body.className='portalDecisionBody';
  const approved=decisionOf(item)==='approved';body.dataset.signal=approved?'green':'red';
  const vehicle=node('div');vehicle.className='portalDecisionVehicle';
  const fallback=node('p',item.vehicle||'Vehicle image unavailable');vehicle.append(fallback);body.append(vehicle);
  const paint=()=>{
   if(vehicle.querySelector('img'))return;
   const tools=window.VectaHaynesJobTools,drawing=tools?.storedDrawing?.(item),src=tools?.safeImage?.(drawing?.imageUrl);
   if(!src)return;
   const img=node('img');img.src=tools.artworkUrl?.(src)||src;img.alt='Vehicle for '+item.registration;
   img.dataset.vehicleSource=src;img.dataset.registration=item.registration;img.dataset.vehicleMake=drawing.make||'';
   img.onerror=()=>{img.remove();fallback.hidden=false;};fallback.hidden=true;vehicle.prepend(img);window.VectaVehicleImage?.mount(vehicle);
  };
  paint();Promise.resolve(window.VectaHaynesJobTools?.readBookingDrawing?.(item)).then(paint).catch(()=>{});
  const title=node('h2',(approved?'Good news, ':'Bad news, ')+(item.customer_name||'the customer')+(approved?' has authorised the extra work.':' has declined the work.'));
  const symbol=node('span',approved?'✓':'✕');symbol.className='portalDecisionSymbol';symbol.setAttribute('aria-hidden','true');title.prepend(symbol);body.append(title);
  const work=node('p',item.message);work.className='portalDecisionWork';body.append(work);
  const parts=item.parts||item.details?.parts||[];
  if(parts.length){const list=node('ul');list.className='portalDecisionParts';for(const part of parts)list.append(node('li',(part.quantity>1?part.quantity+' × ':'')+part.description));body.append(list);}
  const reply=item.reply||item.details?.customer_reply;
  if(reply){const message=node('div');message.className='portalQuoteReply';message.append(node('strong','Customer message'),node('p',reply));body.append(message);}
  if(!mechanic()&&Number.isInteger(item.details?.estimated_pence)){const price=node('p','Additional work: £'+(item.details.estimated_pence/100).toFixed(2)+' including VAT');price.className='portalDecisionPrice';body.append(price);}
  const status=node('p');status.className='portalDecisionStatus';status.setAttribute('role','status');
  if(!mechanic()){
   const send=button(item.forwarded?'Sent to mechanic':'Send to mechanic',async()=>{
    send.disabled=true;status.textContent='Saving to the job card…';
    try{
     await api('portal-forward',{event_id:item.id});item.forwarded=true;send.textContent='Sent to mechanic';
     let synced=false;try{synced=typeof window.vectaRefreshPortalJobs==='function'&&await window.vectaRefreshPortalJobs()!==false;}catch{}
     const panel=panels.get(item.job_id),reopened=synced&&panel?.refreshAfterForward?.();
     status.textContent=!synced?'Saved and sent. Reconnecting to refresh this device…':panel&&!reopened?'Saved and sent. Close and reopen your job card to see the update; your current edits are still here.':approved?'Work, parts and price saved to the job card. Mechanic notified.':'Refusal saved to the job card. Mechanic notified.';
     window.dispatchEvent(new Event('vecta-portal-changed'));
    }catch(error){send.disabled=false;status.textContent=error.message;}
   });send.classList.add('portalForwardQuote');send.disabled=!!item.forwarded;body.append(send);
  }
  if(incoming(item))body.append(acknowledgeButton(item,status));
  body.append(status);return body;
 }
 function showResponse(item){
  document.querySelector('.portalDecisionDialog')?.close();
  const dialog=node('dialog');dialog.className='portalDecisionDialog';dialog.setAttribute('aria-label','Customer response for '+item.registration);
  dialog.append(responseBody(item),button('Close',()=>dialog.close()));document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  rememberOpened(item);
 }
 function eventCard(item,canForward,alerts,onReply){
  if(item.kind==='approval_response'&&['approved','declined'].includes(decisionOf(item))){
   const card=node('div');card.className='portalWorkshopEvent portalResponseLink';card.dataset.eventId=item.id;
   const approved=decisionOf(item)==='approved';card.dataset.signal=approved?'green':'red';
   card.append(button((approved?'✓ Work authorised':'✕ Work declined')+' · View response',()=>showResponse(item)),node('time',date(item.created_at)));return card;
  }
  const c=node('details');c.className='portalWorkshopEvent';c.dataset.eventId=item.id;
  const decision=item.decision||item.details?.status;
  const titles={message:'Message',preferences:'Parts authorisation',amendment:'Amendment requested',additional_work:'Additional work requested',cancelled:'Booking cancelled',approval_response:decision==='approved'?'Work authorised':decision==='declined'?'Work not authorised':'Customer decision',approval_request:'Approval requested',booking_update:'Booking updated',correspondence:'Workshop message'};
  const heading=node('summary');heading.className='portalWorkshopEventHeading';
  const timestamp=node('time',date(item.created_at));timestamp.dateTime=item.created_at;
  heading.append(node('strong',(decision==='approved'?'✓ ':decision==='declined'?'✕ ':'')+(window.VectaMessageSummary?.title(item)||titles[item.kind]||'Job update')),timestamp);
  const progress=window.VectaMessageSummary?.progress?.(item);
  const body=node('div');body.className='portalWorkshopEventBody';c.append(heading,body);body.append(node('p',progress?.message||item.message));
  if(item.reply||item.details?.customer_reply){const reply=node('div');reply.className='portalQuoteReply';reply.append(node('strong','Customer message'),node('p',item.reply||item.details.customer_reply));body.append(reply);}
  if(item.details?.quote_description)body.prepend(node('p','About quote: '+item.details.quote_description));
  if(item.details?.requested_date)body.append(node('p','Requested date: '+item.details.requested_date+' — awaiting workshop confirmation.'));
  if(item.details?.work_required&&!progress)body.append(node('p',item.details.work_required));
  const green=decision==='approved'||item.authorised===true||item.details?.preferences?.serious_repairs==='change_parts',red=decision==='declined'||item.authorised===false||item.details?.preferences?.serious_repairs==='book_later';
  c.dataset.signal=green?'green':red?'red':item.kind==='approval_request'?'amber':'';
  if(Number.isInteger(item.details?.estimated_pence))body.append(node('p','£'+(item.details.estimated_pence/100).toFixed(2)+' including VAT'));
  if(onReply&&item.actor==='customer')body.append(button('Reply to message',()=>onReply(item)));
  if(canForward&&item.actor==='customer'){
   const send=button(item.forwarded?'Sent to mechanic':'Send to mechanic',async()=>{send.disabled=true;try{await api('portal-forward',{event_id:item.id});send.textContent='Sent to mechanic';window.dispatchEvent(new Event('vecta-portal-changed'));}catch(e){send.disabled=false;status.textContent=e.message;}});
   send.disabled=item.forwarded;const status=node('p');status.setAttribute('role','status');body.append(send,status);
  }
  if(canForward&&alerts){const details=node('details'),delivery=node('div');details.className='portalDeliveryDetails';details.append(node('summary','Alert delivery'),delivery);showAlerts(delivery,alerts,item.job_id);body.append(details);}
  if(incoming(item)){const status=node('p');status.setAttribute('role','status');body.append(acknowledgeButton(item,status),status);}
  c.addEventListener('toggle',()=>{if(c.open&&c.isConnected&&!document.hidden&&incoming(item)){
   // Reading inside the notification must not remove the text being acknowledged.
   if(popup?.contains(c))viewingEvent=item.id;
   if(!popup?.contains(c))rememberOpened(item);
  }});
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
  const readButton=button('Acknowledge messages',async()=>{readButton.disabled=true;try{await acknowledge(visibleEvents());status.textContent='Acknowledged across your devices.';}catch{status.textContent='Unable to save the acknowledgement. The message alert is still active. Reconnect and retry.';}finally{readButton.disabled=false;}});
  readButton.classList.add('portalMarkRead');readButton.hidden=true;
  const header=node('div');header.className='portalWorkshopHeading';header.append(heading,readButton);
  panel.append(header,consent,notifications,status,list);after.after(panel);
  let busy=false,key='',older=null,visibleCount=5,paged=false;const displayed=new Map(),receipts=new Map();let latestIds=[],initialMessageOpened=false;
  const orderedEvents=()=>[...displayed.values()].filter(item=>window.VectaMessageSummary?.visible?.(item)!==false).sort((a,b)=>b.created_at.localeCompare(a.created_at)||Number(b.seq||0)-Number(a.seq||0));
  const visibleEvents=()=>orderedEvents().slice(0,visibleCount);
  function renderMessages(){
   const ordered=orderedEvents();
   if(!initialMessageOpened){const latest=outstanding(ordered)[0];if(latest)visibleCount=Math.max(visibleCount,ordered.indexOf(latest)+1);}
   const hash=JSON.stringify([ordered,[...receipts],visibleCount]);
   if(hash!==key){
    const expanded=new Set([...list.querySelectorAll('.portalWorkshopEvent[open]')].map(card=>card.dataset.eventId));
    key=hash;const cards=ordered.slice(0,visibleCount).map(item=>eventCard(item,!mechanic(),receipts.get(item.id),controller.replyTo));
    if(!cards.length){const empty=node('p',mechanic()?'No office messages or approvals yet.':'No messages yet.');empty.className='portalWorkshopEmpty';cards.push(empty);}
    for(const card of cards)if(expanded.has(card.dataset.eventId))card.setAttribute('open','');
    list.replaceChildren(...cards);
    const latest=outstanding(ordered)[0];
    if(!initialMessageOpened&&latest){
     const card=cards.find(card=>card.dataset.eventId===latest.id);
     if(card){card.setAttribute('open','');initialMessageOpened=true;rememberOpened(latest);}
    }
   }
   olderButton.hidden=ordered.length<=visibleCount&&!older;latestButton.hidden=visibleCount<=5;updateRead();
  }
  function updateRead(){for(const control of panel.querySelectorAll('[data-acknowledge-id]'))control.hidden=acknowledged.has(control.dataset.acknowledgeId);const count=outstanding(visibleEvents()).length;readButton.hidden=!count;readButton.textContent='Acknowledge '+count+' '+(count===1?'message':'messages');}

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
    receiveAcknowledgements(data.events);
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
   const form=node('form'),label=node('label'),labelText=node('span','Message'),input=node('textarea'),attachments=node('div'),send=node('button','Send message & alerts'),note=node('div');input.rows=3;input.maxLength=3000;input.required=true;input.placeholder='Type your message to the customer…';label.append(labelText,input);send.type='submit';send.className='btn green';attachments.className='portalMessageAttachments';note.setAttribute('role','status');
   const permissionLabel=node('label'),permissionBox=node('input'),permissionText=node('span'),permissionStatus=node('p');permissionBox.type='checkbox';permissionLabel.className='portalWhatsappPermission';permissionLabel.hidden=true;permissionLabel.append(permissionBox,permissionText);
   const modes=node('div');modes.className='portalComposeModes';modes.setAttribute('role','group');modes.setAttribute('aria-label','Message type');
   const messageMode=button('Send message',()=>setMode('message')),quoteMode=button('Send quote',()=>setMode('quote'));
   modes.append(messageMode,quoteMode);
   const priceLabel=node('label','Estimated price including VAT (£)'),price=node('input');price.type='text';price.inputMode='decimal';price.placeholder='0.00';price.maxLength=9;priceLabel.className='portalQuotePrice';priceLabel.append(price);priceLabel.hidden=true;
   const partsLabel=node('label','Parts to add to the job (optional, one per line)'),parts=node('textarea');parts.rows=2;parts.maxLength=6000;partsLabel.className='portalQuoteParts';partsLabel.append(parts);partsLabel.hidden=true;
   const orderLabel=node('label'),orderParts=node('input');orderLabel.className='portalPartsRequired';orderParts.type='checkbox';orderParts.checked=true;orderLabel.append(orderParts,node('span','Parts need ordering after approval'));orderLabel.hidden=true;
   form.append(modes,label,priceLabel,partsLabel,orderLabel,attachments,permissionLabel,permissionStatus,send,note);
   const composer=node('details');composer.className='portalWorkshopComposer';composer.append(node('summary','Message customer'),form);panel.insertBefore(composer,list);
   let photos=null;
   Object.assign(controller,{form,attachments,bindPhotos(value){photos=value;input.required=false;}});
   let contact=null;
   api('approval-list',{job_id:job.id}).then(data=>{contact=data.whatsapp;if(contact?.phone&&!contact.unavailable){permissionBox.checked=contact.allowed;permissionText.textContent='Customer agreed to WhatsApp updates on the number ending '+contact.phone.slice(-4);permissionLabel.hidden=false;}}).catch(()=>{});
   permissionBox.onchange=async()=>{permissionBox.disabled=true;send.disabled=true;try{await api('approval-whatsapp-permission',{job_id:job.id,phone:contact.phone,contact_binding:contact.contact_binding,allowed:permissionBox.checked});contact.allowed=permissionBox.checked;permissionStatus.textContent='WhatsApp preference saved.';}catch(e){permissionBox.checked=contact.allowed;permissionStatus.textContent=e.message;}finally{permissionBox.disabled=false;send.disabled=false;}};
   let id=crypto.randomUUID(),sending=false,mode='message',quoteAttempt=null,replyAttempt=null;
   function setMode(value){
    if(sending||quoteAttempt)return;replyTarget=null;mode=value;const quote=mode==='quote';
    messageMode.setAttribute('aria-pressed',String(!quote));quoteMode.setAttribute('aria-pressed',String(quote));
    labelText.textContent=quote?'Work required':'Message';input.maxLength=quote?1200:3000;
    input.placeholder=quote?'Describe what needs doing and why…':'Type your message to the customer…';
    priceLabel.hidden=!quote;price.required=quote;price.disabled=!quote;attachments.hidden=false;partsLabel.hidden=!quote;orderLabel.hidden=!quote;
    send.textContent=quote?'Send quote & alerts':'Send message & alerts';note.replaceChildren();
   }
   let replyTarget=null;
   controller.replyTo=item=>{
    composer.open=true;
    if(sending||quoteAttempt||replyAttempt){note.scrollIntoView({block:'center'});return;}
    if(mode==='quote'&&(input.value||price.value||parts.value||photos?.hasDraft())){
     note.textContent='Finish your quote or select Send message before replying.';return;
    }
    setMode('message');replyTarget=item.id;
    labelText.textContent='Reply to '+(item.message||'customer message').slice(0,100);
    input.focus();input.scrollIntoView({block:'center'});
   };
   setMode('message');
   orderParts.onchange=input.oninput=price.oninput=parts.oninput=()=>{if(!sending&&!quoteAttempt){id=crypto.randomUUID();replyAttempt=null;}};
   form.onsubmit=async e=>{
    e.preventDefault();if(sending||permissionBox.disabled)return;
    if(photos?.busy()){note.textContent='Please finish the current photo or finding before sending.';return;}
    const quote=mode==='quote';
    const message=input.value.trim()||(!quote&&photos?.hasDraft()?'Workshop photos added. You can view them on your vehicle progress page.':'');
    if(!message||message.length>(quote?1200:3000)){note.textContent=quote?'Describe the work in up to 1,200 characters.':'Type a message or add a photo (up to 3,000 characters).';input.focus();return;}
    if(quote&&!/^\d{1,6}(?:\.\d{1,2})?$/.test(price.value.trim())){note.textContent='Enter the estimated price in pounds, including VAT.';price.focus();return;}
    const partRows=parts.value.split(/\n/).map(value=>value.trim()).filter(Boolean).map(description=>({description,quantity:1}));
    if(quote&&(partRows.length>30||partRows.some(part=>part.description.length>200))){note.textContent='Enter up to 30 parts, using up to 200 characters per line.';return;}
    if(quote)quoteAttempt??={approval_id:id,message,estimate:price.value.trim(),parts:partRows,parts_need_ordering:orderParts.checked,photo_ids:photos?.quotePhotoIds?.()||[]};
    if(!quote)replyAttempt??={id,message,reply_to_event_ids:replyTarget?[replyTarget]:outstanding(visibleEvents()).filter(item=>list.querySelector('[data-event-id="'+item.id+'"]')?.hasAttribute('open')).map(item=>item.id)};
    sending=true;send.disabled=true;permissionBox.disabled=true;input.readOnly=true;note.textContent=quote?'Saving your quote and preparing customer alerts…':'Saving your message and preparing customer alerts…';
    try{
     messageMode.disabled=quoteMode.disabled=true;price.readOnly=parts.readOnly=true;orderParts.disabled=true;
     if(quote){
      if(photos&&!await photos.uploadQuote(quoteAttempt.approval_id))throw Error('The quote has not been sent. Check the photo notice and retry.');
      photos?.lock(true);
      await api('approval-stage',{job_id:job.id,approval_id:quoteAttempt.approval_id,message:quoteAttempt.message,photo_ids:quoteAttempt.photo_ids,parts:quoteAttempt.parts,parts_need_ordering:quoteAttempt.parts_need_ordering});
      const result=await api('approval-request',{job_id:job.id,...quoteAttempt});
      note.replaceChildren(node('p','Quote saved in the customer portal. Waiting for the customer’s decision.'));
      const delivery=node('div');note.append(delivery);if(window.VectaFindings)window.VectaFindings.showResult(delivery,result);else showAlerts(delivery,result,job.id);
      photos?.completeQuote?.();quoteAttempt=null;input.value='';price.value='';parts.value='';orderParts.checked=true;id=crypto.randomUUID();window.VectaFindings?.notify();await refresh();return;
     }
     if(photos&&!await photos.upload())throw Error('Your message has not been sent. Check the photo notice and retry.');
     photos?.lock(true);send.disabled=true;permissionBox.disabled=true;
     const result=await api('portal-reply',{job_id:job.id,...replyAttempt});
     rememberAcknowledged(result.acknowledged_ids||[]);replyAttempt=null;replyTarget=null;labelText.textContent='Message';refreshQueue?.();
     photos?.complete();input.value='';id=crypto.randomUUID();note.replaceChildren(node('p','Message saved in the customer portal.'));const delivery=node('div');showAlerts(delivery,result.alerts,job.id);note.append(delivery);if(result.acknowledgement_pending)note.append(node('p','Your reply is saved. The incoming message remains outstanding until its acknowledgement syncs; use Acknowledge message to retry.'));await refresh();
    }catch(error){note.textContent=error.message;}
    finally{sending=false;photos?.lock(false);send.disabled=false;permissionBox.disabled=false;input.readOnly=!!quoteAttempt;price.readOnly=parts.readOnly=!!quoteAttempt;orderParts.disabled=!!quoteAttempt;messageMode.disabled=quoteMode.disabled=!!quoteAttempt;if(quoteAttempt)note.append(node('p','The quote is not confirmed. Press Send quote & alerts again to safely retry the same quote.'));}
   };
  }
  async function openMessage(item){
   if(!panel.isConnected||document.hidden)throw Error('The message has not opened. Please retry.');
   displayed.set(item.id,item);
   visibleCount=Math.max(visibleCount,orderedEvents().findIndex(event=>event.id===item.id)+1);
   renderMessages();
   const card=[...list.querySelectorAll('.portalWorkshopEvent')].find(card=>card.dataset.eventId===item.id);
   if(!card)throw Error('The message has not opened. Please retry.');
   if(item.kind==='approval_response'&&['approved','declined'].includes(decisionOf(item))){showResponse(item);return true;}
   card.setAttribute('open','');card.tabIndex=-1;
   card.scrollIntoView({behavior:'instant',block:'center'});card.focus({preventScroll:true});
   return true;
  }
  let edited=false;const detectEdit=e=>{if(!panel.contains(e.target))edited=true;};modal.addEventListener('input',detectEdit);modal.addEventListener('change',detectEdit);
  const refreshAfterForward=()=>{if(edited||!panel.isConnected||[...panel.querySelectorAll('.portalWorkshopComposer textarea')].some(el=>el.value)||panel.querySelector('.workshopPhotoDraft')||!window.openJobModal)return false;window.openJobModal(job.id);return true;};
  panels.set(job.id,{panel,refresh,updateNotifications,updateRead,openMessage,refreshAfterForward});refresh();
  return controller;
 }
 const opened=new Set();
 function syncPopupVisibility(){
  // A pending alert must never cover an editor, replace its job, or discard a draft.
  // Pause only its display; closing the editor restores it without a network request.
  if(popup)popup.hidden=!active||!!document.querySelector('.modal.open,dialog[open]');
 }
 function seen(){try{for(const id of JSON.parse(localStorage.getItem('vecta:portal:opened:'+ (mechanic()?'mechanic':'manager'))||'[]'))opened.add(id);}catch{}return opened;}
 function rememberOpened(item){const ids=seen();ids.add(item.id);try{localStorage.setItem('vecta:portal:opened:'+(mechanic()?'mechanic':'manager'),JSON.stringify([...ids].slice(-1000)));}catch{}if(pendingEvent===item.id)pendingEvent=null;if(viewingEvent===item.id)viewingEvent=null;if(active?.id===item.id){active=null;if(popup)popup.hidden=true;}refreshQueue?.();}
 async function openJobMessage(item){
  if(!item.job_id)throw Error('This booking is waiting in Website Bookings. Accept it to create its job card.');
  const state=await window.vectaOpenFindingJob?.(item.job_id);
  if(state!=='open')throw Error(state==='busy'?'Save or close your current card, then open this message.':'The job could not be opened. Please retry.');
  const conversation=panels.get(item.job_id);
  if(!conversation?.panel.isConnected||await conversation.openMessage(item)!==true)throw Error('The message has not opened. Please retry.');
  rememberOpened(item);
 }
 function mountInbox(host){
  const section=node('section');section.className='portalMessageHistory';
  const heading=node('h4','Customer messages'),note=node('p','Messages stay outstanding until acknowledged or replied to. Your full history stays here.');
  const search=node('input');search.type='search';search.placeholder='Search registration, name or message';search.setAttribute('aria-label',search.placeholder);
  const status=node('p'),list=node('div');status.setAttribute('role','status');
  let events=[],limit=25,busy=false;
  const more=button('Show earlier messages',()=>{limit+=25;draw();});
  function draw(){
   const query=search.value.trim().toLowerCase().replace(/\s+/g,'');
   const matches=events.filter(item=>[item.registration,item.customer_name,item.message,item.reply,item.details?.customer_reply].join(' ').toLowerCase().replace(/\s+/g,'').includes(query));
   list.replaceChildren();
   for(const item of matches.slice(0,limit)){
    const row=node('article');row.className='portalInboxRow';
    row.append(node('strong',[item.registration,item.customer_name].filter(Boolean).join(' · ')),eventCard(item,true));
    const error=node('p');error.setAttribute('role','status');
    const open=button('Open job card',async()=>{if(open.disabled)return;open.disabled=true;error.textContent='Opening message…';try{await openJobMessage(item);error.textContent='';}catch(e){error.textContent=e.message;}finally{open.disabled=false;}});
    row.append(open,error);list.append(row);
   }
   if(!matches.length)list.append(node('p',events.length?'No matching customer messages.':'No customer messages yet.'));
   more.hidden=matches.length<=limit;
  }
  async function load(){
   if(busy)return;busy=true;refresh.disabled=true;status.textContent='Loading customer messages…';
   try{
    const result=[];let before;
    do{const page=await api('portal-queue',before?{before}:{});if(!section.isConnected)return;result.push(...page.events);before=page.older_cursor;}while(before);
    events=[...new Map(result.filter(incoming).map(item=>[item.id,item])).values()];receiveAcknowledgements(events);draw();status.textContent='';
   }catch(e){status.textContent=e.message;}finally{busy=false;refresh.disabled=false;}
  }
  const refresh=button('Refresh',load);search.oninput=()=>{limit=25;draw();};
  section.append(heading,note,search,refresh,status,list,more);host.append(section);more.hidden=true;load();
 }
 function mountOutstanding(){
  if(mechanic())return;
  const section=node('section');section.className='portalOutstanding';section.setAttribute('aria-label','Outstanding messages');
  const header=node('div'),title=node('h2','Outstanding messages'),count=node('span'),note=node('p'),list=node('div');
  header.className='portalOutstandingHeading';count.className='portalOutstandingCount';header.append(title,count);
  note.textContent='Stays here until you acknowledge or reply.';list.className='portalOutstandingList';section.append(header,note,list);
  document.querySelector('main.main>header.top').after(section);
  let key='';
  paintOutstanding=()=>{
   const content=document.getElementById('content');
   section.hidden=!!content&&!content.querySelector('.plannerLayout,.mobilePlanner,.mechanicBoard');
   if(section.hidden)return;
   const items=outstanding(inbox),groups=new Map();
   for(const item of items){const id=item.job_id||item.id;const group=groups.get(id);if(group){group.count++;if(Number(item.seq||0)>Number(group.item.seq||0))group.item=item;}else groups.set(id,{item,count:1});}
   const hash=JSON.stringify([items,queueReady,navigator.onLine]);if(key===hash)return;key=hash;
   count.textContent=String(items.length);count.hidden=!items.length;list.replaceChildren();
   note.textContent=!navigator.onLine?'Offline — showing saved alerts. Reconnect to open messages.':'Stays here until you acknowledge or reply.';
   if(!items.length){list.append(node('p',queueReady?'No outstanding messages.':'Checking for outstanding messages…'));return;}
   for(const {item,count:n}of groups.values()){
    const row=node('article');row.className='portalOutstandingRow';
    const identity=node('div');identity.append(node('strong',item.registration||'Customer message'),node('span',item.customer_name||''));
    const preview=node('p',item.reply||item.details?.customer_reply||item.message||'Message details will load when reconnected.');preview.className='portalOutstandingPreview';
    const meta=node('small',n+' outstanding'+(item.created_at?' · '+date(item.created_at):''));
    const status=node('p');status.setAttribute('role','status');
    const open=button(item.job_id?'Open job & message':'View booking message',async()=>{
     if(open.disabled)return;open.disabled=true;
     try{if(!navigator.onLine)throw Error('Reconnect to open this message. It remains outstanding.');if(item.job_id)await openJobMessage(item);else showBookingMessage(item);status.textContent='';}
     catch(error){status.textContent=error.message;}finally{open.disabled=false;}
    });
    const actions=node('div');actions.className='portalOutstandingActions';
    actions.append(open,acknowledgeButton(item,status,'Acknowledge'));
    row.append(identity,preview,meta,actions,status);list.append(row);
   }
  };
 }
 function showBookingMessage(item){
  const dialog=node('dialog');dialog.className='portalDecisionDialog';dialog.setAttribute('aria-label','Customer booking message');
  const card=eventCard(item,false);card.setAttribute('open','');
  dialog.append(node('h2',item.registration||'Customer message'),card,node('p','This booking is in Website Bookings and does not yet have a job card.'),button('Close',()=>dialog.close()));
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();rememberOpened(item);
 }
 function install(){
  if(!document.querySelector('main.main>header.top'))return;
  const interrupted=readConfirmationDraft();
  if(!mechanic()&&interrupted?.jobId)confirmation({id:interrupted.jobId});
  popup=node('aside');popup.className='portalWorkshopPopup';popup.hidden=true;popup.setAttribute('aria-label','Customer portal notification');document.body.append(popup);
  let busy=false;
  refreshQueue=async()=>{
   syncPopupVisibility();
   if(busy||document.hidden||!navigator.onLine)return;busy=true;
   window.vectaMaintainPortalAlerts?.();
   try{
    const events=[];let before;
    do{const page=await api('portal-queue',before?{before}:{});events.push(...page.events);before=page.older_cursor;}while(before);
    receiveAcknowledgements(events);
    inbox=[...new Map(events.map(item=>[item.id,item])).values()];
    try{localStorage.setItem(inboxKey(),JSON.stringify(inbox.map(({id,job_id,actor,forwarded})=>({id,job_id,actor,forwarded}))));}catch{}
    queueReady=true;paintBadges();paintOutstanding();
    const fresh=events.filter(item=>!known.has(item.id));let synced=true;
    if(fresh.length){
     try{synced=typeof window.vectaRefreshPortalJobs==='function'&&await window.vectaRefreshPortalJobs()!==false;}catch{synced=false;}
     // A failed refresh must not acknowledge receipt of the saved job update.
     // Keep its alert visible and retry on the next poll/reconnection.
     if(synced)for(const e of events)known.add(e.id);
     for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);
    }
    for(const p of panels.values())if(p.panel.isConnected)p.updateRead?.();
    const ids=seen(),next=events.find(x=>x.id===viewingEvent&&!acknowledged.has(x.id)&&!ids.has(x.id))||events.find(x=>x.id===pendingEvent&&!acknowledged.has(x.id))||events.find(x=>x.id===active?.id&&!ids.has(x.id)&&!acknowledged.has(x.id))||events.find(x=>!ids.has(x.id)&&!acknowledged.has(x.id));
    if(!next){active=null;popup.hidden=true;return;}
    if(active&&active.id===next.id&&(viewingEvent===next.id||active.forwarded===next.forwarded&&active.synced===synced)){syncPopupVisibility();return;}
    active={...next,synced};
    const decision=next.kind==='approval_response'&&['approved','declined'].includes(decisionOf(next));popup.classList.toggle('portalQuotePopup',decision);
    if(decision)popup.replaceChildren(responseBody(next));else popup.replaceChildren(node('strong',(mechanic()?'Job update':'Customer message')+' · '+next.registration),eventCard(next,!mechanic()));
    if(decision&&mechanic())popup.prepend(button('Close',()=>rememberOpened(next)));
    const message=node('p',synced?'':'Message saved. Reconnecting to update this device’s job card…');message.setAttribute('role','status');
    const open=button(next.job_id?'Open job card':'View booking message',async()=>{
     if(open.disabled)return;open.disabled=true;viewingEvent=next.id;message.textContent='Opening message…';
     try{if(next.job_id)await openJobMessage(next);else showBookingMessage(next);}catch(error){message.textContent=error.message;}finally{open.disabled=false;}
    });
    popup.append(open,message);
    syncPopupVisibility();
   }catch{}finally{busy=false;}
  };
  if(typeof MutationObserver!=='undefined'){
   // Observe card replacements, not every attribute/text change on the page.
   const observer=new MutationObserver(records=>{if(records.some(r=>r.target.id==='content'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.(cardSelector)||n.querySelector?.(cardSelector))))){paintBadges();paintOutstanding();}});
   observer.observe(document.querySelector('main.main'),{childList:true,subtree:true});
   // Job/invoice editors live outside main. Watch their open/close transitions,
   // including native dialogs, without rerendering the message or polling the API.
   const overlaySelector='.modal,dialog';
   const overlays=new MutationObserver(records=>{
    if(records.some(r=>r.type==='attributes'?r.target.matches?.(overlaySelector):[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches?.(overlaySelector)||n.querySelector?.(overlaySelector)))))syncPopupVisibility();
   });
   overlays.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','open']});
  }
  window.addEventListener('storage',e=>{if(e.key===acknowledgedKey()||e.key===null){refreshAcknowledgements();active=null;refreshQueue();}});
  window.addEventListener('vecta-portal-changed',()=>{active=null;refreshQueue();});
  window.addEventListener('vecta-notification-state',()=>{for(const [id,p]of panels)if(p.panel.isConnected)p.updateNotifications();else panels.delete(id);});
  window.addEventListener('focus',()=>refreshQueue());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQueue();});
  window.addEventListener('online',()=>{window.vectaMaintainPortalAlerts?.(true);refreshQueue();});
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='vecta-portal-notification'){if(e.data.eventId)pendingEvent=e.data.eventId;refreshQueue();}});
  mountOutstanding();paintBadges();paintOutstanding();refreshQueue();setInterval(refreshQueue,10000);
  setInterval(()=>{for(const [id,p]of panels)if(p.panel.isConnected)p.refresh();else panels.delete(id);},15000);
 }
 // A tab owns one open email. Keep its job reference before the editor is shown.
 const confirmationKey='vecta:booking-confirmation:review';
 function readConfirmationDraft(){
  try{return JSON.parse(sessionStorage.getItem(confirmationKey));}catch{return null;}
 }
 function storeConfirmationDraft(draft){
  try{sessionStorage.setItem(confirmationKey,JSON.stringify(draft));}catch{}
 }
 function prepareConfirmation(job){
  const existing=readConfirmationDraft();
  if(existing?.jobId===job.id)return existing;
  const draft={jobId:job.id,edits:{}};
  storeConfirmationDraft(draft);return draft;
 }
 async function confirmation(job){
  if(document.querySelector('dialog.portalEmailDialog'))return;
  const draft=prepareConfirmation(job);
  function forget(){try{sessionStorage.removeItem(confirmationKey);}catch{}}

  const dialog=node('dialog');dialog.className='portalEmailDialog';
  const title=node('h2','Booking confirmation'),status=node('p','Preparing your formatted email…'),hint=node('p'),preview=node('iframe');
  hint.className='portalEmailHint';preview.title='Customer confirmation email — click text to edit';
  // The parent can edit text, while scripts and navigation remain sandboxed.
  preview.setAttribute('sandbox','allow-same-origin');
  let editable=false,dirty=false,sending=false,submittedEdits=null;
  const fields=()=>[...preview.contentDocument?.querySelectorAll('[data-confirmation-field]')||[]];
  const fieldText=el=>(el.innerText??el.textContent??'').replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ');
  const edits=()=>Object.fromEntries(fields().filter(el=>fieldText(el)!==el.dataset.originalText).map(el=>[el.dataset.confirmationField,fieldText(el)]));
  function lock(){editable=false;for(const el of fields())el.removeAttribute('contenteditable');}
  function prepareEditor(){
   const doc=preview.contentDocument;if(!doc?.body)return;
   const style=doc.createElement('style');style.textContent='[contenteditable]{cursor:text;white-space:pre-wrap;overflow-wrap:anywhere;min-width:1ch;min-height:1em}[contenteditable]:empty{display:inline-block}[contenteditable]:hover{outline:1px dashed #aaa;outline-offset:3px}[contenteditable]:focus{outline:2px solid #bd1830;outline-offset:3px;border-radius:2px}';doc.head.append(style);
   for(const el of fields()){
    el.dataset.originalText=fieldText(el);
    if(editable&&Object.hasOwn(draft.edits,el.dataset.confirmationField))el.textContent=draft.edits[el.dataset.confirmationField];
    if(editable){el.setAttribute('contenteditable','plaintext-only');el.setAttribute('role','textbox');el.setAttribute('aria-label','Edit '+el.dataset.confirmationField.replace(/_/g,' '));el.setAttribute('aria-multiline','true');}
   }
   dirty=editable&&Object.keys(draft.edits).length>0;
   doc.addEventListener('click',e=>{if(e.target.closest?.('a'))e.preventDefault();});
   doc.addEventListener('drop',e=>e.preventDefault());
   doc.addEventListener('input',()=>{draft.edits=edits();storeConfirmationDraft(draft);dirty=Object.keys(draft.edits).length>0;hint.textContent=dirty?'Email amended — your changes will be sent and recorded in Messages.':'Click any text below to edit it. Changes apply to this email only.';});
   // Always paste plain text, including in browsers with older editing support.
   doc.addEventListener('paste',e=>{if(!editable)return;e.preventDefault();doc.execCommand('insertText',false,e.clipboardData?.getData('text/plain')||'');});
  }
  preview.addEventListener('load',prepareEditor);
  const send=button('Send confirmation email',async()=>{
   if(sending||send.disabled)return;
   if(editable&&!fields().length){status.textContent='Wait for the email preview to finish loading.';return;}
   submittedEdits??=editable?edits():{};
   sending=true;send.disabled=true;lock();status.textContent='Sending…';
   try{
    const result=await api('confirmation-send',{job_id:job.id,edits:submittedEdits});dirty=false;
    status.textContent=result.audit_pending?'Accepted by the email provider; the delivery record needs checking.':'Confirmation email sent.';
    hint.textContent='The sent wording is recorded in Messages.';
    window.dispatchEvent?.(new Event('vecta-portal-changed'));
    if(result.accepted){forget();if(!result.audit_pending)dialog.close();}
   }catch(e){
    status.textContent=e.message;send.disabled=false;
    hint.textContent='Your wording is kept for retry. Reopen the preview to check the send status.';
   }finally{sending=false;}
  });send.disabled=true;
  function close(){if(sending)return;if(dirty&&!window.confirm('Discard your unsent email changes?'))return;forget();dialog.close();}
  dialog.append(title,status,hint,preview,send,button('Close',close));document.body.append(dialog);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});title.tabIndex=-1;title.setAttribute('autofocus','');dialog.showModal();title.focus?.();
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  try{
   const data=await api('confirmation-preview',{job_id:job.id});
   if(!dialog.isConnected||dialog.open===false)return;
   editable=data.editable===true;
   if(draft.identity!==data.confirmation_id)draft.edits={};
   draft.identity=data.confirmation_id;
   if(data.status==='sent')forget();else storeConfirmationDraft(draft);
   preview.srcdoc=data.html;
   hint.textContent=editable?'Click any text below to edit it. Changes apply to this email only.':'This email keeps its original wording because it has already been submitted.';
   status.textContent='To: '+data.email+(data.has_image?' · Includes saved vehicle image.':' · No saved vehicle image available.')+(data.test?' Test preview — email sending is disabled.':data.status==='pending'?' The earlier send is not yet confirmed. Check its status before sending another copy.':data.send_error?' '+data.send_error:'');
   send.disabled=data.test||data.status==='sent'||data.status==='pending';
   if(data.status==='sent')send.textContent='Already sent';else if(data.status==='failed')send.textContent='Retry confirmation email';
  }catch(e){status.textContent=e.message;}
 }
 let bookingCount=null;
 function clearBookingNotifications(count){
  bookingCount=count;if(count!==0)return;
  Promise.resolve(navigator.serviceWorker?.getRegistration?.()).then(async registration=>{
   for(const notification of await registration?.getNotifications?.()||[])if(bookingCount===0&&notification.tag==='vecta-website-bookings')notification.close();
  }).catch(()=>{});
 }
 window.VectaPortalWorkshop={mount,mountInbox,confirmation,prepareConfirmation,clearBookingNotifications,showResponse};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
