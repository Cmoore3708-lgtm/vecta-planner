(()=>{'use strict';
  const el=id=>document.getElementById(id),token=location.hash.slice(1);
  let timer,busy=false,failures=0,registration='',artworkKey='';
  const approvalId=token.startsWith('approval.') ? token.split('.')[1] : token && location.search ? new URLSearchParams(location.search).get('approval') : null;
  let deciding=false, approvalRender=0, approvalPhotos=[];
  async function refreshApproval(decision){
    if(!approvalId || deciding || registration)return;
    const seq=++approvalRender, panel=el('approvalPanel'), buttons=el('approvalButtons'), note=el('approvalStatus');
    if(decision)deciding=true;
    el('approveWork').disabled=true;el('declineWork').disabled=true;
    buttons.hidden=true;panel.hidden=false;
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:decision?'approval-decide':'approval-status',approval_id:approvalId,token,decision}),
        credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Approval unavailable. Tap Refresh progress to check again.');
      if(seq!==approvalRender)return;
      const item=data.approval;
      el('approvalMessage').textContent=item.message;
      const estimate=el('approvalEstimate');
      estimate.hidden=!Number.isInteger(item.estimated_pence);
      estimate.textContent=estimate.hidden?'':'Estimated total including VAT: '+new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(item.estimated_pence/100);
      approvalPhotos=Array.isArray(item.photo_ids)?item.photo_ids:[];
      el('approvalPhotos').hidden=!approvalPhotos.length;
      el('approvalTitle').textContent=item.status==='pending'?'Your approval is needed':'Your response';
      const status={approved:'You approved this work. The workshop has your response.',declined:'You declined this work. The workshop has your response.',closed:'This request is closed.'};
      note.textContent=status[item.status]||'';
      buttons.hidden=item.status!=='pending';
    }catch(error){
      if(seq!==approvalRender)return;
      el('approvalTitle').textContent='Workshop message';
      el('approvalMessage').textContent='';el('approvalEstimate').hidden=true;el('approvalPhotos').hidden=true;
      buttons.hidden=true;note.textContent=error.message+' Tap Refresh progress to check the current decision.';
    }finally{
      if(decision)deciding=false;
      if(seq===approvalRender){el('approveWork').disabled=false;el('declineWork').disabled=false;}
    }
  }
  if(approvalId){
    el('approveWork').onclick=()=>refreshApproval('approved');
    el('declineWork').onclick=()=>refreshApproval('declined');
    el('approvalPhotos').onclick=()=>{
      const photo=Array.from(el('workshopPhotoGrid').children).find(card=>approvalPhotos.includes(card.dataset.photoId));
      if(photo)photo.scrollIntoView({behavior:'smooth',block:'center'});
      else el('approvalStatus').textContent='These photos are unavailable. Tap Refresh progress to check again.';
    };
  }
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
    if(!registration&&data.stage==='ready'&&typeof data.invoice_url==='string'&&data.invoice_url.startsWith('/invoice?token=')){el('invoice').href=data.invoice_url;el('paperwork').hidden=false;}
    el('freshness').textContent='Last checked at '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date())+'. Updates refresh automatically.';
  }
  async function refresh(){
    clearTimeout(timer);if(busy||(!token&&!registration)||document.hidden)return;busy=true;el('refresh').disabled=true;if(!artworkKey)showConnectionMessage();
    try{
      if(approvalId)refreshApproval();
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration?{action:'registration',registration,request_scenes:true}:{action:'status',token,request_scenes:true}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){const error=Error(data.error||'Progress is temporarily unavailable.');error.permanent=response.status===404||response.status===400;throw error;}
      render(data);failures=0;el('error').hidden=true;timer=setTimeout(refresh,data.scene_state==='preparing'?15000:60000);
    }catch(error){
      el('sceneCaption').hidden=true;el('sceneCaption').classList.remove('connecting');
      el('error').hidden=false;el('error').textContent=(error.message||'Progress is temporarily unavailable.')+' '+(error.permanent?'':'Your last displayed update may be out of date.');
      el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('progressScene').classList.add('stale');
      clearWorkshopPhotos();
      if(error.permanent){el('customerInstructions').hidden=true;el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;el('statusTitle').textContent=registration?'No booking found today':'Tracking link unavailable';el('statusDescription').textContent=registration?'Check your registration or contact the workshop.':'Please open the latest link in your booking email or contact the workshop.';el('freshness').textContent='';}
      else{failures++;timer=setTimeout(refresh,Math.min(300000,60000*failures));}
    }finally{busy=false;el('refresh').disabled=false;}
  }
  el('registrationForm').onsubmit=event=>{event.preventDefault();if(busy)return;el('customerInstructions').hidden=true;registration=el('registrationInput').value.trim();if(!registration)return;clearWorkshopPhotos();clearTimeout(timer);el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;artworkKey='';el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('error').hidden=true;el('freshness').textContent='';el('statusTitle').textContent='Checking today’s booking…';el('statusDescription').textContent='';el('refresh').hidden=false;refresh();};
  el('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);
  if(!token&&location.search){const supplied=new URLSearchParams(location.search).get('reg')||'';if(/^[A-Za-z0-9 -]{2,15}$/.test(supplied)){registration=normalise(supplied);el('registrationInput').value=registration;}}
  el('registrationForm').hidden=!!(token||registration);
  if(token||registration){el('refresh').hidden=false;el('statusTitle').textContent='Checking your booking…';el('statusDescription').textContent='';refresh();}
})();
