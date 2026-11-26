const installMarker='vecta.customer-app.installed.v1';
function vectaAppInstalled(){
 if(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)return true;
 try{return localStorage.getItem(installMarker)==='yes';}catch{return false;}
}
function updateInstallDisplay(){
 document.documentElement.classList.toggle('vecta-installed',vectaAppInstalled());
}
function rememberVectaInstall(){
 try{localStorage.setItem(installMarker,'yes');}catch{}
 document.documentElement.classList.add('vecta-installed');
 document.querySelector('dialog#receiptInstallGuide[open]')?.close();
 document.querySelector('section#receiptInstallGuide')?.remove();
 if(location.pathname.startsWith('/install-app'))location.replace(location.hash?'/app/booking'+location.hash:'/app/home');
}
if(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)rememberVectaInstall();
else updateInstallDisplay();
window.addEventListener('appinstalled',rememberVectaInstall);
window.addEventListener('pageshow',updateInstallDisplay);
window.addEventListener('storage',event=>{if(event.key===installMarker)updateInstallDisplay();});
function renderVectaInstallGuide(container, portalHref, selectedPhone){
 if(vectaAppInstalled()){
  if(location.pathname.startsWith('/install-app'))location.replace(portalHref || '/app/home');
  return;
 }
 const onPortal=location.pathname.startsWith('/app/');
 const phone=['android','iphone'].includes(selectedPhone)?selectedPhone:(/android/i.test(navigator.userAgent)?'android':'iphone');
 container.innerHTML=`<h1>Install the VECTA app to earn a 5% loyalty bonus</h1>
 <p><strong>Earn £5 for every £100 you spend.</strong> Manage your bookings, track your car, receive workshop alerts and view your documents.</p>
 <h2>1. Open your booking portal</h2>
 ${onPortal?'<p><strong>You’re on the right page.</strong> Keep this portal open for step 2.</p>':'<p>This page is the guide. Tap below to open the page to save.</p><a data-open-portal class="customer-app-offer-button">Open my booking portal</a>'}
 <img class="guide-photo" data-guide-suffix="-bonus" alt="Your VECTA booking portal and loyalty bonus">
 <h2>2. Add the portal to your Home Screen</h2>
 <label>Your phone <select><option value="iphone">iPhone</option><option value="android">Android</option></select></label>
 <p data-install-steps></p>
 <img class="guide-photo" data-guide-suffix="" alt="Phone menu and Add to Home Screen instructions">
 <img class="guide-photo" data-guide-suffix="-home" alt="The VECTA app on your Home Screen">
 <h2>3. After installing, turn on workshop alerts</h2>
 <p>Open VECTA from your Home Screen, tap <strong>Enable phone alerts</strong> and choose <strong>Allow</strong> to hear when we confirm your booking.</p>
 <img class="guide-photo" src="https://www.vectamotors.co.uk/assets/app-install/notification-example.jpg" alt="Example of a VECTA workshop notification">`;
 const link=container.querySelector('[data-open-portal]');
 if(link){const target=new URL(portalHref,location.origin);target.searchParams.set('setup','1');link.href=target.pathname+target.search+target.hash;}
 const selector=container.querySelector('select');
 function update(){
  const android=selector.value==='android';
  container.querySelector('[data-install-steps]').textContent=android?'With the portal open in Chrome, tap the three dots at the bottom right as shown (the menu position can vary by browser), then Install app or Add to Home screen and confirm.':'With the portal open in Safari, tap Share (in the address-bar menu on some iPhones), then Add to Home Screen and Add.';
  for(const image of container.querySelectorAll('[data-guide-suffix]'))image.src='https://www.vectamotors.co.uk/assets/app-install/'+(android && !image.dataset.guideSuffix?'android-bottom-menu':selector.value+image.dataset.guideSuffix)+'.jpg';
 }
 selector.value=phone;selector.onchange=update;update();
}
if(location.pathname.startsWith('/app/') && new URLSearchParams(location.search).get('setup')==='1' && !vectaAppInstalled()){
 const container=document.createElement('section');container.className='appPanel';container.id='receiptInstallGuide';
 const progress=document.getElementById('live');
 if(progress)progress.insertAdjacentElement('afterend',container);else document.querySelector('main').prepend(container);
 renderVectaInstallGuide(container);
}
