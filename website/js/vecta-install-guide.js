function renderVectaInstallGuide(dialog, portalHref, selectedPhone){
 dialog.insertAdjacentHTML('beforeend', `<img class="guide-photo" data-guide-suffix="-home" width="1122" height="1402" alt="Install the VECTA app. Earn 5% back on workshop spend, manage bookings, track repairs and download documents.">
 <label>Your phone <select><option value="iphone">Apple iPhone</option><option value="android">Android</option></select></label>
 <a data-guide-open class="customer-app-offer-button" href="/app/home">Open your portal</a>
 <h2 class="guide-heading">Open the Portal Link above</h2>
 <p data-install-steps></p>
 <img class="guide-photo guide-steps" data-guide-suffix="" width="1122" height="1402" alt="">
 <h2 class="guide-heading">Your Customer Portal</h2>
 <img class="guide-photo guide-portal" data-guide-suffix="-bonus" width="1122" height="1402" alt="Your garage in the VECTA Customer Portal, showing your vehicle and loyalty bonus">
 <h2 class="guide-heading">Turn notifications on</h2>
 <p>Receive instant notifications on your phone when the workshop sends you a message. Once installed, open VECTA, tap Enable phone alerts and choose Allow.</p>
 <p data-alert-settings></p>`);
 dialog.querySelector('[data-guide-open]').href=portalHref;
 const phone=dialog.querySelector('select'),images=dialog.querySelectorAll('[data-guide-suffix]');
 function selectGuide(){
  const android=phone.value==='android';
  dialog.dataset.phone=phone.value;
  dialog.querySelector('[data-install-steps]').textContent=android?'In Chrome, open the three-dot menu, select Install app or Add to Home screen, then confirm.':'In Safari, open the menu (the 3 lines to the left of the web site address in the address bar), then tap Share, then Add to Home Screen and Add.';
  dialog.querySelector('[data-alert-settings]').textContent=android?'On Android, open Settings → Notifications → App notifications. Select VECTA and allow notifications. If Chrome manages your alerts, allow notifications for vectamotors.co.uk in Chrome’s site settings.':'On iPhone, open Settings → Notifications → VECTA and turn on Allow Notifications.';
  for(const image of images){
   image.src='https://www.vectamotors.co.uk/assets/app-install/'+phone.value+image.dataset.guideSuffix+'.jpg';
  }
 }
 phone.value=['android','iphone'].includes(selectedPhone)?selectedPhone:(/android/i.test(window.navigator?.userAgent||'')?'android':'iphone');
 phone.onchange=selectGuide;
 selectGuide();
}
