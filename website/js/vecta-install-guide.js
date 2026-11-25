function renderVectaInstallGuide(container, portalHref, selectedPhone){
 const onPortal=location.pathname.startsWith('/app/');
 const phone=['android','iphone'].includes(selectedPhone)?selectedPhone:(/android/i.test(navigator.userAgent)?'android':'iphone');
 container.innerHTML=`<h1>Add VECTA to your phone</h1>
 <h2>1. Open your booking portal</h2>
 ${onPortal?'<p><strong>You’re on the right page.</strong> Keep this portal open for step 2.</p>':'<p>This page is the guide. Tap below to open the page to save.</p><a data-open-portal class="customer-app-offer-button">Open my booking portal</a>'}
 <h2>2. Add the portal to your Home Screen</h2>
 <label>Your phone <select><option value="iphone">iPhone</option><option value="android">Android</option></select></label>
 <p data-install-steps></p>
 <h2>3. Turn on workshop alerts</h2>
 <p>Open VECTA from your Home Screen, tap <strong>Enable phone alerts</strong> and choose <strong>Allow</strong> to hear when we confirm your booking.</p>
 <details><summary>Show the picture guide</summary><img class="guide-photo" data-guide-suffix="" alt="Phone menu and Home Screen installation steps"><img class="guide-photo" data-guide-suffix="-home" alt="VECTA on your Home Screen"><img class="guide-photo" data-guide-suffix="-bonus" alt="Your VECTA customer portal"></details>`;
 const link=container.querySelector('[data-open-portal]');
 if(link){const target=new URL(portalHref,location.origin);target.searchParams.set('setup','1');link.href=target.pathname+target.search+target.hash;}
 const selector=container.querySelector('select');
 function update(){
  const android=selector.value==='android';
  container.querySelector('[data-install-steps]').textContent=android?'With the portal open in Chrome, tap the three-dot menu, then Install app or Add to Home screen and confirm.':'With the portal open in Safari, tap Share (in the address-bar menu on some iPhones), then Add to Home Screen and Add.';
  for(const image of container.querySelectorAll('[data-guide-suffix]'))image.src='/assets/app-install/'+selector.value+image.dataset.guideSuffix+'.jpg';
 }
 selector.value=phone;selector.onchange=update;update();
}
if(location.pathname.startsWith('/app/') && new URLSearchParams(location.search).get('setup')==='1' && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone){
 const container=document.createElement('section');container.className='appPanel';container.id='receiptInstallGuide';
 document.querySelector('main').prepend(container);
 renderVectaInstallGuide(container);
}
