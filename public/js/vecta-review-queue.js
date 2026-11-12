(function(){
 'use strict';
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 async function api(action,body={}){
  const response=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Workshop findings are unavailable.');
  return result;
 }
 function notify(){window.dispatchEvent(new Event('vecta-findings-changed'));}
 function noteAlerts(jobs,isDeleted,readNotes){
  if(window.VECTA_MECHANIC_DEPLOYMENT===true)return [];
  return jobs.filter(job=>job&&!isDeleted(job)).map(job=>{
   const match=String(job.customer_note||'').match(/\[\[VECTA_INTERNAL_NOTE_UPDATE:([a-f0-9-]{36})\]\]/i);
   return match?{id:match[1],job_id:job.id,registration:job.registration||job.vehicle||'Job',message:readNotes(job)||'Workshop notes cleared.',internal_note:true,mechanic_finding:true,photo_ids:[]}:null;
  }).filter(Boolean);
 }
 function workshopNotes(){return window.vectaWorkshopNoteAlerts?.()||[];}
 const states={sent:'sent',pending:'send unconfirmed',failed:'send failed',test:'Test only',missing_contact:'missing contact',no_permission:'no permission',
   not_configured:'sender not connected',manual:'ready to send in WhatsApp',unsent:'not sent',unavailable:'status unavailable'};
 function delivery(channels){return 'Email '+(states[channels?.email]||'status unavailable')+' · WhatsApp '+(channels?.whatsapp==='sent'?'accepted':states[channels?.whatsapp]||'status unavailable');}
 function showResult(host,result,tab){
  host.replaceChildren(node('p',delivery(result.channels)));
  if(result.manual_url&&/^https:\/\/wa\.me\/\d+\?text=/.test(result.manual_url)){
    if(tab)tab.location.replace(result.manual_url);
    const link=node('a','Open WhatsApp and tap Send');link.href=result.manual_url;link.target='_blank';link.rel='noopener noreferrer';host.append(link);
  }else{
    if(tab)tab.close();
    if(result.url){
     const link=node('a','Preview customer estimate');link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';host.append(link);
    }
  }
 }
 // Shared between the job card and Main's waiting-for-price list.
 function pricingForm(jobId,item){
  const wrap=node('div');wrap.className='findingReview';wrap.dataset.findingId=item.id;
  const messageLabel=node('label','Customer description'),message=node('textarea');
  messageLabel.className='findingMessageLabel';message.rows=3;message.maxLength=1200;message.value=item.message||'';
  messageLabel.append(message,node('small','This wording will appear on the customer’s approval page.'));
  const priceLabel=node('label','Estimated total including VAT (£)'),price=node('input');
  priceLabel.className='findingPriceLabel';
  price.type='text';price.inputMode='decimal';price.placeholder='0.00';priceLabel.append(price);
  const consentLabel=node('label'),consent=node('input');consent.type='checkbox';consentLabel.hidden=true;
  const contactText=node('span');consentLabel.append(consent,contactText);
  const button=node('button','Send estimate to customer');button.type='button';button.className='btn green';button.disabled=true;
  const result=node('div');result.setAttribute('role','status');
  wrap.append(messageLabel,priceLabel,consentLabel,button,result);
  let contact=null,manual=false;
  async function load(){
   try{
    const info=await api('approval-list',{job_id:jobId});
    contact=info.whatsapp;
    if(contact?.phone&&!contact.unavailable){
     consentLabel.hidden=false;consent.checked=contact.allowed;
     contactText.textContent='Customer agreed to WhatsApp updates on the number ending '+contact.phone.slice(-4);
    }
    manual=contact?.manual_sender===true;
    button.disabled=false;
   }catch(error){result.textContent=error.message;}
  }
  load();
  button.onclick=async()=>{
   const description=message.value.trim();
   if(!description||description.length>1200){result.textContent='Enter a customer description (up to 1,200 characters).';message.focus();return;}
   if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(price.value.trim())){result.textContent='Enter the estimated total in pounds, including VAT.';price.focus();return;}
   let tab=null;
   if(manual && consent.checked && contact?.phone){
    tab=window.open('about:blank','_blank');
    if(tab)tab.opener=null;
   }
   button.disabled=true;price.disabled=true;message.disabled=true;consent.disabled=true;
   result.textContent='Saving the estimate and preparing the customer messages…';
   try{
    if(contact?.phone && !contact.unavailable && consent.checked!==contact.allowed){
     await api('approval-whatsapp-permission',{job_id:jobId,allowed:consent.checked,phone:contact.phone,contact_binding:contact.contact_binding});
     contact.allowed=consent.checked;
    }
    const receipt=await api('approval-request',{job_id:jobId,approval_id:item.id,estimate:price.value.trim(),message:description});
    showResult(result,receipt,tab);
    button.textContent='Estimate saved';wrap.dataset.finished='true';notify();
   }catch(error){
    if(tab)tab.close();result.textContent=error.message;
    price.disabled=false;message.disabled=false;consent.disabled=false;button.disabled=false;
   }
  };
  return wrap;
 }
 function card(item){
  const preview=item.message.length>85?item.message.slice(0,82)+'…':item.message;
  const section=node('details'),summary=node('summary',item.registration+' · '+preview);
  section.className='findingItem';section.append(summary);
  section.ontoggle=async()=>{
   if(!section.open||section.dataset.loaded)return;
   section.dataset.loaded='true';
   if(preview!==item.message)section.append(node('p',item.message));
   if(item.photo_ids.length){
    const photos=node('div');photos.className='findingThumbs';section.append(photos);
    try{
     const data=await api('photos-list',{job_id:item.job_id});
     for(const photo of data.photos.filter(p=>item.photo_ids.includes(p.id))){
      const link=node('a');link.href=photo.url;link.target='_blank';link.rel='noopener noreferrer';
      const img=node('img');img.src=photo.url;img.alt=photo.caption||'Workshop finding';link.append(img);photos.append(link);
     }
    }catch(error){photos.textContent=error.message;}
   }
   section.append(pricingForm(item.job_id,item));
  };
  return section;
 }
 function findingAlerts(mechanic=false){
  const key='vecta:acknowledged-finding-photos:v1';
  const decisionKey='vecta:acknowledged-customer-decisions:v1'+(mechanic?':mechanic':'');
  const acknowledged=new Set(),seenDecisions=new Set();
  let findings=[],decisions=[],active=null,waiting=null,opening=false;
  const eventId=item=>item.decision?item.id+':'+item.status+':'+item.decided_at:item.id;
  const popup=node('aside');popup.className='mechanicPhotoAlert';popup.hidden=true;
  popup.setAttribute('aria-label','Mechanic photo alert');
  const open=node('button'),close=node('button','×'),headline=node('strong'),description=node('span'),action=node('span','Open job card');
  open.type=close.type='button';open.className='findingAlertOpen';action.className='findingAlertAction';
  close.className='findingAlertDismiss';close.setAttribute('aria-label','Dismiss this photo alert');
  headline.setAttribute('role','status');description.className='findingAlertNote';
  const estimate=node('span');estimate.className='findingAlertEstimate';estimate.hidden=true;
  const status=node('p');status.setAttribute('role','status');
  open.append(headline,description,estimate,action);popup.append(open,close,status);document.body.append(popup);

  function readSeen(){
   for(const [storageKey,seen] of [[key,acknowledged],[decisionKey,seenDecisions]])try{
    const ids=JSON.parse(localStorage.getItem(storageKey)||'[]');
    if(Array.isArray(ids))for(const id of ids.slice(-512))seen.add(id);
   }catch{}
  }
  function acknowledge(item){
   const seen=item.decision?seenDecisions:acknowledged,storageKey=item.decision?decisionKey:key;
   readSeen();seen.add(eventId(item));
   try{localStorage.setItem(storageKey,JSON.stringify(Array.from(seen).slice(-512)));}catch{}
   redraw();
  }
  function stopWaiting(){waiting?.disconnect();waiting=null;}
  function redraw(){
   const decision=decisions.find(item=>!seenDecisions.has(eventId({...item,decision:true})));
   const next=decision?{...decision,decision:true}:findings.find(item=>(item.mechanic_finding||item.mechanic_photo&&item.photo_ids.length) && !acknowledged.has(item.id));
   if(active&&next&&eventId(active)===eventId(next)){active=next;return;}
   stopWaiting();active=next;opening=false;open.disabled=false;status.textContent='';popup.hidden=!next;
   if(!next)return;
   const title=next.decision?'Customer '+next.status:next.internal_note?'Workshop notes updated':(next.photo_ids.length?'New mechanic photo':'New mechanic finding');
   popup.classList.toggle('customerDecisionAlert',!!next.decision);popup.dataset.decision=next.decision?next.status:'';
   popup.setAttribute('aria-label',next.decision?'Customer approval response':'Mechanic update alert');
   close.setAttribute('aria-label',next.decision?'Dismiss this customer response':'Dismiss this mechanic update');
   headline.textContent=title+' · '+next.registration;
   open.setAttribute('aria-label','Open job card for '+next.registration+(next.decision?' — customer '+next.status:next.internal_note?' to review workshop notes':' to review the mechanic’s finding'));
   description.textContent=next.message;
   estimate.hidden=mechanic||!next.decision||!Number.isInteger(next.estimated_pence);
   estimate.textContent=estimate.hidden?'':'Estimated total including VAT: £'+(next.estimated_pence/100).toFixed(2);
  }
  async function openFinding(){
   if(!active||opening)return;
   const item=active;opening=true;open.disabled=true;
   try{
    const state=await window.vectaOpenFindingJob?.(item.job_id);
    if(!active||eventId(active)!==eventId(item))return;
    if(state==='busy'){
     status.textContent='Finish or close the open card. This finding will open next.';
     stopWaiting();
     const dialogs=Array.from(document.querySelectorAll('.modal'));
     if(dialogs.length){
      waiting=new MutationObserver(()=>{
       if(document.querySelector('.modal.open'))return;
       stopWaiting();openFinding();
      });
      for(const dialog of dialogs)waiting.observe(dialog,{attributes:true,attributeFilter:['class']});
     }
     return;
    }
    const modal=document.getElementById('jobModal');
    const notes=item.internal_note&&modal?.querySelector('#job_internal_workshop_notes');
    if(state!=='open'||!(notes||window.VectaWorkshopPhotos?.revealFinding(modal,item)))
     throw Error('This job could not be opened. Tap the alert to retry.');
    if(notes){
     const section=notes.closest('.jobInternalNotesSection');
     let preview=section.querySelector('[data-mechanic-note-review]');
     if(!preview){preview=node('div');preview.dataset.mechanicNoteReview='';section.append(preview);}
     const text=node('p',item.message);text.style.whiteSpace='pre-wrap';
     preview.replaceChildren(node('strong','Mechanic update — not seen by customer'),text);
     // Show the received note without overwriting any unsaved office edits.
     section.scrollIntoView({block:'center'});notes.focus({preventScroll:true});
    }
    acknowledge(item);
   }catch{if(active&&eventId(active)===eventId(item))status.textContent='This job could not be opened. Tap the alert to retry.';}
   finally{if(active&&eventId(active)===eventId(item)){opening=false;open.disabled=false;}}
  }
  open.onclick=openFinding;close.onclick=()=>{if(active)acknowledge(active);};
  window.addEventListener('storage',event=>{if(event.key===key||event.key===decisionKey){readSeen();redraw();}});
  readSeen();
  return (rows,responses=[])=>{findings=rows;decisions=responses;redraw();};
 }
 function install(){
  const mechanic=!!window.VECTA_MECHANIC_DEPLOYMENT;
  if(!document.querySelector('main.main>header.top'))return;
  if(mechanic){
   const updateAlerts=findingAlerts(true);let busy=false;
   async function refresh(){
    if(busy||document.hidden||!navigator.onLine)return;busy=true;
    try{const data=await api('approval-decisions');updateAlerts([],window.VectaPortalWorkshop?[]:data.decisions);}catch{}finally{busy=false;}
   }
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
   window.addEventListener('online',refresh);refresh();setInterval(refresh,10000);return;
  }
  const tray=node('aside'),toggle=node('button'),list=node('div'),status=node('p');tray.className='findingQueue';tray.hidden=true;
  toggle.type='button';toggle.className='btn';toggle.setAttribute('aria-expanded','false');list.hidden=true;
  tray.append(toggle,list,status);document.querySelector('main.main>header.top').after(tray);
  const entries=new Map(),updateAlerts=findingAlerts();
  let busy=false,activeCount=0,lastFindings=[],lastDecisions=[];
  function redraw(){
   tray.hidden=activeCount===0&&list.hidden;
   toggle.textContent=activeCount?'Workshop findings to price ('+activeCount+')':'Workshop findings';
  }
  toggle.onclick=()=>{
   list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));redraw();if(!list.hidden)refresh();
  };
  async function refresh(){
   if(document.hidden)return;
   updateAlerts([...workshopNotes(),...lastFindings],lastDecisions);
   if(busy||!navigator.onLine)return;
   busy=true;
   try{
    const data=await api('approval-queue');const current=new Set(data.findings.map(row=>row.id));activeCount=current.size;
    for(const [id,el] of entries){
     if(!current.has(id)&&(list.hidden||!el.open)){el.remove();entries.delete(id);}
    }
    for(const item of data.findings){
     if(!entries.has(item.id)){const el=card(item);entries.set(item.id,el);list.append(el);}
    }
    lastFindings=data.findings;lastDecisions=window.VectaPortalWorkshop?[]:data.decisions;
    status.textContent='';redraw();updateAlerts([...workshopNotes(),...lastFindings],lastDecisions);
   }catch(error){status.textContent=error.message;}finally{busy=false;}
  }
  window.addEventListener('vecta-findings-changed',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('online',refresh);
  refresh();setInterval(refresh,10000);
 }
 window.VectaFindings={noteAlerts,pricingForm,showResult,notify,delivery};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
