(()=>{'use strict';
  const el=id=>document.getElementById(id),token=location.hash.slice(1);
  let timer,busy=false,failures=0,registration='';
  const date=value=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/London'}).format(new Date(value+'T12:00:00Z'));
  function render(data){
    el('identity').hidden=false;el('registration').textContent=data.registration;el('vehicle').textContent=data.vehicle||'';el('bookingDate').textContent=data.booking_date?'Booking date: '+date(data.booking_date):'';
    el('statusTitle').textContent=data.title;el('statusDescription').textContent=data.description||'';el('steps').hidden=data.stage==='scheduled';
    const index={waiting:0,underway:1,checking:1,ready:2}[data.stage]??-1;
    document.querySelectorAll('[data-step]').forEach((step,i)=>{step.classList.toggle('current',i===index);step.classList.toggle('done',i<index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    el('progressScene').hidden=false;el('progressScene').dataset.stage=data.stage;el('sceneCaption').textContent=data.title;
    const car=el('progressCar'),safeImage=typeof data.image_url==='string'&&/^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(data.image_url);
    car.hidden=!safeImage||car.dataset.failedUrl===data.image_url;if(safeImage){if(car.getAttribute('src')!==data.image_url)car.src=data.image_url;}else car.removeAttribute('src');
    // Clear old financial links on every update, including a job returned to the mechanic.
    el('paperwork').hidden=true;el('invoice').removeAttribute('href');
    if(!registration&&data.stage==='ready'&&typeof data.invoice_url==='string'&&data.invoice_url.startsWith('/invoice?token=')){el('invoice').href=data.invoice_url;el('paperwork').hidden=false;}
    el('freshness').textContent='Last checked at '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date())+'. Updates refresh automatically.';
  }
  async function refresh(){
    clearTimeout(timer);if(busy||(!token&&!registration)||document.hidden)return;busy=true;el('refresh').disabled=true;
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration?{action:'registration',registration}:{action:'status',token}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){const error=Error(data.error||'Progress is temporarily unavailable.');error.permanent=response.status===404||response.status===400;throw error;}
      render(data);failures=0;el('error').hidden=true;timer=setTimeout(refresh,60000);
    }catch(error){
      el('error').hidden=false;el('error').textContent=(error.message||'Progress is temporarily unavailable.')+' '+(error.permanent?'':'Your last displayed update may be out of date.');
      el('paperwork').hidden=true;el('invoice').removeAttribute('href');
      if(error.permanent){el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('statusTitle').textContent=registration?'No booking found today':'Tracking link unavailable';el('statusDescription').textContent=registration?'Check your registration or contact the workshop.':'Please open the latest link in your booking email or contact the workshop.';el('freshness').textContent='';}
      else{failures++;timer=setTimeout(refresh,Math.min(300000,60000*failures));}
    }finally{busy=false;el('refresh').disabled=false;}
  }
  el('registrationForm').onsubmit=event=>{event.preventDefault();if(busy)return;registration=el('registrationInput').value.trim();if(!registration)return;clearTimeout(timer);el('identity').hidden=true;el('steps').hidden=true;el('progressScene').hidden=true;el('paperwork').hidden=true;el('invoice').removeAttribute('href');el('error').hidden=true;el('freshness').textContent='';el('statusTitle').textContent='Checking today’s booking…';el('statusDescription').textContent='';el('refresh').hidden=false;refresh();};
  el('progressCar').onerror=()=>{const car=el('progressCar');car.dataset.failedUrl=car.getAttribute('src');car.hidden=true;};
  el('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);
  if(token){el('refresh').hidden=false;el('statusTitle').textContent='Checking your booking…';el('statusDescription').textContent='Please wait while we retrieve the latest workshop update.';refresh();}
})();
