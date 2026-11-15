import {isMechanicHost} from './mechanic-auth.js';

// Exact public metadata paths only: never rewrite application pages or APIs.
const mechanicPaths=new Map([
 ['/manifest.webmanifest','/icons/mechanic/manifest.webmanifest'],
 ['/favicon.ico','/icons/mechanic/favicon-20261115.ico'],
 ['/favicon.png','/icons/mechanic/v-32-20261115.png'],
 ...['/apple-touch-icon.png','/apple-touch-icon-precomposed.png','/apple-touch-icon-180x180.png','/icons/vecta-180.png'].map(path=>[path,'/icons/mechanic/v-180-20261115.png']),
 ['/icons/vecta-192.png','/icons/mechanic/v-192-20261115.png'],
 ['/icons/vecta-512.png','/icons/mechanic/v-512-20261115.png'],
 ['/icons/vecta-maskable-512.png','/icons/mechanic/v-maskable-512-20261115.png']
]);
export function mechanicShortcutTarget(hostname,pathname){
 return isMechanicHost(hostname)?mechanicPaths.get(pathname)||null:null;
}
