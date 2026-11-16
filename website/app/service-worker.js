/* Customer-only worker. Never caches booking APIs, photos, invoices, tokens or
   workshop data, and never deletes the workshop's offline cache. */
const CACHE='vecta-customer-shell-v5';
const SHELL=['/app/vecta-header.jpg','/app/home','/app/booking','/app/garage.js','/app/garage.css','/app/car-placeholder.svg','/app/bootstrap.js','/app/app.js','/app/app.css','/app/icon-180.png','/app/icon-192.png','/app/icon-512.png','/app/manifest.webmanifest','/js/vecta-progress.js','/js/vecta-progress.css','/js/vecta-vehicle-image.js','/js/vecta-message-summary.js','/js/vecta-customer-portal.js','/js/vecta-customer-portal.css','/js/vecta-website-visit.js','/assets/vecta-header.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('vecta-customer-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.search||!SHELL.includes(url.pathname))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok&&response.type==='basic'){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)));}return response;
 }).catch(async()=>await caches.match(url.pathname)||Response.error()));
});
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 const body=typeof payload.body==='string'?payload.body.slice(0,180):'You have an update from Vecta. Open your app to view it.';
 event.waitUntil(self.registration.showNotification('Vecta Motors',{body,icon:'/app/icon-192.png',badge:'/app/icon-192.png',tag:typeof payload.tag==='string'?payload.tag.slice(0,120):'vecta-customer-update',data:{url:'/app/home'}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const client=clients.find(client=>new URL(client.url).origin===self.location.origin&&new URL(client.url).pathname.startsWith('/app/'));
  if(client){await client.focus();client.postMessage({type:'vecta-customer-update'});return;}
  return self.clients.openWindow('/app/home');
 }));
});
