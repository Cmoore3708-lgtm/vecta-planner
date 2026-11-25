(()=>{'use strict';
 const $=id=>document.getElementById(id),link=window.VectaCustomerAppLink,token=location.hash.slice(1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let installPrompt=null,worker=null,verified=false,config=null,notificationBusy=false;
 const status=text=>{$('appStatus').textContent=text;};
 async function api(action,body={}){
  const response=await fetch('/api/job-progress',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(20000),body:JSON.stringify({action,token,...body})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Please try again when you are online.');return data;
 }
 function connectivity(){
  $('appOffline').hidden=navigator.onLine;
  $('appOnlineLabel').textContent=navigator.onLine?'Connected to your workshop':'Offline — updates paused';
 }
 connectivity();window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('appInstall').hidden=standalone();});
 window.addEventListener('appinstalled',()=>{installPrompt=null;$('appInstall').hidden=true;status('Vecta has been added to your phone.');});
 $('appInstall').hidden=standalone();
 $('appInstall').onclick=async event=>{
  if(!installPrompt)return;
  event.preventDefault();
  const prompt=installPrompt;installPrompt=null;
  await prompt.prompt();await prompt.userChoice;
 };
 $('appLinkForm').onsubmit=event=>{
  event.preventDefault();let supplied;
  try{const url=new URL($('appPrivateLink').value.trim());if(!['https:'].includes(url.protocol)||!['www.vectamotors.co.uk','vectamotors.co.uk',location.hostname].includes(url.hostname)||!/^\/(?:track(?:\.html)?\/?|app(?:\/(?:home|booking)(?:\.html)?)?\/?)$/.test(url.pathname))throw Error();supplied=url.hash.slice(1);if(!link.valid(supplied))throw Error();}
  catch{$('appLinkError').textContent='Paste the full private portal link from your Vecta booking email.';return;}
  location.replace('/app/booking#'+supplied);location.reload();
 };
 $('appRecoverForm').onsubmit=async event=>{
  event.preventDefault();const button=$('appRecoverSubmit');button.disabled=true;
  try{const result=await api('portal-entry',{registration:$('appRecoverRegistration').value});$('appRecoverStatus').textContent=result.message;}
  catch(error){$('appRecoverStatus').textContent=error.message;}
  finally{button.disabled=false;}
 };
 async function registration(){
  if(!('serviceWorker' in navigator))throw Error('Your browser does not support phone alerts. You can still use your booking here.');
  if(!worker)worker=navigator.serviceWorker.register('/app/service-worker.js',{scope:'/app/',updateViaCache:'none'}).then(async reg=>{
   if(reg.active)return reg;
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('App setup is taking longer than expected. Please reopen Vecta.')),15000);const check=()=>{if(reg.active){clearTimeout(timeout);resolve();}};reg.installing?.addEventListener('statechange',check);reg.waiting?.addEventListener('statechange',check);check();});return reg;
  }).catch(error=>{worker=null;throw error;});
  return worker;
 }
 function keyBytes(value){const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}
 async function notificationState(){
  if(!verified)return;
  try{if(localStorage.getItem('vecta.garage.session.v1')){$('appNotifications').hidden=true;return;}}catch{}
  $('appNotifications').hidden=false;
  if(!('Notification' in window)||!('PushManager' in window)||ios&&!standalone()){$('appAlerts').disabled=true;$('appAlertsNote').textContent=ios?'Add Vecta to your Home Screen, then open the V icon to enable alerts.':'Phone alerts are unavailable in this browser. Your booking and messages still work here.';return;}
  try{
   config=await api('app-push-config');if(!config.enabled){$('appAlerts').disabled=true;$('appAlertsNote').textContent='Alerts are disabled on this preview.';return;}
   const sub=await (await registration()).pushManager.getSubscription();
   if(sub&&Notification.permission==='granted'){
    await api('app-push-subscribe',{subscription:sub.toJSON()});$('appAlerts').textContent='Turn alerts off';$('appAlerts').dataset.enabled='true';$('appAlertsNote').textContent='Alerts are on for this booking. You can turn them off at any time.';
   }else{$('appAlerts').textContent='Enable phone alerts';$('appAlerts').dataset.enabled='false';$('appAlertsNote').textContent=Notification.permission==='denied'?'Notifications are blocked. Allow them in your phone or browser settings, then reopen Vecta.':'Get alerts for messages, extra-work requests and collection. Your phone will ask for permission.';}
  }catch(error){$('appAlertsNote').textContent=error.message;}
 }
 window.addEventListener('vecta:portal-verified',event=>{
  if(verified)return;verified=true;
  if(!link.save(token))status('This browser could not remember your booking. Keep your private email link to reopen it.');
  else status('Your booking is securely linked on this device.');
  $('appForget').hidden=false;notificationState();
 });
 window.addEventListener('vecta:portal-unavailable',event=>{
  if(event.detail?.status!==404)return;
  link.clear();$('appRecovery').hidden=false;status('This booking link has expired or changed. Use your latest booking email to link it again.');
 });
 $('appAlerts').onclick=async()=>{
  if(notificationBusy||!verified)return;notificationBusy=true;$('appAlerts').disabled=true;
  try{
   if($('appAlerts').dataset.enabled==='true'){
    const sub=await (await registration()).pushManager.getSubscription();
    if(sub){await sub.unsubscribe();await api('app-push-unsubscribe',{subscription:sub.toJSON()}).catch(()=>{});}
   }else{
    // Keep the permission request directly within the user's tap (required by iOS).
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Alerts were not enabled. You can still check all updates in the app.');
    if(!config)config=await api('app-push-config');if(!config.enabled)throw Error('Alerts are disabled on this preview.');
    const reg=await registration();const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
    try{await api('app-push-subscribe',{subscription:sub.toJSON()});}catch(error){await sub.unsubscribe();throw error;}
   }
   await notificationState();
  }catch(error){$('appAlertsNote').textContent=error.message;}
  finally{notificationBusy=false;$('appAlerts').disabled=false;}
 };
 $('appForget').onclick=async()=>{
  $('appForget').disabled=true;
  try{const garageSignedIn=!!localStorage.getItem('vecta.garage.session.v1');const sub=garageSignedIn?null:await (await registration()).pushManager.getSubscription();if(sub){await sub.unsubscribe();await api('app-push-unsubscribe',{subscription:sub.toJSON()}).catch(()=>{});}}catch{}
  link.clear();location.replace('/app/home');
 };
 $('appRecovery').hidden=!!token;
 if(!token){$('registrationForm').hidden=true;$('statusTitle').textContent='Your workshop, one tap away';$('statusDescription').textContent='Link your booking below to see your vehicle’s progress, messages and invoice.';}
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='vecta-customer-update'){window.VectaCustomerPortal?.refresh();window.dispatchEvent(new Event('vecta-portal-updated'));}});
 registration().catch(()=>{if(!navigator.onLine)status('Connect to the internet to finish setting up Vecta.');});
})();
