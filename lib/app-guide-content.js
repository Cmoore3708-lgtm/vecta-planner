const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const notificationExampleHtml='<img src="https://www.vectamotors.co.uk/assets/app-install/notification-example.jpg" width="520" alt="Example VECTA notification showing a £40 front brake pad quote and a red 1 on the app icon" style="display:block;width:100%;max-width:520px;height:auto;border:0">';
export const appGuideFields={
  install_heading:'Have you downloaded the VECTA app yet?',
  install_benefits:'Earn 5% back on your workshop spend. Every £100 paid earns £5. Use your portal to see your loyalty bonus, manage bookings, follow repairs and download your documents.',
  install_iphone:'iPhone: Open your portal in Safari. Open the menu (the 3 lines to the left of the web site address in the address bar), then tap Share, then Add to Home Screen and Add.',
  install_android:'Android: Open your portal in Chrome. Tap the three-dot menu, then Install app or Add to Home screen and confirm.',
  install_alerts:'Receive instant notifications on your phone when the workshop sends you a message. Once installed, open VECTA, tap Enable phone alerts and choose Allow.',
  alerts_iphone:'On iPhone, open Settings → Notifications → VECTA and turn on Allow Notifications.',
  alerts_android:'On Android, open Settings → Notifications → App notifications → VECTA and turn on notifications. If VECTA is missing, allow notifications for Chrome, then open your portal in Chrome and tap the icon beside the web address → Permissions → Notifications → Allow.'
};
export function appGuideContent(link,fields,{phone=null}={}){
 const value=key=>escape(fields[key]).replace(/\n/g,'<br>');
 const guideBase='https://www.vectamotors.co.uk/assets/app-install/';
 const appLink=link.endsWith('/track')?'https://www.vectamotors.co.uk/app/home':link.replace('/track#','/app/booking#');
 const guideUrl=os=>'https://www.vectamotors.co.uk/install-app?phone='+os+new URL(link).hash;
 const picture=os=>`<a href="${escape(guideUrl(os))}"><img src="${guideBase}${os}-home.jpg" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0" alt="View the VECTA app installation guide"></a>`;
 const systems=phone?[phone]:['iphone','android'];
 const alternate=phone==='android'?'iphone':'android';
 const alternateLabel=alternate==='android'?'View the Android picture guide':'View the iPhone picture guide';
 const alternateUrl=guideUrl(alternate);
 const installText=[fields.install_heading,fields.install_benefits,'Open the VECTA app: '+appLink,...systems.flatMap(os=>[fields['install_'+os],'Installation instructions: '+guideUrl(os)]),...(phone?[alternateLabel+': '+alternateUrl]:[]),fields.install_alerts,...systems.map(os=>fields['alerts_'+os])].join('\n');
 return {text:installText,html:`<h2 style="font-size:18px;margin:18px 0 6px" data-confirmation-field="install_heading">${value('install_heading')}</h2>
<p data-confirmation-field="install_benefits">${value('install_benefits')}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px"><img src="https://www.vectamotors.co.uk/icons/v-192-20261115.png" width="64" height="64" alt="" style="display:block;border:0;border-radius:14px"></td>
<td valign="middle"><a href="${escape(appLink)}">Open the VECTA app</a></td>
</tr></table>
${systems.map(os=>`<p data-confirmation-field="install_${os}">${value('install_'+os)}</p>${picture(os)}`).join('')}
${phone?`<p><a href="${alternateUrl}">${alternateLabel}</a></p>`:''}
<p data-confirmation-field="install_alerts">${value('install_alerts')}</p>
${systems.map(os=>`<p data-confirmation-field="alerts_${os}">${value('alerts_'+os)}</p>`).join('')}
${notificationExampleHtml}`};
}
