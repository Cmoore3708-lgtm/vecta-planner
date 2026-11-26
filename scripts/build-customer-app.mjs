import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function buildCustomerApp({check=false}={}){
 const header=`<header class="appHeader"><a class="appBrand" href="/app/home" aria-label="Vecta My Garage"><img src="/app/vecta-header.jpg" width="1206" height="554" alt="Vecta — Vehicle Servicing and repairs. For all employees of NMUK."></a><div class="appHeaderActions"><small id="appOnlineLabel">Connected to your workshop</small><a href="/app/home">My Garage</a></div></header>`;
 const welcome=`<section class="appWelcome"><div id="appWelcomeText"><span class="appEyebrow">YOUR VECTA APP</span><h1>Your car. In good hands.</h1><p>Your booking, messages and updates, all in one place.</p></div></section><p id="appOffline" role="status" hidden>You’re offline. Connect to see the latest progress and messages. Your saved booking link is still on this device.</p><p id="appStatus" role="status" aria-live="polite"></p>`;
 const recovery=`<details id="appRecovery" class="appPanel"><summary>Help linking your booking</summary><p>Open the portal link in your booking email, or paste it here.</p><form id="appLinkForm"><label for="appPrivateLink">Private portal link from your booking email</label><input id="appPrivateLink" type="url" autocomplete="off" spellcheck="false" placeholder="https://www.vectamotors.co.uk/track#…" required><button type="submit">Link my booking</button><p id="appLinkError" role="alert"></p></form><details><summary>Email me a new link</summary><p>We’ll send a link to your booking email address.</p><form id="appRecoverForm"><label for="appRecoverRegistration">Vehicle registration</label><input id="appRecoverRegistration" maxlength="15" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="YOUR REG" required><button id="appRecoverSubmit" type="submit">Email my private link</button><p id="appRecoverStatus" role="status"></p></form></details></details>`;
 const settings=`<section id="appNotifications" class="appPanel" aria-labelledby="appAlertsTitle" hidden><h2 id="appAlertsTitle">Keep me updated</h2><p>Tap <strong>Enable phone alerts</strong> and choose <strong>Allow</strong>.</p><div class="appSettings"><button id="appAlerts" class="appButton" type="button">Enable phone alerts</button><p id="appAlertsNote">Messages, extra-work requests and ready-to-collect updates.</p><img src="https://www.vectamotors.co.uk/assets/app-install/notification-example.jpg" loading="lazy" width="260" alt="Example VECTA notification showing a £40 front brake pad quote and a red 1 on the app icon" style="display:block;width:100%;max-width:260px;margin:10px auto;height:auto;border:0"></div></section><footer class="appFooter"><a href="/privacy">Privacy</a><button id="appForget" type="button" hidden>Remove booking from this device</button></footer>`;
 const source=fs.readFileSync('public/track.html','utf8');
 const html=source.replace('<title>Your customer portal | Vecta Motors</title>','<title>Vecta Motors</title><meta name="theme-color" content="#080808"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Vecta"><link rel="manifest" href="/app/manifest.webmanifest"><link rel="apple-touch-icon" sizes="180x180" href="https://www.vectamotors.co.uk/icons/v-180-20261115.png"><link rel="icon" type="image/png" sizes="192x192" href="https://www.vectamotors.co.uk/icons/v-192-20261115.png"><script src="/app/bootstrap.js"></script>')
  .replace('</head>','<link rel="stylesheet" href="/app/app.css"><script src="/app/app.js" defer></script></head>')
  .replace('id="portalSignInRetry" hidden>Try again</button>', 'id="portalSignInRetry" hidden>Try again</button><a id="appExpiredGarage" href="/app/home" hidden>Open My Garage</a>')
  .replace('<body>','<body>'+header).replace('<main>','<main>'+welcome+recovery)
  .replace('class="installGuideLink"','id="appInstall" class="installGuideLink"')
  .replace('</main>',settings+'</main>')
  .replace('<script src="/js/vecta-customer-app-entry.js" defer></script>','').replace(/<p id="customerAppEntry"[^>]*>[\s\S]*?<\/p>/,'');
 const outputs=[['public/app/booking.html',Buffer.from(html)],['website/app/booking.html',Buffer.from(html)]];
 for(const size of [180,192,512]){
  const data=fs.readFileSync('website/icons/v-'+size+'-20261115.png');
  for(const root of ['public','website'])outputs.push([root+'/app/icon-'+size+'.png',data]);
 }
 for(const name of ['vecta-header.jpg','home.html','garage.js','garage.css','car-placeholder.svg','manifest.webmanifest','bootstrap.js','app.js','app.css','service-worker.js'])outputs.push(['website/app/'+name,fs.readFileSync('public/app/'+name)]);
 for(const [path,content] of outputs){
  if(fs.existsSync(path)&&fs.readFileSync(path).equals(content))continue;
  if(check)throw Error('Customer app is out of date: '+path+'. Run node scripts/build-customer-app.mjs.');
  fs.mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});fs.writeFileSync(path,content);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildCustomerApp({check:process.argv.includes('--check')});
