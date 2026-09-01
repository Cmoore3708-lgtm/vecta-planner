const CACHE='vecta-workshop-pro-offline-v5-finance-v290';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/vecta-192.png','/icons/vecta-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(response && response.ok && !String(response.headers.get('content-type')||'').toLowerCase().includes('text/html') || url==='/' || url==='/index.html'){
          await cache.put(url,response.clone());
        }
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
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/')) return;

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

  // Never serve JavaScript from Cache Storage. JS must come from the deployment,
  // so an HTML rewrite can never be replayed later as executable code.
  if(/\.m?js$/i.test(url.pathname)){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }

  event.respondWith((async()=>{
    try{
      const fresh=await fetch(req,{cache:'no-store'});
      if(fresh && fresh.ok){
        const cache=await caches.open(CACHE);
        await cache.put(req,fresh.clone());
      }
      return fresh;
    }catch(_e){
      return (await caches.match(req)) || Response.error();
    }
  })());
});
