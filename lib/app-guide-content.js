const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const appGuideFields={
  install_heading:'Have you downloaded the VECTA app yet?',
  install_benefits:'Earn 5% back on your workshop spend. Every £100 paid earns £5. Use your portal to see your loyalty bonus, manage bookings, follow repairs and download your documents.',
  install_iphone:'iPhone: Open your portal in Safari. Open the menu (the 3 lines to the left of the web site address in the address bar), then tap Share, then Add to Home Screen and Add.',
  install_android:'Android: Open your portal in Chrome. Tap the three-dot menu, then Install app or Add to Home screen and confirm.',
  install_alerts:'Receive instant notifications on your phone when the workshop sends you a message. Once installed, open VECTA, tap Enable phone alerts and choose Allow.',
  alerts_iphone:'On iPhone, open Settings → Notifications → VECTA and turn on Allow Notifications.',
  alerts_android:'On Android, open Settings → Notifications → App notifications. Select VECTA and allow notifications. If Chrome manages your alerts, allow notifications for vectamotors.co.uk in Chrome’s site settings.'
};
export function appGuideContent(link,fields){
 const value=key=>escape(fields[key]).replace(/\n/g,'<br>');
 const guideBase='https://www.vectamotors.co.uk/assets/app-install/';
 const appLink=link.endsWith('/track')?'https://www.vectamotors.co.uk/app/home':link.replace('/track#','/app/booking#');
 const guidePictures=[['-home','VECTA on your home screen'],['','Installation instructions'],['-bonus','Your loyalty bonus in the portal']];
 const guideLinks=os=>guidePictures.map(([suffix,label])=>label+': '+guideBase+os+suffix+'.jpg').join('\n');
 const installText=[fields.install_heading,fields.install_benefits,'Open the VECTA app: '+appLink,fields.install_iphone,guideLinks('iphone'),fields.install_android,guideLinks('android'),fields.install_alerts,fields.alerts_iphone,fields.alerts_android].join('\n');
 return {text:installText,html:`<h2 style="font-size:18px;margin:18px 0 6px" data-confirmation-field="install_heading">${value('install_heading')}</h2>
<p data-confirmation-field="install_benefits">${value('install_benefits')}</p>
<p><a href="${escape(appLink)}">Open the VECTA app</a></p>
${['iphone','android'].map(os=>`<p data-confirmation-field="install_${os}">${value('install_'+os)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${guidePictures.map(([suffix,label])=>`<tr><td align="center" style="padding:0 0 12px"><a href="${guideBase}${os}${suffix}.jpg"><img src="${guideBase}${os}${suffix}.jpg" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0" alt="${label}"></a></td></tr>`).join('')}</table>`).join('')}
<p data-confirmation-field="install_alerts">${value('install_alerts')}</p>
<p data-confirmation-field="alerts_iphone">${value('alerts_iphone')}</p>
<p data-confirmation-field="alerts_android">${value('alerts_android')}</p>`};
}
