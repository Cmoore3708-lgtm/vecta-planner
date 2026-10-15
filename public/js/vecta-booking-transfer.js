(function(root){
  'use strict';
  let overlay,deadline,watch,previousFocus;
  const style=document.createElement('style');
  style.textContent='.booking-transfer{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:rgba(5,8,13,.96);color:#fff}.booking-transfer-card{width:min(560px,100%);padding:42px 28px;border:1px solid #434953;border-top:3px solid #d7192d;border-radius:18px;background:#10151c;text-align:center;box-shadow:0 24px 80px #0008}.booking-transfer-card b{display:block;color:#ef3340;font:900 28px Arial,sans-serif;letter-spacing:2px}.booking-transfer-card p{font:600 clamp(23px,5vw,32px)/1.4 Arial,sans-serif;animation:booking-transfer-pulse 2.5s ease-in-out infinite}.booking-transfer-card button{padding:12px 20px;border:1px solid #5d6570;border-radius:8px;background:#fff;color:#111;font:700 14px Arial,sans-serif;cursor:pointer}@keyframes booking-transfer-pulse{50%{opacity:.45}}@media(prefers-reduced-motion:reduce){.booking-transfer-card p{animation:none}}';
  document.head.append(style);
  function close(){clearTimeout(deadline);clearInterval(watch);overlay?.remove();overlay=null;document.body.style.overflow='';previousFocus?.focus?.();}
  function show(){
    if(overlay)return;
    previousFocus=document.activeElement;
    overlay=document.createElement('div');overlay.className='booking-transfer';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','booking-transfer-message');
    overlay.innerHTML='<div class="booking-transfer-card"><b>VECTA</b><p id="booking-transfer-message" role="status">Transferring you to our live booking Centre…</p><button type="button">Cancel</button></div>';
    overlay.querySelector('button').onclick=close;overlay.onkeydown=event=>{if(event.key==='Escape')close();if(event.key==='Tab'){event.preventDefault();overlay.querySelector('button').focus()}};
    document.body.append(overlay);document.body.style.overflow='hidden';overlay.querySelector('button').focus();
    deadline=setTimeout(()=>{if(!overlay)return;overlay.querySelector('p').textContent='Your vehicle image is taking longer than expected. You can continue your booking.';overlay.querySelector('button').textContent='Continue booking';},35000);
  }
  function waitForVehicle(getState){
    show();clearInterval(watch);
    watch=setInterval(()=>{
      const state=getState();
      if(state.failed){close();return;}
      if(!state.ready)return;
      const image=document.querySelector('.haynes-image img');
      if(image&&image.complete&&image.naturalWidth>0&&(!/haynespro-assets.*\.svgz?$/.test(image.getAttribute('src')||''))){close();return;}
      if(!state.hasImage){close();}
    },100);
  }
  root.VectaBookingTransfer={show,close,waitForVehicle};
  if(new URLSearchParams(root.location.search).get('transfer')==='1')show();
})(window);
