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
 function photoAlerts(){
  const key='vecta:acknowledged-finding-photos:v1';
  const acknowledged=new Set();
  let findings=[],active=null,waiting=null,opening=false;
  const popup=node('aside');popup.className='mechanicPhotoAlert';popup.hidden=true;
  popup.setAttribute('aria-label','Mechanic photo alert');
  const open=node('button'),close=node('button','×'),headline=node('strong'),description=node('span'),action=node('span','Open job card');
  open.type=close.type='button';open.className='findingAlertOpen';action.className='findingAlertAction';
  close.className='findingAlertDismiss';close.setAttribute('aria-label','Dismiss this photo alert');
  headline.setAttribute('role','status');description.className='findingAlertNote';
  const status=node('p');status.setAttribute('role','status');
  open.append(headline,description,action);popup.append(open,close,status);document.body.append(popup);

  function readSeen(){
   try{
    const ids=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(ids))for(const id of ids.slice(-512))acknowledged.add(id);
   }catch{}
  }
  function acknowledge(id){
   readSeen();acknowledged.add(id);
   try{localStorage.setItem(key,JSON.stringify(Array.from(acknowledged).slice(-512)));}catch{}
   redraw();
  }
  function stopWaiting(){waiting?.disconnect();waiting=null;}
  function redraw(){
   const next=findings.find(item=>item.mechanic_photo && item.photo_ids.length && !acknowledged.has(item.id));
   if(active?.id===next?.id){active=next;return;}
   stopWaiting();active=next;opening=false;open.disabled=false;status.textContent='';popup.hidden=!next;
   if(!next)return;
   headline.textContent='New mechanic photo · '+next.registration;
   open.setAttribute('aria-label','Open job card for '+next.registration+' to see the mechanic’s photo');
   description.textContent=next.message;
  }
  async function openFinding(){
   if(!active||opening)return;
   const item=active;opening=true;open.disabled=true;
   try{
    const state=await window.vectaOpenFindingJob?.(item.job_id);
    if(active?.id!==item.id)return;
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
    if(state!=='open'||!window.VectaWorkshopPhotos?.revealFinding(document.getElementById('jobModal'),item))
     throw Error('This job could not be opened. Tap the alert to retry.');
    acknowledge(item.id);
   }catch{if(active?.id===item.id)status.textContent='This job could not be opened. Tap the alert to retry.';}
   finally{if(active?.id===item.id){opening=false;open.disabled=false;}}
  }
  open.onclick=openFinding;close.onclick=()=>{if(active)acknowledge(active.id);};
  window.addEventListener('storage',event=>{if(event.key===key){readSeen();redraw();}});
  readSeen();
  return rows=>{findings=rows;redraw();};
 }
 function install(){
  if(window.VECTA_MECHANIC_DEPLOYMENT||!document.querySelector('main.main>header.top'))return;
  const tray=node('aside'),toggle=node('button'),list=node('div'),status=node('p');tray.className='findingQueue';tray.hidden=true;
  toggle.type='button';toggle.className='btn';toggle.setAttribute('aria-expanded','false');list.hidden=true;
  tray.append(toggle,list,status);document.querySelector('main.main>header.top').after(tray);
  const entries=new Map(),updateAlerts=photoAlerts();
  let busy=false,activeCount=0;
  function redraw(){
   tray.hidden=activeCount===0&&list.hidden;
   toggle.textContent=activeCount?'Workshop findings to price ('+activeCount+')':'Workshop findings';
  }
  toggle.onclick=()=>{
   list.hidden=!list.hidden;toggle.setAttribute('aria-expanded',String(!list.hidden));redraw();if(!list.hidden)refresh();
  };
  async function refresh(){
   if(busy||document.hidden||!navigator.onLine)return;
   busy=true;
   try{
    const data=await api('approval-queue');const current=new Set(data.findings.map(row=>row.id));activeCount=current.size;
    for(const [id,el] of entries){
     if(!current.has(id)&&(list.hidden||!el.open)){el.remove();entries.delete(id);}
    }
    for(const item of data.findings){
     if(!entries.has(item.id)){const el=card(item);entries.set(item.id,el);list.append(el);}
    }
    status.textContent='';redraw();updateAlerts(data.findings);
   }catch(error){status.textContent=error.message;}finally{busy=false;}
  }
  window.addEventListener('vecta-findings-changed',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('online',refresh);
  refresh();setInterval(refresh,10000);
 }
 window.VectaFindings={pricingForm,showResult,notify,delivery};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
