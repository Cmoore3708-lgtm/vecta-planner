(()=>{'use strict';
  const el=id=>document.getElementById(id),token=location.hash.slice(1);
  let timer,busy=false,failures=0;
  const date=value=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/London'}).format(new Date(value+'T12:00:00Z'));
  function render(data){
    el('identity').hidden=false;el('registration').textContent=data.registration;el('vehicle').textContent=data.vehicle;el('bookingDate').textContent='Booking date: '+date(data.booking_date);
    el('statusTitle').textContent=data.title;el('statusDescription').textContent=data.description;el('steps').hidden=data.stage==='scheduled';
    const index={waiting:0,underway:1,checking:1,ready:2}[data.stage]??-1;
    document.querySelectorAll('[data-step]').forEach((step,i)=>{step.classList.toggle('current',i===index);step.classList.toggle('done',i<index);if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    // Clear old financial links on every update, including a job returned to the mechanic.
    el('paperwork').hidden=true;el('invoice').removeAttribute('href');
    if(data.stage==='ready'&&typeof data.invoice_url==='string'&&data.invoice_url.startsWith('/invoice?token=')){el('invoice').href=data.invoice_url;el('paperwork').hidden=false;}
    el('freshness').textContent='Last checked at '+new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}).format(new Date())+'. Updates refresh automatically.';
  }
  async function refresh(){
    clearTimeout(timer);if(busy||!token||document.hidden)return;busy=true;el('refresh').disabled=true;
    try{
      const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'status',token}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
      const data=await response.json();if(!response.ok){const error=Error(data.error||'Progress is temporarily unavailable.');error.permanent=response.status===404;throw error;}
      render(data);failures=0;el('error').hidden=true;timer=setTimeout(refresh,60000);
    }catch(error){
      el('error').hidden=false;el('error').textContent=(error.message||'Progress is temporarily unavailable.')+' '+(error.permanent?'':'Your last displayed update may be out of date.');
      el('paperwork').hidden=true;el('invoice').removeAttribute('href');
      if(error.permanent){el('identity').hidden=true;el('steps').hidden=true;el('statusTitle').textContent='Tracking link unavailable';el('statusDescription').textContent='Please open the latest link in your booking email or contact the workshop.';el('freshness').textContent='';}
      else{failures++;timer=setTimeout(refresh,Math.min(300000,60000*failures));}
    }finally{busy=false;el('refresh').disabled=false;}
  }
  el('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else refresh();});window.addEventListener('online',refresh);
  if(token){el('refresh').hidden=false;el('statusTitle').textContent='Checking your booking…';el('statusDescription').textContent='Please wait while we retrieve the latest workshop update.';refresh();}
})();
