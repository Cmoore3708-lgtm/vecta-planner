// Shared notification registration for the workshop and mechanic dashboards.
window.createVectaDeviceNotifications=function({decodeKey,withTimeout,updateBadge}){
var vectaBookingAlertsPending=null,vectaBookingAlertsCheckedAt=0,vectaBookingAlertsConnected=false,vectaBookingAlertsEndpoint='',vectaBookingAlertsError='';
function vectaBookingAlertsState(){
  if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))return {status:'unsupported',canEnable:false,message:'For iPhone alerts, open Workshop Pro from its Home Screen icon. On a PC, use a browser that supports notifications.'};
  if(Notification.permission==='denied')return {status:'blocked',canEnable:false,message:'Notifications are blocked in this device’s browser settings. Allow Workshop Pro notifications there to receive background alerts.'};
  if(Notification.permission!=='granted')return {status:'permission',canEnable:true,message:'Allow notifications once on this device. Workshop Pro will reconnect them automatically afterwards.'};
  return vectaBookingAlertsConnected?{status:'enabled',canEnable:false,message:''}:{status:'reconnecting',canEnable:false,message:'Reconnecting device notifications automatically…'};
}
function vectaNotifyBookingAlertsState(){
  var state=vectaBookingAlertsState(),button=document.getElementById('enableBookingAlerts');
  if(button){button.disabled=state.status==='enabled';button.textContent=state.status==='enabled'?'Background alerts enabled':'Enable background alerts';}
  window.dispatchEvent(new Event('vecta-notification-state'));
}
async function vectaMaintainBookingAlerts(force){
  var state=vectaBookingAlertsState();
  if(state.status==='unsupported'||state.status==='permission'||state.status==='blocked'){
    vectaBookingAlertsConnected=false;vectaBookingAlertsCheckedAt=0;vectaNotifyBookingAlertsState();return false;
  }
  if(!navigator.onLine)return false;
  if(vectaBookingAlertsPending)return vectaBookingAlertsPending;
  if(!force&&vectaBookingAlertsCheckedAt&&Date.now()-vectaBookingAlertsCheckedAt<(vectaBookingAlertsConnected?300000:30000))return vectaBookingAlertsConnected;
  vectaBookingAlertsCheckedAt=Date.now();
  // Reuse this browser's subscription and re-save its authenticated role on
  // each reopen/reconnection. Automatic recovery never prompts or sends tests.
  vectaBookingAlertsPending=(async function(){
    try{
      var configResponse=await fetch('/api/push-config',{cache:'no-store',signal:AbortSignal.timeout(10000)}),config=await configResponse.json();
      if(!configResponse.ok)throw new Error(config.error||'Notifications are unavailable');
      var registration=await withTimeout(navigator.serviceWorker.ready,10000,'Notification service'),subscription=await registration.pushManager.getSubscription();
      if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey)});
      var saveResponse=await fetch('/api/push-subscribe',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription:subscription.toJSON()}),signal:AbortSignal.timeout(10000)});
      if(!saveResponse.ok){var saveError=await saveResponse.json().catch(function(){return {}});throw new Error(saveError.error||'Could not save notification settings');}
      vectaBookingAlertsConnected=true;vectaBookingAlertsEndpoint=subscription.endpoint;vectaBookingAlertsError='';
      try{localStorage.setItem('vecta:booking-alerts-enabled','1');}catch{}
      return true;
    }catch(error){vectaBookingAlertsConnected=false;vectaBookingAlertsError=error&&error.message||'Notifications are temporarily unavailable';console.warn('Device notifications will retry automatically.',error);return false;}
    finally{vectaBookingAlertsPending=null;vectaNotifyBookingAlertsState();}
  })();
  return vectaBookingAlertsPending;
}
async function vectaEnableBookingAlerts(){
  var state=vectaBookingAlertsState();
  if(state.status==='unsupported'||state.status==='blocked'){alert(state.message);return false;}
  try{
    if(Notification.permission!=='granted'&&await Notification.requestPermission()!=='granted'){vectaNotifyBookingAlertsState();alert('Allow notifications on this device to receive background alerts.');return false;}
    if(!await vectaMaintainBookingAlerts(true))throw new Error(vectaBookingAlertsError||'Check this device’s internet connection.');
    // Only the explicit setup action sends a test; automatic reconnects are quiet.
    var testResponse=await fetch('/api/push-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:vectaBookingAlertsEndpoint}),signal:AbortSignal.timeout(10000)});
    var testResult=await testResponse.json().catch(function(){return {}});
    if(!testResponse.ok||!testResult.ok){alert('Notifications are connected, but the test could not be sent. '+(testResult.error||'Please check notification delivery.'));return false;}
    await updateBadge();alert('Customer message and booking notifications are enabled on this device. A test notification has been sent.');return true;
  }catch(error){console.error(error);alert('Notifications could not be enabled. '+(error&&error.message||''));return false;}
}
return {state:vectaBookingAlertsState,maintain:vectaMaintainBookingAlerts,enable:vectaEnableBookingAlerts};
};

