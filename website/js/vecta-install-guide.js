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
}
if(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone)rememberVectaInstall();
else updateInstallDisplay();
window.addEventListener('appinstalled',rememberVectaInstall);
window.addEventListener('pageshow',updateInstallDisplay);
window.addEventListener('storage',event=>{if(event.key===installMarker)updateInstallDisplay();});
function renderVectaInstallGuide(container){
 const phone=/android/i.test(navigator.userAgent)?'android':'iphone';
 container.innerHTML=`<h1>Install the VECTA app to earn a 5% loyalty bonus</h1>
 <p><strong>Earn £5 for every £100 you spend.</strong> Manage your bookings, track your car, receive workshop alerts and view your documents.</p>
 <h2>Add this page to your Home Screen</h2>
 <label>Your phone <select><option value="iphone">iPhone</option><option value="android">Android</option></select></label>
 <p data-install-steps></p>
 <img class="guide-photo" data-guide-suffix="" alt="Phone menu and Add to Home Screen instructions">
 <img class="guide-photo" data-guide-suffix="-home" alt="The VECTA app on your Home Screen">
 <img class="guide-photo" data-guide-suffix="-bonus" alt="Your VECTA portal and loyalty bonus">
 <h2>After installing, turn on workshop alerts</h2>
 <p>Open VECTA from your Home Screen, tap <strong>Enable phone alerts</strong> and choose <strong>Allow</strong> to hear when we confirm your booking.</p>
 <img class="guide-photo" src="https://www.vectamotors.co.uk/assets/app-install/notification-example.jpg" alt="Example of a VECTA workshop notification">`;
 const selector=container.querySelector('select');
 function update(){
  const android=selector.value==='android';
  container.querySelector('[data-install-steps]').textContent=android?'Tap the three dots in the bottom-right corner of this page. Choose Install app or Add to Home screen, then confirm. If your menu is at the top, tap the three dots there.':'In Safari, tap the three dots at the bottom of this page, then Share. If you see the Share button already, tap it directly. Choose Add to Home Screen, then Add.';
  for(const image of container.querySelectorAll('[data-guide-suffix]'))image.src='https://www.vectamotors.co.uk/assets/app-install/'+(android && !image.dataset.guideSuffix?'android-bottom-menu':selector.value+image.dataset.guideSuffix)+'.jpg';
 }
 selector.value=phone;selector.onchange=update;update();
}
const offer=document.querySelector('.installGuideLink');
if(offer && location.hash)offer.href='/app/booking?setup=1'+location.hash;
if(/^\/app\/(?:booking|home)(?:\.html)?\/?$/.test(location.pathname) && new URLSearchParams(location.search).get('setup')==='1' && !vectaAppInstalled()){
 const container=document.createElement('section');container.className='appPanel';container.id='receiptInstallGuide';
 const row=document.querySelector('.installGuideRow');
 row.after(container);
 row.hidden=true;
 renderVectaInstallGuide(container);
}
