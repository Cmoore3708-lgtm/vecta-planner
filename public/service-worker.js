const CACHE='vecta-workshop-pro-offline-v8-background-push-v307';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/vecta-192.png','/icons/vecta-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      try{
        const response=await fetch(url,{cache:'reload'});
        if(response && response.ok) await cache.put(url,response.clone());
      }catch(_e){}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE && k.startsWith('vecta-workshop-pro-offline-')).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  if(url.origin===self.location.origin){
    if(url.pathname.startsWith('/api/')) return;

    // Navigation requests: network first while online; cached app shell when offline.
    if(req.mode==='navigate'){
      event.respondWith((async()=>{
        try{
          const fresh=await fetch(req,{cache:'no-store'});
          if(fresh && fresh.ok){
            const cache=await caches.open(CACHE);
            await cache.put('/index.html',fresh.clone());
          }
          return fresh;
        }catch(_e){
          return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
        }
      })());
      return;
    }

    // Same-origin static assets: cache as they are used.
    event.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached) return cached;
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(fresh && fresh.ok){
          const cache=await caches.open(CACHE);
          await cache.put(req,fresh.clone());
        }
        return fresh;
      }catch(_e){
        return cached || Response.error();
      }
    })());
    return;
  }

  // Supabase browser library is third-party and must be available after first online load.
  if(url.hostname==='cdn.jsdelivr.net'){
    event.respondWith((async()=>{
      const cached=await caches.match(req);
      if(cached) return cached;
      try{
        const fresh=await fetch(req,{cache:'no-store'});
        if(fresh && fresh.ok){
          const cache=await caches.open(CACHE);
          await cache.put(req,fresh.clone());
        }
        return fresh;
      }catch(_e){
        return cached || Response.error();
      }
    })());
  }
});

/* Background website-booking push receiver. A server Web Push reaches this
   service worker even when the VECTA window is closed. */
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let data={};
    try{data=event.data?event.data.json():{}}catch(_e){data={body:event.data?event.data.text():''}}
    const count=Math.max(0,Number(data.count)||0);
    try{
      if(self.navigator&&typeof self.navigator.setAppBadge==='function'){
        if(count)await self.navigator.setAppBadge(count);
        else if(typeof self.navigator.clearAppBadge==='function')await self.navigator.clearAppBadge();
      }
    }catch(_e){}
    await self.registration.showNotification(data.title||'New VECTA website booking',{
      body:data.body||'A new customer booking is waiting for review.',
      icon:'/icons/vecta-192.png',badge:'/icons/vecta-192.png',
      tag:data.tag||'vecta-website-bookings',renotify:true,
      data:{url:data.url||'/?view=websiteRequests',count}
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL((event.notification.data&&event.notification.data.url)||'/?view=websiteRequests',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){try{await client.navigate(target)}catch(_e){};return client.focus()}
    }
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  })());
});
