(function(){
 'use strict';
 const MAX=12;
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
  if(job.no_vehicle||job.card_type&&job.card_type!=='job'||['quote','provisional','cancelled','deleted'].includes(job.status)||/vehicle tax|pool car tax/i.test(job.job_type||''))return;
  const mechanic=!!window.VECTA_MECHANIC_DEPLOYMENT;
  const after=modal.querySelector('.jobWorkSection');if(!after)return;
  const panel=document.createElement('section');panel.className='jobFormSection workshopPhotos';
  panel.innerHTML='<div class="workshopPhotosHeading"><div><h3>Workshop photos &amp; findings</h3><p>Send a finding to Workshop. The customer sees it after the estimate is sent.</p></div></div>';
  after.after(panel);
  if(!saved){const hint=document.createElement('p');hint.textContent='Save this job, then reopen it to add photos.';panel.append(hint);return;}
  panel.insertAdjacentHTML('beforeend','<div class="workshopPhotoActions"><button type="button" class="btn" data-photo-camera>Take photo</button><button type="button" class="btn" data-photo-choose>Upload photos</button><button type="button" class="btn" data-photo-refresh>Refresh photos</button></div><input type="file" accept="image/*" capture="environment" data-photo-camera-input hidden><input type="file" accept="image/*" multiple data-photo-choose-input hidden><div class="workshopPhotoDrafts" data-photo-drafts></div><div class="workshopPhotoGrid" data-photo-saved></div><p class="workshopPhotoStatus" data-photo-status role="status" aria-live="polite"></p>');
  panel.insertAdjacentHTML('beforeend','<details class="approvalComposer"><summary>Send a finding to Workshop</summary><label>Message about the work needed<textarea data-approval-message maxlength="1200" placeholder="The nearside front tyre is worn through on the inner edge. We recommend replacing it."></textarea></label><div class="workshopPhotoActions"><button type="button" class="btn green" data-approval-send>Send to Workshop for pricing</button><button type="button" class="btn" data-photo-only hidden>Upload photos only</button></div><p role="status" data-approval-notice></p></details><div data-approval-history></div>');
  const composer=panel.querySelector('.approvalComposer');
  const messageInput=panel.querySelector('[data-approval-message]');
  const approvalButton=panel.querySelector('[data-approval-send]');
  const approvalNotice=panel.querySelector('[data-approval-notice]');
  const history=panel.querySelector('[data-approval-history]');
  let busy=false,photos=[],drafts=[],pendingRequest=null,recovered=null,historyTimer;
  let submittedIds=new Set();
  const status=panel.querySelector('[data-photo-status]'),draftGrid=panel.querySelector('[data-photo-drafts]'),savedGrid=panel.querySelector('[data-photo-saved]');
  const photosOnly=panel.querySelector('[data-photo-only]');
  draftGrid.after(composer);
  function lock(value){
   busy=value;
   panel.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);
   if(pendingRequest)panel.querySelectorAll('[data-photo-only],[data-photo-choose],[data-photo-camera],[data-photo-drafts] button,[data-photo-drafts] textarea').forEach(el=>el.disabled=true);
   panel.setAttribute('aria-busy',String(value));
  }
  const button=(label,fn)=>{const el=document.createElement('button');el.type='button';el.className='btn';el.textContent=label;el.onclick=fn;return el;};
  const image=(src,caption)=>{const el=document.createElement('img');el.src=src;el.alt=caption||'Workshop inspection photo';el.loading='lazy';return el;};
  const caption=(value,label)=>{const el=document.createElement('textarea');el.rows=2;el.maxLength=500;el.value=value;el.placeholder='e.g. Nearside front tyre worn through on the inner edge.';el.setAttribute('aria-label',label);return el;};
  function renderDrafts(){
   approvalButton.textContent='Send to Workshop for pricing';
   draftGrid.replaceChildren();
   drafts.forEach(draft=>{const card=document.createElement('div');card.className='workshopPhotoDraft';const title=document.createElement('strong');title.textContent='Not uploaded yet';const text=caption(draft.caption,'Caption for new photo');text.oninput=()=>{draft.caption=text.value;};card.append(image(draft.image,draft.caption),title,text,button('Remove',()=>{drafts=drafts.filter(item=>item!==draft);renderDrafts();}));draftGrid.append(card);});
   photosOnly.hidden=mechanic||!drafts.length;
  }
  function renderSaved(){
   savedGrid.replaceChildren();
   photos.forEach(photo=>{
    const card=document.createElement('figure'),text=caption(photo.caption||'','Caption for uploaded photo');
    if(safeUrl(photo.url)){const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Open full photo');const img=image(photo.url,photo.caption);img.onerror=()=>{status.textContent='A photo could not be opened. Refresh photos to try again.';};link.append(img);card.append(link);}
    const label=document.createElement('figcaption');label.textContent=photo.private_finding?'Private workshop photo':'Visible to customer';
    const actions=document.createElement('div');actions.className='workshopPhotoActions';
    actions.append(button('Save caption',()=>mutate('photos-caption',{photo_id:photo.id,caption:text.value},'Caption saved.')),button('Remove',()=>{if(confirm('Remove this photo from the job and customer’s progress page?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
    card.append(label,text);
    if(!photo.private_finding&&!mechanic)card.append(actions);
    else {
     text.readOnly=true;
     if(photo.private_finding && photo.review_id && !submittedIds.has(photo.review_id)){
      card.append(button('Finish private finding',()=>{
       if(busy||pendingRequest)return;
       const group=photos.filter(item=>item.private_finding&&item.review_id===photo.review_id);
       recovered={id:photo.review_id,photo_ids:group.map(item=>item.id)};
       composer.open=true;messageInput.value=group.map(item=>item.caption).filter(Boolean).join('\n');
       approvalNotice.textContent='Add the finding for these saved private photos.';messageInput.focus();
      }));
      card.append(button('Remove private photo',()=>{if(confirm('Remove this private photo?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
     }
    }
    savedGrid.append(card);
   });
  }
  async function load(){const data=await request(job,'photos-list');photos=data.photos||[];renderSaved();}
  async function refresh(){if(busy)return;loadApprovalHistory();lock(true);status.textContent='Loading workshop photos…';try{await load();status.textContent=photos.length?photos.length+' of 12 photos uploaded.':'No workshop photos yet. Add a photo of anything the customer should see.';}catch(error){status.textContent=error.message;}finally{lock(false);}}
  async function mutate(action,body,message){if(busy)return;lock(true);status.textContent='Saving…';try{await request(job,action,body);await load();status.textContent=message;}catch(error){status.textContent=error.message;}finally{lock(false);}}
  async function choose(input){
   const files=Array.from(input.files||[]);input.value='';if(busy||pendingRequest||!files.length)return;
   if(photos.length+drafts.length+files.length>MAX){status.textContent='You can save up to 12 photos per job. Choose fewer photos or remove one first.';return;}
   lock(true);status.textContent='Preparing photos…';
   try{composer.open=true;for(const file of files){drafts.push({id:crypto.randomUUID(),image:await compress(file),caption:''});}status.textContent='Write the finding below or use the photo caption.';}
   catch(error){status.textContent=error.message;}
   finally{renderDrafts();lock(false);}
  }
  async function loadApprovalHistory(){
   clearTimeout(historyTimer);
   if(document.activeElement?.closest('.findingReview')&&history.contains(document.activeElement)){
    historyTimer=setTimeout(()=>{if(panel.isConnected)loadApprovalHistory();},15000);return;
   }
   try {
    const {approvals}=await request(job,'approval-list');
    if (!panel.isConnected) return;
    submittedIds=new Set(approvals.map(row=>row.id));
    if(photos.some(photo=>photo.private_finding))renderSaved();
    const pricingForms=new Map(Array.from(history.querySelectorAll('.findingReview')).map(form=>[form.dataset.findingId,form]));
    history.replaceChildren();
    const labels={awaiting_price:'Awaiting price in Workshop',pending:'Awaiting customer approval',approved:'Customer approved',declined:'Customer declined',closed:'Request closed'};
    for (const item of approvals) {
     const entry=document.createElement('div');
     entry.className='approvalRecord';
     const title=document.createElement('strong'),message=document.createElement('p');
     title.textContent=labels[item.status]||item.status;
     message.textContent=item.message;
     entry.append(title,message);
     if(item.status==='awaiting_price' && !mechanic && window.VectaFindings)
      entry.append(pricingForms.get(item.id)||window.VectaFindings.pricingForm(job.id,item));
     if(Number.isInteger(item.estimated_pence)){
      const estimate=document.createElement('small');estimate.textContent='Estimated total including VAT: £'+(item.estimated_pence/100).toFixed(2);entry.append(estimate);
     }
     if(item.status==='pending' && window.VectaFindings){
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
     history.append(entry);
    }
    if (approvals.some(item=>['pending','awaiting_price'].includes(item.status))) historyTimer=setTimeout(()=>{if(panel.isConnected) loadApprovalHistory();},60000);
   } catch(error) {history.textContent='Approval history: '+error.message;}
  }
  async function uploadDrafts(withApproval){
   if(busy)return;
   if (pendingRequest && !withApproval){approvalNotice.textContent='Finish the pending approval request before sharing more photos.';return;}
   if (withApproval && !pendingRequest) {
    const message=messageInput.value.trim()||drafts.map(item=>item.caption.trim()).filter(Boolean).join('\n');
    if(!message||message.length>1200){composer.open=true;approvalNotice.textContent='Describe what you found or add a photo caption.';messageInput.focus();return;}
    pendingRequest={approval_id:recovered?.id||crypto.randomUUID(),message,photo_ids:[...(recovered?.photo_ids||[]),...drafts.map(item=>item.id)]};
    messageInput.value=message;
   }
   lock(true);let uploaded=0;const total=drafts.length;
   try{
    for(const draft of drafts.slice()){
     status.textContent='Uploading photo '+(uploaded+1)+' of '+total+'… Keep this job open.';
     await request(job,'photos-upload',{photo_id:draft.id,image:draft.image,caption:draft.caption,...(withApproval?{review_id:pendingRequest.approval_id}:{})});
     drafts=drafts.filter(item=>item!==draft);uploaded++;
    }
    if(withApproval){
     approvalNotice.textContent='Sending the finding to Workshop…';
     await request(job,'approval-stage',pendingRequest);
     submittedIds.add(pendingRequest.approval_id);pendingRequest=null;recovered=null;messageInput.value='';approvalNotice.textContent='Sent to Workshop for pricing. The customer has not been contacted.';
     window.VectaFindings?.notify();
    }
    await load();
    if(uploaded)status.textContent=uploaded+' photo'+(uploaded===1?'':'s')+(withApproval?' saved privately.':' uploaded to customer progress.');
   }catch(error){
    status.textContent=(uploaded?uploaded+' photo(s) saved. ':'')+error.message;
    if(withApproval)approvalNotice.textContent=error.message;
   } finally {
    if(withApproval)loadApprovalHistory();
    renderDrafts();lock(false);
    if(pendingRequest) {
     messageInput.readOnly=true;
     approvalButton.textContent='Retry sending finding';
    } else messageInput.readOnly=false;
   }
  }
  const camera=panel.querySelector('[data-photo-camera-input]'),chooseInput=panel.querySelector('[data-photo-choose-input]');
  panel.querySelector('[data-photo-camera]').onclick=()=>camera.click();panel.querySelector('[data-photo-choose]').onclick=()=>chooseInput.click();panel.querySelector('[data-photo-refresh]').onclick=refresh;
  approvalButton.onclick=()=>uploadDrafts(true);
  photosOnly.onclick=()=>uploadDrafts(false);
  camera.onchange=()=>choose(camera);chooseInput.onchange=()=>choose(chooseInput);refresh();
 }
 window.VectaWorkshopPhotos={mount};
})();
