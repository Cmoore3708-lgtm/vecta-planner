(function(){
 'use strict';
 const MAX=12;
 const destinations=new WeakMap();
 function revealFinding(modal,item){
  const panel=modal?.querySelector('.workshopPhotos');
  const show=panel&&destinations.get(panel);
  if(!show||panel.dataset.jobId!==item.job_id)return false;
  show(item);
  return true;
 }
 async function request(job,action,extra){
  if(!navigator.onLine)throw Error('You are offline. Connect to the internet to save or view workshop photos.');
  const r=await fetch('/api/job-progress',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,job_id:job.id,...extra}),signal:AbortSignal.timeout(45000)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Photos could not be saved. Please try again.');return data;
 }
 async function compress(file){
  if(!file||file.size>20*1024*1024||!(file.type.startsWith('image/')||/\.(heic|heif)$/i.test(file.name)))throw Error('Choose an image smaller than 20 MB.');
  const url=URL.createObjectURL(file);
  try{
   const image=new Image();image.src=url;await image.decode();
   if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>60000000)throw Error('This photo is too large. Try a smaller photo.');
   const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
   for(const quality of [.86,.75,.62,.48]){const data=canvas.toDataURL('image/jpeg',quality);if(data.startsWith('data:image/jpeg;base64,')&&(data.length-23)*.75<=750000)return data;}
   throw Error('This photo is too detailed. Try a closer photo of the problem.');
  }catch(error){if(error.name==='EncodingError')throw Error('We could not open this photo. Try a JPEG, PNG or a new camera photo.');throw error;}
  finally{URL.revokeObjectURL(url);}
 }
 const safeUrl=url=>typeof url==='string'&&/^https:\/\/(?:jywufozycuwuoshlulwl|brqsejjykrubxuofavuu)\.supabase\.co\/storage\/v1\/object\/sign\/job-workshop-photos\/[a-f0-9-]{36}\.jpg\?token=[A-Za-z0-9_.-]+$/.test(url);
 function mount(modal,job,saved){
  const conversation=window.VectaPortalWorkshop?.mount(modal,job,saved);
  if(job.no_vehicle||job.card_type&&job.card_type!=='job'||['quote','provisional','cancelled','deleted'].includes(job.status)||/vehicle tax|pool car tax/i.test(job.job_type||''))return;
  const mechanic=!!window.VECTA_MECHANIC_DEPLOYMENT;
  const after=modal.querySelector('.jobInternalNotesSection')||modal.querySelector('.jobWorkSection');if(!after)return;
  const integrated=!mechanic&&!!conversation?.bindPhotos;
  const panel=document.createElement(integrated?'div':'details');panel.className=(integrated?'portalWorkshopPhotos ':'jobFormSection ')+'workshopPhotos '+(mechanic?'mechanicFindings':'managerFindings');
  panel.dataset.jobId=job.id;
  panel.innerHTML=integrated?'<div class="workshopPhotosHeading"></div>':'<summary class="workshopPhotosHeading"><h3>'+(mechanic?'Findings for the office':'Customer messages &amp; updates')+'</h3></summary>';
  const heading=panel.querySelector('.workshopPhotosHeading');
  if(mechanic)heading.insertAdjacentHTML('afterend','<p>Send a finding to the office. The customer sees it after the estimate is sent.</p>');
  if(integrated)conversation.panel.append(panel);else after.after(panel);
  if(!saved){const hint=document.createElement('p');hint.textContent='Save this job, then reopen it to send a message or add photos.';panel.append(hint);return;}
  panel.insertAdjacentHTML('beforeend','<div class="workshopPhotoActions workshopPhotoToolbar"><button type="button" class="btn" data-photo-camera>Take photo</button><button type="button" class="btn" data-photo-choose>Upload photos</button><button type="button" class="btn" data-photo-refresh>Refresh photos</button></div><input type="file" accept="image/*" capture="environment" data-photo-camera-input hidden><input type="file" accept="image/*" multiple data-photo-choose-input hidden><div class="workshopPhotoDrafts" data-photo-drafts></div><div class="workshopPhotoGrid" data-photo-saved></div><p class="workshopPhotoStatus" data-photo-status role="status" aria-live="polite"></p>');
  const recipient=mechanic?'Office':'customer';
  const sendLabel=mechanic?'Send to Office':'Continue to price & send';
  const messageForm='<label>Message to '+recipient+'<textarea data-approval-message maxlength="1200" placeholder="e.g. Your front brake pads are worn and need replacing."></textarea></label><div class="workshopPhotoActions"><button type="button" class="btn green" data-approval-send>'+sendLabel+'</button><button type="button" class="btn" data-photo-only hidden>Upload photos only</button></div><p role="status" data-approval-notice></p>';
  const container=mechanic?'<div class="approvalComposer"><p>Photos are optional.</p>'+messageForm+'</div>':'<details class="approvalComposer"'+(integrated?' hidden':'')+'><summary>Finish private finding</summary><p>Describe the work here; enter the price separately.</p>'+messageForm+'</details>';
  panel.insertAdjacentHTML('beforeend',container+'<div data-approval-history></div>');
  const composer=panel.querySelector('.approvalComposer');
  const messageInput=panel.querySelector('[data-approval-message]');
  const approvalButton=panel.querySelector('[data-approval-send]');
  const approvalNotice=panel.querySelector('[data-approval-notice]');
  const history=panel.querySelector('[data-approval-history]');
  const destination=document.createElement('section');
  destination.className='findingDestination';destination.hidden=true;destination.tabIndex=-1;
  destination.setAttribute('aria-label','Selected mechanic finding');
  heading.after(destination);
  const evidenceItems=new WeakMap();
  let selectedFinding=null,photoLoad=null,photosLoaded=false,photosError='',historyLoading=false;
  function showEvidence(){
   for(const host of panel.querySelectorAll('[data-finding-evidence]'))renderEvidence(host,evidenceItems.get(host));
  }
  function renderEvidence(host,item){
   host.replaceChildren();
   const linked=photos.filter(photo=>item.photo_ids.includes(photo.id)&&safeUrl(photo.url));
   for(const photo of linked){
    const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener noreferrer';
    const img=document.createElement('img');img.src=photo.url;img.alt=photo.caption||'Mechanic inspection photo';
    link.append(img);
    const figure=document.createElement('figure');figure.append(link);
    if(!mechanic&&!photo.private_finding){
     figure.className='findingPublicPhoto';figure.append(photoCaptionEditor(photo));
    }else if(photo.caption&&photo.caption!==item.message){
     const caption=document.createElement('figcaption');caption.textContent=photo.caption;figure.append(caption);
    }
    host.append(figure);
   }
   if(photosError||linked.length<item.photo_ids.length){
    const note=document.createElement('p');
    note.textContent=photosError||(photosLoaded?'A finding photo is no longer available.':'Loading finding photos…');
    host.append(note);
    if(photosError||photosLoaded)host.append(button('Refresh photos',()=>load().catch(()=>{})));
   }
  }
  function addEvidence(entry,item){
   if(!item.photo_ids?.length)return;
   let host=entry.querySelector('[data-finding-evidence]');
   if(!host){
    host=document.createElement('div');host.className='findingEvidence';host.dataset.findingEvidence='';
    const body=document.createElement('div');body.className='findingBody';
    body.append(...Array.from(entry.childNodes));entry.append(host,body);
   }
   evidenceItems.set(host,item);
  }
  destinations.set(panel,item=>{
   panel.setAttribute('open','');
   const previous=destination.firstElementChild;
   if(previous?.dataset.findingId){
    history.prepend(previous);
   }
   selectedFinding=item;
   const existing=Array.from(history.children).find(entry=>entry.dataset.findingId===item.id);
   const entry=existing||document.createElement('div');
   if(!existing){
    entry.className='approvalRecord';entry.dataset.findingId=item.id;
    const heading=document.createElement('strong'),note=document.createElement('p');
    heading.textContent=item.status==='approved'?'Customer approved':'Workshop finding';note.textContent=item.message;entry.append(heading,note);
   }
   addEvidence(entry,item);destination.replaceChildren(entry);destination.hidden=false;
   renderSaved();showEvidence();
   destination.focus({preventScroll:true});destination.scrollIntoView({block:'start'});
   loadApprovalHistory();load().catch(()=>{});
  });
  let busy=false,photos=[],drafts=[],pendingRequest=null,recovered=null,historyTimer,messagePhotos=0;
  let submittedIds=new Set();
  const captionDrafts=new Map();
  let preparing=null,sending=null,saveInProgress=false,photoError='';
  const save=mechanic?modal.querySelector('#saveJob'):null;
  const saveControls=save?[save,modal.querySelector('#saveJobMobile')].filter(Boolean).map(el=>[el,el.textContent]):[];
  function hasDraft(){return !!(drafts.length||pendingRequest||recovered||photoError||messageInput.value.trim()||preparing||sending);}
  function syncSaveLabels(){
   for(const [el,label] of saveControls)el.textContent=hasDraft()?'Save & send to Office':label;
  }
  messageInput.addEventListener('input',syncSaveLabels);
  const status=panel.querySelector('[data-photo-status]'),draftGrid=panel.querySelector('[data-photo-drafts]'),savedGrid=panel.querySelector('[data-photo-saved]');
  const photosOnly=panel.querySelector('[data-photo-only]');
  if(mechanic)draftGrid.before(composer);else draftGrid.after(composer);
  const discardFailed=document.createElement('button');
  if(discardFailed){
   discardFailed.type='button';discardFailed.className='btn';discardFailed.textContent='Discard failed photo';discardFailed.hidden=true;(integrated?conversation.attachments:composer).append(discardFailed);
   discardFailed.onclick=()=>{photoError='';discardFailed.hidden=true;approvalNotice.textContent='';status.textContent='';syncSaveLabels();};
  }
  function lock(value){
   busy=value;
   for(const root of [panel,...(integrated?[conversation.form]:[])])root.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);
   if(pendingRequest)panel.querySelectorAll('[data-photo-only],[data-photo-choose],[data-photo-camera],[data-photo-drafts] button,[data-photo-drafts] textarea').forEach(el=>el.disabled=true);
   panel.setAttribute('aria-busy',String(value));
  }
  const button=(label,fn)=>{const el=document.createElement('button');el.type='button';el.className='btn';el.textContent=label;el.onclick=fn;return el;};
  const image=(src,caption)=>{const el=document.createElement('img');el.src=src;el.alt=caption||'Workshop inspection photo';el.loading='lazy';return el;};
  const caption=(value,label)=>{const el=document.createElement('textarea');el.rows=2;el.maxLength=500;el.value=value;el.placeholder='e.g. Nearside front tyre worn through on the inner edge.';el.setAttribute('aria-label',label);return el;};
  function photoCaptionEditor(photo){
   const editor=document.createElement('div');editor.className='photoCaptionEditor';
   const label=document.createElement('label');label.textContent='Photo caption · visible to customer';
   const text=caption(captionDrafts.get(photo.id)??photo.caption??'','Caption for uploaded photo');
   text.rows=4;text.oninput=()=>captionDrafts.set(photo.id,text.value);label.append(text);
   const actions=document.createElement('div');actions.className='workshopPhotoActions';
   actions.append(button('Save caption',async()=>{
    const value=text.value;
    if(await mutate('photos-caption',{photo_id:photo.id,caption:value},'Caption saved.')&&captionDrafts.get(photo.id)===value)captionDrafts.delete(photo.id);
   }),button('Remove',()=>{if(confirm('Remove this photo from the job and customer’s progress page?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
   editor.append(label,actions);return editor;
  }
  function renderDrafts(){
   approvalButton.textContent=sendLabel;
   draftGrid.replaceChildren();
   drafts.forEach(draft=>{
    const card=document.createElement('div');card.className='workshopPhotoDraft';
    const title=document.createElement('strong');title.textContent=mechanic?'Ready to send':'Not uploaded yet';
    card.append(image(draft.image,draft.caption),title);
    if(!mechanic){
     const text=caption(draft.caption,'Caption for new photo');text.oninput=()=>{draft.caption=text.value;};card.append(text);
    }
    card.append(button('Remove',()=>{drafts=drafts.filter(item=>item!==draft);renderDrafts();}));draftGrid.append(card);
   });
   syncSaveLabels();
   photosOnly.hidden=integrated||mechanic||!drafts.length;
  }
  function renderSaved(){
   savedGrid.replaceChildren();
   const groupedIds=new Set(Array.from(panel.querySelectorAll('[data-finding-evidence]')).flatMap(host=>evidenceItems.get(host).photo_ids));
   photos.forEach(photo=>{
    if(groupedIds.has(photo.id))return;
    const card=document.createElement('figure'),text=caption(photo.caption||'','Caption for uploaded photo');
    if(safeUrl(photo.url)){const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Open full photo');const img=image(photo.url,photo.caption);img.onerror=()=>{status.textContent='A photo could not be opened. Refresh photos to try again.';};link.append(img);card.append(link);}
    const label=document.createElement('figcaption');label.textContent=photo.private_finding?'Private workshop photo':'Visible to customer';
    const actions=document.createElement('div');actions.className='workshopPhotoActions';
    actions.append(button('Save caption',()=>mutate('photos-caption',{photo_id:photo.id,caption:text.value},'Caption saved.')),button('Remove',()=>{if(confirm('Remove this photo from the job and customer’s progress page?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
    if(!photo.private_finding&&!mechanic){
     card.className='findingPublicPhoto';card.append(photoCaptionEditor(photo));savedGrid.append(card);return;
    }
    card.append(label);
    if(photo.private_finding&&!mechanic){
     if(photo.caption){const note=document.createElement('p');note.textContent=photo.caption;card.append(note);}
    }else card.append(text);
    if(!photo.private_finding&&!mechanic)card.append(actions);
    else {
     text.readOnly=true;
     if(photo.private_finding && photo.review_id && !submittedIds.has(photo.review_id)){
      card.append(button('Finish private finding',()=>{
       if(busy||pendingRequest)return;
       const group=photos.filter(item=>item.private_finding&&item.review_id===photo.review_id);
       recovered={id:photo.review_id,photo_ids:group.map(item=>item.id)};
       composer.hidden=false;composer.open=true;messageInput.value=group.map(item=>item.caption).filter(Boolean).join('\n');
       approvalNotice.textContent='Add the finding for these saved private photos.';messageInput.focus();
      }));
      card.append(button('Remove private photo',()=>{if(confirm('Remove this private photo?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
     }
    }
    savedGrid.append(card);
   });
  }
  function load(){
   if(photoLoad)return photoLoad;
   photoLoad=request(job,'photos-list').then(data=>{
    photos=data.photos||[];photosLoaded=true;photosError='';renderSaved();
   }).catch(error=>{photosError=error.message;throw error;}).finally(()=>{photoLoad=null;showEvidence();});
   return photoLoad;
  }
  async function refresh(){if(busy)return;loadApprovalHistory();lock(true);status.textContent='Loading workshop photos…';try{await load();status.textContent=photos.length?photos.length+' of 12 photos uploaded.':(mechanic?'No workshop photos yet. Add a photo of anything the customer should see.':'');}catch(error){status.textContent=error.message;}finally{lock(false);}}
  async function mutate(action,body,message){if(busy)return false;lock(true);status.textContent='Saving…';try{await request(job,action,body);await load();status.textContent=message;return true;}catch(error){status.textContent=error.message;return false;}finally{lock(false);}}
  async function prepareFiles(input){
   const files=Array.from(input.files||[]);input.value='';if(busy||pendingRequest||!files.length)return;
   if(photos.length+drafts.length+files.length>MAX){status.textContent='You can save up to 12 photos per job. Choose fewer photos or remove one first.';return;}
   lock(true);photoError='';if(discardFailed)discardFailed.hidden=true;status.textContent='Preparing photos…';
   try{if(!integrated)composer.open=true;for(const file of files){drafts.push({id:crypto.randomUUID(),image:await compress(file),caption:''});}approvalNotice.textContent='';status.textContent=integrated?'Photo ready. Add a message if you wish, then send.':mechanic?'Photo ready. Add your message and tap '+sendLabel+'.':'Write the finding or use the photo caption.';}
   catch(error){
    status.textContent=error.message;
    photoError=error.message;approvalNotice.textContent=photoError;discardFailed.hidden=false;
   }
   finally{renderDrafts();lock(false);}
  }
  function choose(input){
   if(preparing)return preparing;
   preparing=prepareFiles(input).finally(()=>{preparing=null;syncSaveLabels();});
   syncSaveLabels();return preparing;
  }
  async function loadApprovalHistory(){
   clearTimeout(historyTimer);
   if(historyLoading)return;
   if(document.activeElement?.closest('.findingReview,.photoCaptionEditor')&&panel.contains(document.activeElement)){
    historyTimer=setTimeout(()=>{if(panel.isConnected)loadApprovalHistory();},15000);return;
   }
   historyLoading=true;
   try {
    const {approvals}=await request(job,'approval-list');
    if (!panel.isConnected) return;
    submittedIds=new Set(approvals.map(row=>row.id));
    const pricingForms=new Map(Array.from(panel.querySelectorAll('.findingReview')).map(form=>[form.dataset.findingId,form]));
    history.replaceChildren();
    const labels={awaiting_price:mechanic?'Awaiting price from the office':'Awaiting price in Workshop',pending:'Awaiting customer approval',approved:'Customer approved',declined:'Customer declined',closed:'Request closed'};
    for (const item of approvals) {
     const entry=document.createElement('div');
     entry.className='approvalRecord';entry.dataset.findingId=item.id;entry.dataset.reviewState=item.status;
     const title=document.createElement('strong'),message=document.createElement('p');
     title.textContent=labels[item.status]||item.status;
     message.textContent=item.message;
     entry.append(title,message);
     if(item.status==='awaiting_price' && !mechanic && window.VectaFindings)
      entry.append(pricingForms.get(item.id)||window.VectaFindings.pricingForm(job.id,item));
     if(!mechanic&&Number.isInteger(item.estimated_pence)){
      const estimate=document.createElement('small');estimate.textContent='Estimated total including VAT: £'+(item.estimated_pence/100).toFixed(2);entry.append(estimate);
     }
     if(!mechanic&&item.status==='pending' && window.VectaFindings){
      const delivery=document.createElement('small');delivery.textContent=window.VectaFindings.delivery(item.channels);entry.append(delivery);
      const canRetry=Object.values(item.channels||{}).some(value=>['failed','unsent','unavailable','manual'].includes(value));
      if(!mechanic&&canRetry)entry.append(button(item.channels.whatsapp==='manual'?'Prepare WhatsApp message':'Retry unsent messages',async()=>{
       if(busy)return;
       lock(true);composer.open=true;
       try{window.VectaFindings.showResult(approvalNotice,await request(job,'approval-retry',{approval_id:item.id}));}
       catch(error){approvalNotice.textContent=error.message;}
       finally{lock(false);loadApprovalHistory();}
      }));
     }
     const selected=selectedFinding?.id===item.id;
     if(!mechanic)addEvidence(entry,item);
     if(selected){
      selectedFinding=item;destination.replaceChildren(entry);destination.hidden=false;
     }else history.append(entry);
    }
    renderSaved();
    showEvidence();
    if(!mechanic&&selectedFinding?.status==='awaiting_price')destination.scrollIntoView({block:'nearest'});
    if (approvals.some(item=>['pending','awaiting_price'].includes(item.status))) historyTimer=setTimeout(()=>{if(panel.isConnected) loadApprovalHistory();},60000);
   } catch(error) {history.textContent='Approval history: '+error.message;renderSaved();}finally{historyLoading=false;}
  }
  async function uploadDrafts(withApproval){
   if(busy)return false;
   if(photoError){approvalNotice.textContent=photoError+' Retake or discard the failed photo before sending.';discardFailed?.focus();return false;}
   if (pendingRequest && !withApproval){approvalNotice.textContent='Finish the pending approval request before sharing more photos.';return;}
   if (withApproval && !pendingRequest) {
    const message=messageInput.value.trim()||drafts.map(item=>item.caption.trim()).filter(Boolean).join('\n');
    if(!message||message.length>1200){composer.open=true;approvalNotice.textContent=mechanic?'Add a message for the office. Your photo is still here.':'Describe what you found or add a photo caption.';messageInput.focus();return false;}
    pendingRequest={approval_id:recovered?.id||crypto.randomUUID(),message,photo_ids:[...(recovered?.photo_ids||[]),...drafts.map(item=>item.id)]};
    messageInput.value=message;
   }
   lock(true);let uploaded=0;const total=drafts.length;
   try{
    for(const draft of drafts.slice()){
     status.textContent='Uploading photo '+(uploaded+1)+' of '+total+'… Keep this job open.';
     await request(job,'photos-upload',{photo_id:draft.id,image:draft.image,caption:draft.caption,...(withApproval?{review_id:pendingRequest.approval_id}:{})});
     drafts=drafts.filter(item=>item!==draft);uploaded++;if(integrated&&!withApproval)messagePhotos++;
    }
    if(withApproval){
     approvalNotice.textContent='Sending the finding to '+recipient+'…';
     const receipt=await request(job,'approval-stage',pendingRequest);
     if(receipt.approval_id!==pendingRequest.approval_id||!['draft','sent'].includes(receipt.stage))
      throw Error(recipient+' has not confirmed this finding. Retry to check it.');
     submittedIds.add(pendingRequest.approval_id);pendingRequest=null;recovered=null;messageInput.value='';approvalNotice.textContent=mechanic?'Sent to Office for pricing. The customer has not been contacted.':'Message saved. Add the price below, then send to your customer.';
     if(!mechanic){selectedFinding={id:receipt.approval_id};if(integrated)composer.hidden=true;}
     window.VectaFindings?.notify();
     if(mechanic)confirmSent();
    }
    try{await load();}catch(error){
     status.textContent=error.message;
     // The server already confirmed the submission. A gallery refresh cannot undo it.
     return true;
    }
    if(uploaded)status.textContent=uploaded+' photo'+(uploaded===1?'':'s')+(withApproval?' saved privately.':' uploaded to customer progress.');
    return true;
   }catch(error){
    status.textContent=(uploaded?uploaded+' photo(s) saved. ':'')+error.message;
    if(withApproval)approvalNotice.textContent=error.message;
    return false;
   } finally {
    if(withApproval)loadApprovalHistory();
    renderDrafts();lock(false);
    if(pendingRequest) {
     messageInput.readOnly=true;
     approvalButton.textContent='Retry sending finding';
    } else messageInput.readOnly=false;
   }
  }
  function sendFinding(){
   if(sending)return sending;
   sending=(async()=>{if(preparing)await preparing;return uploadDrafts(true);})().finally(()=>{sending=null;syncSaveLabels();});
   return sending;
  }
  function confirmSent(){
   document.querySelector('.workshopFindingReceipt')?.remove();
   const receipt=document.createElement('div');receipt.className='workshopFindingReceipt';
   receipt.setAttribute('role','status');receipt.textContent='Sent to Office for pricing';
   document.body.append(receipt);setTimeout(()=>receipt.remove(),5000);
  }
  if(save && typeof save.onclick==='function'){
   // The mobile Save button delegates to this same footer action.
   for(const close of modal.querySelectorAll('#cancelJob,[data-close-modal]')){
    const closeJob=close.onclick;
    if(typeof closeJob!=='function')continue;
    close.onclick=function(event){
     if(preparing||sending||saveInProgress){approvalNotice.textContent='Please wait for the photo or finding to finish.';return;}
     if(hasDraft()&&!window.confirm('Discard this unsent finding and close the job?'))return;
     return closeJob.call(this,event);
    };
   }
   const saveJob=save.onclick;
   save.onclick=async function(event){
    if(saveInProgress)return;
    if(!hasDraft())return saveJob.call(this,event);
    panel.setAttribute('open','');
    saveInProgress=true;
    try {
     if(preparing)await preparing;
     if((sending||hasDraft())&&!await sendFinding())return;
     if(panel.isConnected&&modal.contains(panel))return saveJob.call(this,event);
    } finally{saveInProgress=false;}
   };
  }
  const camera=panel.querySelector('[data-photo-camera-input]'),chooseInput=panel.querySelector('[data-photo-choose-input]');
  panel.querySelector('[data-photo-camera]').onclick=()=>camera.click();panel.querySelector('[data-photo-choose]').onclick=()=>chooseInput.click();panel.querySelector('[data-photo-refresh]').onclick=refresh;
  approvalButton.onclick=sendFinding;
  photosOnly.onclick=()=>uploadDrafts(false);
  if(integrated){
   const toolbar=panel.querySelector('.workshopPhotoToolbar'),refreshButton=panel.querySelector('[data-photo-refresh]');
   panel.querySelector('[data-photo-choose]').textContent='Upload photo';
   heading.append(refreshButton);
   conversation.attachments.prepend(toolbar,camera,chooseInput,draftGrid,status);
   conversation.bindPhotos({
    busy:()=>!!(busy||preparing||sending||pendingRequest||recovered),
    hasDraft:()=>!!(drafts.length||messagePhotos||photoError),
    upload:()=>drafts.length||photoError?uploadDrafts(false):Promise.resolve(true),
    complete:()=>{messagePhotos=0;},lock
   });
  }
  camera.onchange=()=>choose(camera);chooseInput.onchange=()=>choose(chooseInput);refresh();
 }
 window.VectaWorkshopPhotos={mount,revealFinding};
})();