// Main and mechanics keep app state inside a closure. Receive those dependencies
// explicitly instead of looking for private variables on the browser global.
// Use the same shared review receipt as the Website Bookings inbox.
function createPhoneBookingPopup(openBooking){
  let current=null,dialog=null,timer=null,deferred=null,busy=false;
  function enabled(){
    return typeof openBooking==='function' && !window.VECTA_MECHANIC_DEPLOYMENT &&
      window.matchMedia?.('(pointer: coarse) and (max-width: 1024px)').matches && !document.hidden;
  }
  function remove(){
    clearTimeout(timer);
    if(dialog){dialog.remove();dialog=null;}
  }
  function display(){
    clearTimeout(timer);
    if(!enabled()||!current||current.id===deferred){remove();return;}
    if(dialog)return;
    if(document.querySelector('.modal.open,dialog[open],.portalWorkshopPopup:not([hidden])')){
      timer=setTimeout(display,1000);return;
    }
    const row=current,box=document.createElement('dialog');
    dialog=box;
    box.setAttribute('aria-labelledby','phoneBookingTitle');
    box.style.cssText='box-sizing:border-box;width:min(92vw,390px);max-height:85dvh;overflow:auto;margin:auto;padding:20px;border:1px solid #555;border-top:5px solid #2678bc;border-radius:14px;background:#202327;color:white;color-scheme:dark';
    box.innerHTML='<h2 id="phoneBookingTitle" style="margin:0 0 12px">New website booking</h2><div style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0;overflow-wrap:anywhere"><strong class="requestPlate" style="color:#111827"></strong><p data-customer style="margin-bottom:0"></p></div><img data-car hidden style="width:38%;max-width:135px;height:84px;object-fit:contain"></div><p data-work></p><p data-date></p><p role="status"></p><div style="display:flex;flex-wrap:wrap;gap:8px"><button class="btn primary" data-open>Open booking</button></div>';
    box.querySelector('strong').textContent=row.registration||'No registration';
    box.querySelector('[data-customer]').textContent=[row.customer_name,row.vehicle].filter(Boolean).join(' · ');
    box.querySelector('[data-work]').textContent=[].concat(row.job_types||[]).filter(Boolean).join(', ')||row.work_required||'General work';
    const date=row.confirmed_date||row.preferred_date_1;
    box.querySelector('[data-date]').textContent=date?'Booking date · '+new Date(String(date).slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'';
    function later(){deferred=row.id;remove();}
    box.oncancel=event=>{event.preventDefault();if(!busy)later();};
    const button=box.querySelector('[data-open]');
    button.onclick=async ()=>{
      if(busy)return;
      busy=true;
      button.disabled=true;
      try{
        await openBooking(row.id);
        if(dialog===box)remove();
      }catch{box.querySelector('[role=status]').textContent='Could not update this booking. Please try again.';}
      finally{busy=false;button.disabled=false;}
    };
    document.body.append(box);box.showModal();
    const img=box.querySelector('[data-car]'),tools=window.VectaHaynesJobTools;
    function fallback(){
      const svg=window.VectaFleetImages?.artwork?.(row.vehicle,tools?.dashboardColour?.(row));
      img.onerror=null;
      if(svg){img.alt='Vehicle illustration';img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);img.hidden=false;}
      else img.hidden=true;
    }
    function paintCar(){
      if(dialog!==box)return;
      const drawing=tools?.storedDrawing?.(row);
      if(!drawing?.imageUrl){fallback();return;}
      img.onerror=fallback;
      img.alt=row.vehicle||'Booked vehicle';
      img.src=tools.artworkUrl(drawing.imageUrl);
      img.hidden=false;
    }
    paintCar();
    tools?.hydrateSharedArtwork?.()?.then(paintCar).catch(()=>{});
  }
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden){deferred=null;current=null;remove();}});
  return {enabled,update(row){
    if(current?.id!==row?.id)remove();
    current=row||null;display();
  }};
}
window.createVectaBookingReceipts=function({getClient,getRequests,request,saveLocal,withTimeout,updateBadge,openBooking}){
var popup=createPhoneBookingPopup(openBooking);
var cloudCount=null,pending=null,revision=0;
function count(){return cloudCount!==null?cloudCount:getRequests().filter(function(r){return (!r.status||r.status==='awaiting_review')&&!r.reviewed_at}).length}
function invalidate(){cloudCount=null}
function renderCount(){
  var value=count(),button=document.querySelector('#nav [data-view="websiteRequests"]');
  if(button)button.textContent='Website Bookings'+(value?' ('+value+')':'');
  updateBadge();window.VectaPortalWorkshop?.clearBookingNotifications(value);
}
async function markRead(body){
  if(window.VECTA_MECHANIC_DEPLOYMENT||!navigator.onLine)return false;
  try{var result=await request(Object.assign({action:'booking-read'},body));
    for(var receipt of result.requests||[]){var row=getRequests().find(function(r){return r.id===receipt.id});if(row&&receipt.reviewed_at)row.reviewed_at=receipt.reviewed_at;}
    saveLocal();invalidate();await refresh();return true;
  }catch(error){console.warn('Booking read status will retry when the card is reopened.',error);return false;}
}
function refresh(){
  var client=getClient();
  if(!client||!navigator.onLine||window.VECTA_MECHANIC_DEPLOYMENT===true)return Promise.resolve(false);
  revision++;
  if(pending)return pending;
  // On a phone, fetch one unread summary alongside the exact badge count.
  pending=(async function(){
    while(navigator.onLine){
      var requestedRevision=revision;
      var phone=popup.enabled();
      var query=client.from('website_booking_requests').select(phone?'id,registration,customer_name,vehicle,job_types,work_required,confirmed_date,preferred_date_1':'id',{count:'exact',head:!phone}).or('status.is.null,status.eq.awaiting_review').is('reviewed_at',null);
      if(phone)query=query.order('created_at',{ascending:true}).order('id',{ascending:true}).limit(1);
      var result=await withTimeout(query,9000,'Website booking count');
      if(result.error)throw result.error;
      if(!Number.isInteger(result.count)||result.count<0)throw new Error('Website booking count was not returned.');
      // An acceptance or live event during this read needs a newer snapshot.
      if(requestedRevision!==revision)continue;
      cloudCount=result.count;renderCount();popup.update(phone&&result.data?.[0]);return true;
    }
    return false;
  })().catch(function(error){console.warn('Website booking count refresh failed; keeping the last known count.',error);return false}).finally(function(){pending=null});
  return pending;
}
return {count,invalidate,refresh,markRead};
};
