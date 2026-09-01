const CACHE='vecta-workshop-pro-offline-v291-booking-badge';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/vecta-180.png','/icons/vecta-192.png','/icons/vecta-512.png','/icons/vecta-badge-96.png'];

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
          const fresh=await fetch(req);
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
        const fresh=await fetch(req);
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
        const fresh=await fetch(req);
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

self.addEventListener('push',event=>{
  const payload=(()=>{try{return event.data?event.data.json():{}}catch(_e){return {}}})();
  const count=Math.max(0,Number(payload.count)||0);
  event.waitUntil((async()=>{
    if('setAppBadge' in self.navigator){
      try{if(count)await self.navigator.setAppBadge(count);else await self.navigator.clearAppBadge()}catch(_e){}
    }
    await self.registration.showNotification(payload.title||'New VECTA website booking',{
      body:payload.body||'A new booking is waiting for review.',
      icon:'/icons/vecta-192.png',badge:'/icons/vecta-badge-96.png',
      tag:'vecta-website-bookings',renotify:true,
      data:{url:payload.url||'/?view=websiteRequests'}
    });
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=(event.notification.data&&event.notification.data.url)||'/?view=websiteRequests';
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('navigate' in client)await client.navigate(target);
      if('focus' in client)return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
