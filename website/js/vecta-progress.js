(()=>{'use strict';
  const el=id=>document.getElementById(id),token=location.hash.slice(1);
  let timer,busy=false,failures=0,registration='',artworkKey='';
  const connectingMessage='Connecting to our live booking system. This may take several minutes.';
  function showConnectionMessage(){const note=el('sceneCaption');note.textContent=connectingMessage;note.classList.add('connecting');note.hidden=false;}
  // Complete, individually composed scene sets. Never reuse one registration's car for another.
  const sceneSets=Object.freeze({CM14KEL:'cm14kel',YD72OMH:'yd72omh'});
  const trustedScenes=value=>value&&['waiting','underway','ready'].every(stage=>typeof value[stage]==='string'&&new RegExp('^https://(?:jywufozycuwuoshlulwl|brqsejjykrubxuofavuu)\\.supabase\\.co/storage/v1/object/public/progress-scenes/[a-f0-9]{64}/'+stage+'\\.webp$').test(value[stage]))?value:null;
  const normalise=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
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
      card.querySelector('.sceneBackground').hidden=approved||waitingForScenes;
      card.querySelector('.sceneArt').hidden=waitingForScenes||photo.dataset.failedUrl===src;
      if(src){if(photo.getAttribute('src')!==src)photo.src=src;}else photo.removeAttribute('src');
      // Complete images already contain the car, number plate and mechanic.
      // Do not fetch or reveal the old overlays underneath these scenes.
      if(approved||waitingForScenes){card.querySelector('.vehicleLayer').hidden=true;card.querySelector('.sceneCar').removeAttribute('src');const mechanic=card.querySelector('.sceneMechanic');if(mechanic)mechanic.hidden=true;}
      card.querySelector('.scenePlate').textContent=data.registration||'';
    });
    el('sceneCaption').hidden=!waitingForScenes;el('sceneCaption').classList.toggle('connecting',waitingForScenes&&data.scene_state==='preparing');el('sceneCaption').textContent=waitingForScenes?(data.scene_state==='preparing'?connectingMessage:'Your workshop status is up to date. Vehicle illustrations are unavailable at the moment.'):'';
    const safeImage=typeof data.image_url==='string'&&/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(data.image_url);
    if(approved||waitingForScenes||!changed)return;
    scenes.querySelectorAll('.sceneCar').forEach(old=>{
      const car=old.cloneNode(false);car.removeAttribute('src');for(const attr of Array.from(car.attributes))if(attr.name.startsWith('data-'))car.removeAttribute(attr.name);old.replaceWith(car);
      const layer=car.parentElement,card=layer.parentElement.parentElement,mechanic=card.querySelector('.sceneMechanic');layer.hidden=true;if(mechanic)mechanic.hidden=true;
      car.onload=()=>{if(artworkKey!==key)return;layer.hidden=false;if(mechanic)mechanic.hidden=false;};
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
  function render(data){
    el('identity').hidden=false;el('registration').textContent=data.registration;el('vehicle').textContent=[data.vehicle,data.image_colour].filter(Boolean).join(' · ');el('jobDescription').textContent=data.job_description||'';el('jobSummary').hidden=!data.job_description;el('bookingDate').textContent=data.booking_date?'Booking date: '+date(data.booking_date):'';
    el('statusTitle').textContent=data.title;el('statusDescription').textContent=data.description||'';el('steps').hidden=data.stage==='scheduled';
    const index={waiting:0,underway:1,checking:1,ready:2}[data.stage]??-1;
    document.querySelectorAll('[data-step]').forEach((step,i)=>{step.classList.toggle('current',i===index);step.classList.toggle('done',i<index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    renderScenes(data,index);
    // Clear old financial links on every update, including a job returned to the mechanic.
    el('paperwork').hidden=true;el('invoice').removeAttribute('href');
    if(!registration&&data.stage==='ready'&&typeof data.invoice_url==='string'&&data.invoice_url.startsWith('/invoice?token=')){el('invoice').href=data.invoice_url;el('paperwork').hidden=false;}
    el('freshness').textContent='Last checked at '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date())+'. Updates refresh automatically.';
  }
  async function refresh(){
    clearTimeout(timer);if(busy||(!token&&!registration)||document.hidden)return;busy=true;el('refresh').disabled=true;if(!artworkKey)showConnectionMessage();
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration?{action:'registration',registration,request_scenes:true}:{action:'status',token,request_scenes:true}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){const error=Error(data.error||'Progress is temporarily unavailable.');error.permanent=response.status===404||response.status===400;throw error;}
      render(data);failures=0;el('error').hidden=true;timer=setTimeout(refresh,data.scene_state==='preparing'?15000:60000);
    }catch(error){
      el('sceneCaption').hidden=true;el('sceneCaption').classList.remove('connecting');
      el('error').hidden=false;el('error').textContent=(error.message||'Progress is temporarily unavailable.')+' '+(error.permanent?'':'Your last displayed update may be out of date.');
      el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('progressScene').classList.add('stale');
      if(error.permanent){el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;el('statusTitle').textContent=registration?'No booking found today':'Tracking link unavailable';el('statusDescription').textContent=registration?'Check your registration or contact the workshop.':'Please open the latest link in your booking email or contact the workshop.';el('freshness').textContent='';}
      else{failures++;timer=setTimeout(refresh,Math.min(300000,60000*failures));}
    }finally{busy=false;el('refresh').disabled=false;}
  }
  el('registrationForm').onsubmit=event=>{event.preventDefault();if(busy)return;registration=el('registrationInput').value.trim();if(!registration)return;clearTimeout(timer);el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('sceneCaption').hidden=true;artworkKey='';el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('error').hidden=true;el('freshness').textContent='';el('statusTitle').textContent='Checking today’s booking…';el('statusDescription').textContent='';el('refresh').hidden=false;refresh();};
  el('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);
  if(!token&&location.search){const supplied=new URLSearchParams(location.search).get('reg')||'';if(/^[A-Za-z0-9 -]{2,15}$/.test(supplied)){registration=normalise(supplied);el('registrationInput').value=registration;}}
  el('registrationForm').hidden=!!(token||registration);
  if(token||registration){el('refresh').hidden=false;el('statusTitle').textContent='Checking your booking…';el('statusDescription').textContent='';refresh();}
})();
