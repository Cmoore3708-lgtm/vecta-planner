(()=>{'use strict';
  const el=id=>document.getElementById(id),token=location.hash.slice(1);
  let timer,busy=false,failures=0,registration='',artworkKey='';
  let approvalId=token.startsWith('approval.') ? token.split('.')[1] : token && location.search ? new URLSearchParams(location.search).get('approval') : null;
  let deciding=false, approvalRender=0, approvalPhotos=[],replyId=null,replyAttempt=null;
  function openApproval(){
    const dialog=el('approvalDialog');
    if(!dialog.open)dialog.showModal();
    el('approvalTitle').focus();
  }
  function lockReply(value){
    for(const id of ['approveWork','declineWork','messageQuote','sendQuoteMessage','closeApproval'])el(id).disabled=value;
    el('quoteReply').readOnly=value||!!replyAttempt;
  }
  async function refreshApproval(decision,messageOnly=false){
    if(!approvalId || deciding || registration)return;
    const writing=!!decision||messageOnly;
    if(writing){
      const reply=el('quoteReply').value.trim();
      if(reply.length>3000||messageOnly&&!reply){el('approvalStatus').textContent='Enter a message of up to 3,000 characters.';el('quoteReply').focus();return;}
      if(replyAttempt&&(replyAttempt.decision!==decision||replyAttempt.messageOnly!==messageOnly)){el('approvalStatus').textContent='Check or retry your previous response before sending another.';return;}
      replyAttempt??={decision,messageOnly,reply,reply_id:replyId||crypto.randomUUID()};deciding=true;
    }
    const seq=++approvalRender,panel=el('approvalPanel'),buttons=el('approvalButtons'),note=el('approvalStatus');
    lockReply(true);panel.hidden=false;el('retryApproval').hidden=true;
    if(writing)note.textContent='Saving your response…';
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:messageOnly?'approval-message':decision?'approval-decide':'approval-status',approval_id:approvalId,token,
          ...(writing?{decision,reply:replyAttempt.reply,reply_id:replyAttempt.reply_id}:{})}),
        credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok)throw Object.assign(Error(typeof data.error==='string'?data.error:'Response unavailable. Please retry.'),{status:response.status});
      if(seq!==approvalRender)return;
      const item=data.approval;panel.dataset.signal=item.status==='approved'?'green':item.status==='declined'?'red':'amber';
      if(writing){replyAttempt=null;replyId=crypto.randomUUID();el('quoteReply').value='';el('quoteReplyFields').hidden=true;el('messageQuote').setAttribute('aria-expanded','false');window.VectaCustomerPortal?.refresh();}
      el('approvalMessage').textContent=item.message;
      const estimate=el('approvalEstimate');estimate.hidden=!Number.isInteger(item.estimated_pence);
      estimate.textContent=estimate.hidden?'':'Estimated price including VAT: '+new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(item.estimated_pence/100);
      approvalPhotos=Array.isArray(item.photo_ids)?item.photo_ids:[];el('approvalPhotos').hidden=!approvalPhotos.length;
      el('approvalTitle').textContent=item.status==='pending'?'Your quote':item.status==='approved'?'✓ Work authorised':item.status==='declined'?'✕ Work not authorised':'Your quote';
      const status={approved:'You accepted this quote. The workshop has your response.',declined:'You refused this quote. The workshop has your response.',closed:'This request is closed.'};
      note.textContent=messageOnly?'Your message has been sent to the workshop. '+(item.status==='pending'?'You have not accepted or refused the quote.':status[item.status]||''):status[item.status]||'';
      buttons.hidden=item.status!=='pending';el('messageQuote').hidden=item.status==='closed';
      el('openApproval').textContent=item.status==='pending'?'View quote & respond':'View your response';
      if(replyAttempt){el('retryApproval').hidden=false;note.textContent+=' Your previous send is unconfirmed. Retry the same response to check it.';}
    }catch(error){
      if(seq!==approvalRender)return;
      if(writing&&[400,403,404,409,410].includes(error.status)){replyAttempt=null;replyId=null;}
      el('retryApproval').hidden=false;note.textContent=error.message;
    }finally{if(writing)deciding=false;if(seq===approvalRender)lockReply(false);}
  }
  {
    el('approvalPanel').hidden=false;el('approvalButtons').hidden=true;el('messageQuote').hidden=true;
    el('approvalStatus').textContent='Loading your workshop message…';
    el('openApproval').hidden=!approvalId;el('openApproval').onclick=openApproval;
    el('closeApproval').onclick=()=>{if(!deciding)el('approvalDialog').close();};
    el('approvalDialog').addEventListener('cancel',event=>{if(deciding)event.preventDefault();});
    el('retryApproval').onclick=()=>replyAttempt?refreshApproval(replyAttempt.decision,replyAttempt.messageOnly):refreshApproval();
    if(approvalId)openApproval();
    el('approveWork').onclick=()=>refreshApproval('approved');el('declineWork').onclick=()=>refreshApproval('declined');
    el('messageQuote').onclick=()=>{el('quoteReplyFields').hidden=false;el('messageQuote').setAttribute('aria-expanded','true');el('quoteReply').focus();};
    el('sendQuoteMessage').onclick=()=>refreshApproval(undefined,true);
    el('quoteReply').oninput=()=>{if(!deciding&&!replyAttempt)replyId=crypto.randomUUID();};
    el('approvalPhotos').onclick=()=>{
      const photo=Array.from(el('workshopPhotoGrid').children).find(card=>approvalPhotos.includes(card.dataset.photoId));
      if(photo){el('approvalDialog').close();photo.scrollIntoView({behavior:'smooth',block:'center'});}
      else el('approvalStatus').textContent='These photos are unavailable. Tap Refresh progress to check again.';
    };
  }
  window.VectaProgressApproval={open(id){
    if(deciding)return;
    if(id!==approvalId){
      if(el('quoteReply').value.trim()||replyAttempt){openApproval();el('approvalStatus').textContent='Send or clear your current reply before opening another quote.';return;}
      approvalId=id;replyId=crypto.randomUUID();el('approvalMessage').textContent='';el('approvalEstimate').hidden=true;el('approvalButtons').hidden=true;el('messageQuote').hidden=true;
    }
    el('openApproval').hidden=false;openApproval();refreshApproval();
  }};
  const connectingMessage='Connecting to our live booking system. This may take several minutes.';
  function showConnectionMessage(){const note=el('sceneCaption');note.textContent=connectingMessage;note.classList.add('connecting');note.hidden=false;}
  // Complete, individually composed scene sets. Never reuse one registration's car for another.
  const sceneSets=Object.freeze({CM14KEL:'cm14kel',YD72OMH:'yd72omh'});
  const trustedScenes=value=>value&&['waiting','underway','ready'].every(stage=>typeof value[stage]==='string'&&new RegExp('^https://(?:jywufozycuwuoshlulwl|brqsejjykrubxuofavuu)\\.supabase\\.co/storage/v1/object/public/progress-scenes/[a-f0-9]{64}/'+stage+'\\.webp$').test(value[stage]))?value:null;
  const normalise=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  function clearScenes(){
    const scenes=el('progressScene');scenes.hidden=true;artworkKey='scheduled';
    scenes.querySelectorAll('img').forEach(image=>{image.removeAttribute('src');image.hidden=true;});
    el('sceneCaption').hidden=true;el('sceneCaption').classList.remove('connecting');
  }
  function renderScenes(data,index){
    const scenes=el('progressScene');scenes.hidden=false;scenes.dataset.stage=data.stage;scenes.classList.remove('stale');
    const generated=trustedScenes(data.scenes);
    const reg=normalise(data.registration),sceneSet=Object.hasOwn(sceneSets,reg)?sceneSets[reg]:'',approved=!!generated||!!sceneSet,waitingForScenes=!approved&&['unavailable','preparing'].includes(data.scene_state);
    const key=JSON.stringify([reg,data.image_url||'',data.image_colour||'',sceneSet,generated,waitingForScenes]);
    const changed=key!==artworkKey;artworkKey=key;
    scenes.querySelectorAll('[data-scene]').forEach((card,i)=>{
      card.classList.toggle('current',i===index);card.classList.toggle('done',i<index);
      if(i===index)card.setAttribute('aria-current','step');else card.removeAttribute('aria-current');
      card.querySelector('.currentBadge').hidden=i!==index;
      const photo=card.querySelector('.approvedScene');
      const src=generated?generated[card.dataset.scene]:(sceneSet?'/assets/progress/'+sceneSet+'-'+card.dataset.scene+'.webp'+(sceneSet==='cm14kel'?'?v=manufacturer-logos-1':''):'');
      photo.hidden=!approved||photo.dataset.failedUrl===src;
      photo.alt=(data.registration||'Your car')+' — '+card.querySelector('h3').textContent.toLowerCase()+' illustration';
      photo.onerror=()=>{photo.dataset.failedUrl=src;photo.hidden=true;card.querySelector('.sceneArt').hidden=true;};
      // Never expose the rejected old workshop photos while a complete scene
      // is missing or fails to load. Status cards remain available.
      const background=card.querySelector('.sceneBackground');background.hidden=approved||waitingForScenes;
      if(!background.hidden)background.src=background.dataset.src;else background.removeAttribute('src');
      card.querySelector('.sceneArt').hidden=waitingForScenes||photo.dataset.failedUrl===src;
      if(src){if(photo.getAttribute('src')!==src)photo.src=src;}else photo.removeAttribute('src');
      // Complete images already contain the car, number plate and mechanic.
      // Do not fetch or reveal the old overlays underneath these scenes.
      if(approved||waitingForScenes){card.querySelector('.vehicleLayer').hidden=true;card.querySelector('.sceneCar').removeAttribute('src');const mechanic=card.querySelector('.sceneMechanic');if(mechanic){mechanic.hidden=true;mechanic.removeAttribute('src');}}
      card.querySelector('.scenePlate').textContent=data.registration||'';
    });
    el('sceneCaption').hidden=!waitingForScenes;el('sceneCaption').classList.toggle('connecting',waitingForScenes&&data.scene_state==='preparing');el('sceneCaption').textContent=waitingForScenes?(data.scene_state==='preparing'?connectingMessage:'Your workshop status is up to date. Vehicle illustrations are unavailable at the moment.'):'';
    const safeImage=typeof data.image_url==='string'&&/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(data.image_url);
    if(approved||waitingForScenes||!changed)return;
    scenes.querySelectorAll('.sceneCar').forEach(old=>{
      const car=old.cloneNode(false);car.hidden=false;car.removeAttribute('src');for(const attr of Array.from(car.attributes))if(attr.name.startsWith('data-'))car.removeAttribute(attr.name);old.replaceWith(car);
      const layer=car.parentElement,card=layer.parentElement.parentElement,mechanic=card.querySelector('.sceneMechanic');layer.hidden=true;if(mechanic)mechanic.hidden=true;
      car.onload=()=>{if(artworkKey!==key)return;layer.hidden=false;if(mechanic){mechanic.src=mechanic.dataset.src;mechanic.hidden=false;}};
      car.onerror=()=>{layer.hidden=true;if(mechanic)mechanic.hidden=true;};
      if(!safeImage)return;
      if(/\.svgz?$/.test(data.image_url)&&window.VectaVehicleImage){
        car.dataset.vehicleImage='1';car.dataset.vehicleSource=data.image_url;car.dataset.colour=data.image_colour||'';car.dataset.vehicleCrop='tight';car.dataset.vehicleLogo='separate';
        // Plate text is a separate layer so the finished car can face the other way.
        window.VectaVehicleImage.mount(layer);
      }else car.src=data.image_url;
    });
  }
  const date=value=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/London'}).format(new Date(value+'T12:00:00Z'));
  function clearWorkshopPhotos(){el('workshopPhotoGrid').replaceChildren();el('workshopPhotos').hidden=true;}
  function renderWorkshopPhotos(data){
    const grid=el('workshopPhotoGrid'),section=el('workshopPhotos'),error=el('workshopPhotoError');
    const photos=(Array.isArray(data.workshop_photos)?data.workshop_photos:[]).filter(photo=>typeof photo.url==='string'&&/^https:\/\/(?:jywufozycuwuoshlulwl|brqsejjykrubxuofavuu)\.supabase\.co\/storage\/v1\/object\/sign\/job-workshop-photos\/[a-f0-9-]{36}\.jpg\?token=[A-Za-z0-9_.-]+$/.test(photo.url));
    const keep=new Set(photos.map(photo=>photo.id));
    for(const card of Array.from(grid.children))if(!keep.has(card.dataset.photoId))card.remove();
    error.hidden=!data.workshop_photos_error;error.textContent=data.workshop_photos_error||'';section.hidden=!photos.length&&!data.workshop_photos_error;
    photos.forEach((photo,i)=>{
      let card=Array.from(grid.children).find(card=>card.dataset.photoId===photo.id);
      if(!card){
        card=document.createElement('figure');card.dataset.photoId=photo.id;
        const link=document.createElement('a'),image=document.createElement('img'),caption=document.createElement('figcaption');link.target='_blank';link.rel='noopener noreferrer';image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';
        image.onerror=()=>{error.hidden=false;error.textContent='A photo could not be loaded. Tap Refresh progress to try again.';image.dataset.failed='1';};
        link.append(image);card.append(link,caption);grid.append(card);
      }
      const image=card.querySelector('img'),link=card.querySelector('a');link.href=photo.url;link.setAttribute('aria-label','Open workshop photo '+(i+1));
      // Renew the full-size link, retaining a loaded image to avoid downloading
      // all photographs again on every one-minute progress poll.
      if(!image.getAttribute('src')||image.dataset.failed){image.removeAttribute('data-failed');image.src=photo.url;}
      image.alt=photo.caption||'Workshop photo '+(i+1);card.querySelector('figcaption').textContent=photo.caption||'Workshop photo '+(i+1);
    });
  }
  function render(data){
    if(window.VectaCustomerPortal?.isCancelled())return;
    const instructions=el('customerInstructions'),list=el('customerInstructionsList');list.replaceChildren();
    for(const line of data.customer_instructions||[]){const p=document.createElement('p');p.textContent=line;list.append(p);}
    instructions.hidden=!list.children.length;
    el('identity').hidden=false;el('registration').textContent=data.registration;el('vehicle').textContent=[data.vehicle,data.image_colour].filter(Boolean).join(' · ');const customerJobDescription=String(data.job_description||'').split(/\n\s*\n/).filter(section=>!/(?:^|\n)\s*(?:Service (?:guide price|price agreed):|Quote:\s*[\da-f-]{36}|Oil specification:|Guide price — includes estimated parts costs\.)/im.test(section)&&!/(?:GSF vehicle-applied oil recommendation|\[[A-Z0-9-]+\]\s*(?:·|×)|\bRequired\s+\d+(?:\.\d+)?L;\s*charged\s+\d+)/i.test(section)).join('\n\n').trim();el('jobDescription').textContent=customerJobDescription;el('jobSummary').hidden=!customerJobDescription;el('bookingDate').textContent=data.booking_date?'Booking date: '+date(data.booking_date):'';
    el('statusTitle').textContent=data.title;el('statusDescription').textContent=data.description||'';el('steps').hidden=data.stage==='scheduled';
    const index={waiting:0,underway:1,checking:1,ready:2}[data.stage]??-1;
    document.querySelectorAll('[data-step]').forEach((step,i)=>{step.classList.toggle('current',i===index);step.classList.toggle('done',i<index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    if(data.images_allowed===false||data.stage==='scheduled'){clearScenes();clearWorkshopPhotos();}
    else{renderScenes(data,index);renderWorkshopPhotos(data);}
    // Clear old financial links on every update, including a job returned to the mechanic.
    el('paperwork').hidden=true;el('invoice').removeAttribute('href');
    if(!registration&&typeof data.invoice_url==='string'&&data.invoice_url.startsWith('/invoice?token=')){el('invoice').href=data.invoice_url;el('paperwork').hidden=false;}
    el('freshness').textContent='Last checked at '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date())+'. Updates refresh automatically.';
  }
  async function refresh(){
    clearTimeout(timer);if(busy||(!token&&!registration)||document.hidden)return;busy=true;el('refresh').disabled=true;if(!artworkKey)showConnectionMessage();
    try{
      if(approvalId)refreshApproval();
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration?{action:'registration',registration,request_scenes:true}:{action:'status',token,request_scenes:true}),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){const error=Error(typeof data.error==='string'?data.error:'Progress is temporarily unavailable.');error.permanent=response.status===404||response.status===400;throw error;}
      render(data);failures=0;el('error').hidden=true;timer=setTimeout(refresh,data.scene_state==='preparing'?15000:60000);
    }catch(error){
      el('sceneCaption').hidden=true;el('sceneCaption').classList.remove('connecting');
      if(window.VectaCustomerPortal?.isCancelled()){timer=setTimeout(refresh,60000);return;}
      el('error').hidden=false;el('error').textContent=(error.message||'Progress is temporarily unavailable.')+' '+(error.permanent?'':'Your last displayed update may be out of date.');
      el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('progressScene').classList.add('stale');
      clearWorkshopPhotos();
      if(error.permanent){el('customerInstructions').hidden=true;el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;el('statusTitle').textContent=registration?'No booking found today':'Tracking link unavailable';el('statusDescription').textContent=registration?'Check your registration or contact the workshop.':'Please open the latest link in your booking email or contact the workshop.';el('freshness').textContent='';}
      else{failures++;timer=setTimeout(refresh,Math.min(300000,60000*failures));}
    }finally{busy=false;el('refresh').disabled=false;}
  }
  el('registrationForm').onsubmit=event=>{event.preventDefault();if(busy)return;el('customerInstructions').hidden=true;registration=el('registrationInput').value.trim();if(!registration)return;clearWorkshopPhotos();clearTimeout(timer);el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;artworkKey='';el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('error').hidden=true;el('freshness').textContent='';el('statusTitle').textContent='Checking today’s booking…';el('statusDescription').textContent='';el('refresh').hidden=false;refresh();};
  window.addEventListener('vecta-portal-updated',refresh);
  el('refresh').onclick=async()=>{await refresh();await window.VectaCustomerPortal?.refresh();};document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);
  if(!token&&location.search){const supplied=new URLSearchParams(location.search).get('reg')||'';if(/^[A-Za-z0-9 -]{2,15}$/.test(supplied)){registration=normalise(supplied);el('registrationInput').value=registration;}}
  el('registrationForm').hidden=!!(token||registration);
  if(token||registration){el('refresh').hidden=false;el('statusTitle').textContent='Checking your booking…';el('statusDescription').textContent='';refresh();}
})();
