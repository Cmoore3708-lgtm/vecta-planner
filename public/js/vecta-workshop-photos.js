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
  const after=modal.querySelector('.jobWorkSection');if(!after)return;
  const panel=document.createElement('section');panel.className='jobFormSection workshopPhotos';
  panel.innerHTML='<div class="workshopPhotosHeading"><div><h3>Workshop photos <span>— Visible to customer</span></h3><p>Show what you have found. Uploaded photos appear on the customer’s progress page.</p></div></div>';
  after.after(panel);
  if(!saved){const hint=document.createElement('p');hint.textContent='Save this job, then reopen it to add photos.';panel.append(hint);return;}
  panel.insertAdjacentHTML('beforeend','<div class="workshopPhotoActions"><button type="button" class="btn" data-photo-camera>Take photo</button><button type="button" class="btn" data-photo-choose>Upload photos</button><button type="button" class="btn" data-photo-refresh>Refresh photos</button></div><input type="file" accept="image/*" capture="environment" data-photo-camera-input hidden><input type="file" accept="image/*" multiple data-photo-choose-input hidden><div class="workshopPhotoDrafts" data-photo-drafts></div><div class="workshopPhotoGrid" data-photo-saved></div><p class="workshopPhotoStatus" data-photo-status role="status" aria-live="polite"></p>');
  panel.insertAdjacentHTML('beforeend','<details class="approvalComposer"><summary>Request customer approval</summary><label>What would you like the customer to approve?<textarea data-approval-message maxlength="1200" placeholder="Replace the nearside front tyre for £85 including VAT?"></textarea></label><div class="workshopPhotoActions"><button type="button" class="btn green" data-approval-send>Request approval by email</button><button type="button" class="btn" data-photo-only hidden>Upload photos only</button></div><p role="status" data-approval-notice></p></details><div data-approval-history></div>');
  const composer=panel.querySelector('.approvalComposer');
  const messageInput=panel.querySelector('[data-approval-message]');
  const approvalButton=panel.querySelector('[data-approval-send]');
  const approvalNotice=panel.querySelector('[data-approval-notice]');
  const history=panel.querySelector('[data-approval-history]');
  let busy=false,photos=[],drafts=[],pendingRequest=null,historyTimer;
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
   approvalButton.textContent=drafts.length?'Upload & request approval by email':'Request approval by email';
   draftGrid.replaceChildren();
   drafts.forEach(draft=>{const card=document.createElement('div');card.className='workshopPhotoDraft';const title=document.createElement('strong');title.textContent='Not uploaded yet';const text=caption(draft.caption,'Caption for new photo');text.oninput=()=>{draft.caption=text.value;};card.append(image(draft.image,draft.caption),title,text,button('Remove',()=>{drafts=drafts.filter(item=>item!==draft);renderDrafts();}));draftGrid.append(card);});
   photosOnly.hidden=!drafts.length;
  }
  function renderSaved(){
   savedGrid.replaceChildren();
   photos.forEach(photo=>{
    const card=document.createElement('figure'),text=caption(photo.caption||'','Caption for uploaded photo');
    if(safeUrl(photo.url)){const link=document.createElement('a');link.href=photo.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label','Open full photo');const img=image(photo.url,photo.caption);img.onerror=()=>{status.textContent='A photo could not be opened. Refresh photos to try again.';};link.append(img);card.append(link);}
    const label=document.createElement('figcaption');label.textContent='Visible to customer';
    const actions=document.createElement('div');actions.className='workshopPhotoActions';
    actions.append(button('Save caption',()=>mutate('photos-caption',{photo_id:photo.id,caption:text.value},'Caption saved.')),button('Remove',()=>{if(confirm('Remove this photo from the job and customer’s progress page?'))mutate('photos-delete',{photo_id:photo.id},'Photo removed.');}));
    card.append(label,text,actions);savedGrid.append(card);
   });
  }
  async function load(){const data=await request(job,'photos-list');photos=data.photos||[];renderSaved();}
  async function refresh(){if(busy)return;loadApprovalHistory();lock(true);status.textContent='Loading workshop photos…';try{await load();status.textContent=photos.length?photos.length+' of 12 photos uploaded.':'No workshop photos yet. Add a photo of anything the customer should see.';}catch(error){status.textContent=error.message;}finally{lock(false);}}
  async function mutate(action,body,message){if(busy)return;lock(true);status.textContent='Saving…';try{await request(job,action,body);await load();status.textContent=message;}catch(error){status.textContent=error.message;}finally{lock(false);}}
  async function choose(input){
   const files=Array.from(input.files||[]);input.value='';if(busy||pendingRequest||!files.length)return;
   if(photos.length+drafts.length+files.length>MAX){status.textContent='You can save up to 12 photos per job. Choose fewer photos or remove one first.';return;}
   lock(true);status.textContent='Preparing photos…';
   try{composer.open=true;for(const file of files){drafts.push({id:crypto.randomUUID(),image:await compress(file),caption:''});}status.textContent='Add a caption or write the work you want approved below.';}
   catch(error){status.textContent=error.message;}
   finally{renderDrafts();lock(false);}
  }
  async function loadApprovalHistory(){
   clearTimeout(historyTimer);
   try {
    const {approvals}=await request(job,'approval-list');
    if (!panel.isConnected) return;
    history.replaceChildren();
    const labels={pending:'Awaiting customer approval',approved:'Customer approved',declined:'Customer declined',closed:'Request closed'};
    const methods={sent:'Email sent',pending:'Email delivery unconfirmed',failed:'Email failed',unsent:'Email not sent',test:'Test only — no email sent'};
    for (const item of approvals) {
     const entry=document.createElement('div');
     entry.className='approvalRecord';
     const title=document.createElement('strong'),message=document.createElement('p');
     title.textContent=labels[item.status]||item.status;
     message.textContent=item.message;
     entry.append(title,message);
     if (item.status==='pending') {
      const delivery=document.createElement('small');
      delivery.textContent=methods[item.delivery]||'Check email delivery';
      entry.append(delivery);
      if (['failed','unsent'].includes(item.delivery)) entry.append(button('Retry email',async()=>{
       if(busy)return;
       lock(true);
       try {await request(job,'approval-retry',{approval_id:item.id});approvalNotice.textContent='Approval email sent.';}
       catch(error){approvalNotice.textContent=error.message;}
       finally{composer.open=true;lock(false);loadApprovalHistory();}
      }));
     }
     history.append(entry);
    }
    if (approvals.some(item=>item.status==='pending')) historyTimer=setTimeout(()=>{if(panel.isConnected) loadApprovalHistory();},60000);
   } catch(error) {history.textContent='Approval history: '+error.message;}
  }
  function showDelivery(result){
   approvalNotice.replaceChildren();
   if(result.delivery==='test'){
    approvalNotice.append('Test only. ');
    const link=document.createElement('a');
    link.href=result.url;link.textContent='Preview customer approval';link.target='_blank';link.rel='noopener noreferrer';
    approvalNotice.append(link);
   } else approvalNotice.textContent=result.delivery==='sent'?'Approval request emailed to the customer.':'Approval saved. Check email delivery in Message Centre.';
  }
  async function uploadDrafts(withApproval){
   if(busy)return;
   if (pendingRequest && !withApproval){approvalNotice.textContent='Finish the pending approval request before sharing more photos.';return;}
   if (withApproval && !pendingRequest) {
    const message=messageInput.value.trim()||drafts.map(item=>item.caption.trim()).filter(Boolean).join('\n');
    if(!message||message.length>1200){composer.open=true;approvalNotice.textContent='Enter the work you want approved. Include the price if you have quoted one.';messageInput.focus();return;}
    pendingRequest={approval_id:crypto.randomUUID(),message,photo_ids:drafts.map(item=>item.id)};
    messageInput.value=message;
   }
   lock(true);let uploaded=0;const total=drafts.length;
   try{
    for(const draft of drafts.slice()){
     status.textContent='Uploading photo '+(uploaded+1)+' of '+total+'… Keep this job open.';
     await request(job,'photos-upload',{photo_id:draft.id,image:draft.image,caption:draft.caption});
     drafts=drafts.filter(item=>item!==draft);uploaded++;
    }
    if(withApproval){
     approvalNotice.textContent='Saving the request and emailing the customer…';
     const result=await request(job,'approval-request',pendingRequest);
     pendingRequest=null;messageInput.value='';showDelivery(result);
    }
    await load();
    if(uploaded)status.textContent=uploaded+' photo'+(uploaded===1?'':'s')+' uploaded. Visible on the customer’s next progress refresh.';
   }catch(error){
    status.textContent=(uploaded?uploaded+' photo(s) saved. ':'')+error.message;
    if(withApproval)approvalNotice.textContent=error.message;
   } finally {
    if(withApproval)loadApprovalHistory();
    renderDrafts();lock(false);
    if(pendingRequest) {
     messageInput.readOnly=true;
     approvalButton.textContent='Retry approval request';
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
