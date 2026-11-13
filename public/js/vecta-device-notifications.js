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
window.createVectaBookingReceipts=function({getClient,getRequests,request,saveLocal,withTimeout,updateBadge}){
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
  // Count only: no customer details, full-database pull or dashboard redraw.
  pending=(async function(){
    while(navigator.onLine){
      var requestedRevision=revision;
      var result=await withTimeout(client.from('website_booking_requests').select('id',{count:'exact',head:true}).or('status.is.null,status.eq.awaiting_review').is('reviewed_at',null),9000,'Website booking count');
      if(result.error)throw result.error;
      if(!Number.isInteger(result.count)||result.count<0)throw new Error('Website booking count was not returned.');
      // An acceptance or live event during this read needs a newer snapshot.
      if(requestedRevision!==revision)continue;
      cloudCount=result.count;renderCount();return true;
    }
    return false;
  })().catch(function(error){console.warn('Website booking count refresh failed; keeping the last known count.',error);return false}).finally(function(){pending=null});
  return pending;
}
return {count,invalidate,refresh,markRead};
};
