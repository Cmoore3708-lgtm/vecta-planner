const CACHE='vecta-workshop-pro-offline-v11-offline-reopen-v310';
const DATA_CACHE='vecta-workshop-pro-data-last-known-v1';
const HEALTH_CACHE='vecta-workshop-pro-cloud-health-v1';
const CORE=['/','/index.html','/manifest.webmanifest','/icons/vecta-192.png','/icons/vecta-512.png'];
const HEALTH_FAILURE_LIMIT=3;
const RECENT_CLOUD_SUCCESS_MS=120000;
let consecutiveHealthFailures=0;
let lastCloudSuccessAt=0;

function isSupabaseRestRequest(url){
  return /\.supabase\.co$/i.test(url.hostname) && url.pathname.startsWith('/rest/v1/');
}

function isJobsHealthProbe(url){
  return isSupabaseRestRequest(url)
    && url.pathname.endsWith('/rest/v1/jobs')
    && url.searchParams.get('select')==='id'
    && url.searchParams.get('limit')==='1';
}

async function writeHealthState(ok){
  try{
    const cache=await caches.open(HEALTH_CACHE);
    const state={ok:!!ok,at:Date.now()};
    await cache.put('/__vecta_cloud_health_state__',new Response(JSON.stringify(state),{
      headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    }));
  }catch(_e){}
}

async function readHealthState(){
  try{
    const cache=await caches.open(HEALTH_CACHE);
    const response=await cache.match('/__vecta_cloud_health_state__');
    if(!response) return null;
    return await response.json();
  }catch(_e){return null;}
}

async function recordCloudSuccess(){
  consecutiveHealthFailures=0;
  lastCloudSuccessAt=Date.now();
  await writeHealthState(true);
}

async function hasRecentCloudSuccess(){
  if(lastCloudSuccessAt && Date.now()-lastCloudSuccessAt<RECENT_CLOUD_SUCCESS_MS) return true;
  const state=await readHealthState();
  if(state?.ok && Number.isFinite(Number(state.at)) && Date.now()-Number(state.at)<RECENT_CLOUD_SUCCESS_MS){
    lastCloudSuccessAt=Number(state.at);
    return true;
  }
  return false;
}

function syntheticHealthSuccess(){
  return new Response('[{"id":"vecta-cloud-health"}]',{
    status:200,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'Access-Control-Allow-Origin':'*'
    }
  });
}

async function serverConfirmsSupabase(){
  try{
    const response=await fetch('/api/cloud-health',{cache:'no-store'});
    if(!response.ok) return false;
    const body=await response.json().catch(()=>null);
    return body?.ok===true;
  }catch(_e){return false;}
}

async function handleJobsHealthProbe(req){
  try{
    const fresh=await fetch(req,{cache:'no-store'});
    if(fresh?.ok){
      await recordCloudSuccess();
      const cache=await caches.open(DATA_CACHE);
      const contentType=String(fresh.headers.get('content-type')||'').toLowerCase();
      if(contentType.includes('json')) await cache.put(req,fresh.clone());
      return fresh;
    }
  }catch(_e){}

  if(await serverConfirmsSupabase()){
    await recordCloudSuccess();
    return syntheticHealthSuccess();
  }

  consecutiveHealthFailures+=1;
  if(await hasRecentCloudSuccess()) return syntheticHealthSuccess();
  if(consecutiveHealthFailures<HEALTH_FAILURE_LIMIT){
    const cached=await caches.open(DATA_CACHE).then(cache=>cache.match(req)).catch(()=>null);
    if(cached) return cached;
  }

  await writeHealthState(false);
  const cached=await caches.open(DATA_CACHE).then(cache=>cache.match(req)).catch(()=>null);
  return cached || Response.error();
}

async function fetchSupabaseWithLastKnownFallback(req){
  const cache=await caches.open(DATA_CACHE);
  try{
    const fresh=await fetch(req,{cache:'no-store'});
    const contentType=String(fresh.headers.get('content-type')||'').toLowerCase();
    if(fresh.ok && contentType.includes('json')){
      await cache.put(req,fresh.clone());
      await recordCloudSuccess();
      return fresh;
    }
    if(fresh.status===429 || fresh.status>=500){
      const cached=await cache.match(req);
      if(cached) return cached;
    }
    return fresh;
  }catch(_e){
    return (await cache.match(req)) || Response.error();
  }
}

function patchAppShellHtml(html){
  let patched=String(html||'');
  patched=patched.replace(
    /<!-- VECTA REFRESH RECOVERY 2026-09-01:[\s\S]*?<\/script>/,
    '<!-- VECTA V310: offline cache is persistent; old one-time recovery purge removed. --><script>window.__vectaCacheResetPromise=Promise.resolve();</script>'
  );
  const oldRegister="function registerVectaServiceWorker(){if('serviceWorker' in navigator){window.addEventListener('load',function(){Promise.resolve(window.__vectaCacheResetPromise).finally(function(){navigator.serviceWorker.register('/service-worker.js?v=20260902-push-verify-v306',{updateViaCache:'none'}).then(function(reg){try{reg.update()}catch(_e){}}).catch(function(e){console.warn('Offline app install failed',e)})})})}}";
  const safeRegister="function registerVectaServiceWorker(){if('serviceWorker' in navigator){window.addEventListener('load',function(){Promise.resolve(window.__vectaCacheResetPromise).finally(function(){navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'}).then(function(reg){if(navigator.onLine){Promise.resolve(reg.update()).catch(function(e){console.warn('Service worker update skipped',e)})}}).catch(function(e){console.warn('Offline app install skipped',e)})})})}}";
  if(patched.includes(oldRegister)) patched=patched.replace(oldRegister,safeRegister);
  return patched;
}

async function htmlResponseFrom(response){
  if(!response) return response;
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html')) return response;
  const text=await response.text();
  const headers=new Headers(response.headers);
  headers.set('Content-Type','text/html; charset=utf-8');
  return new Response(patchAppShellHtml(text),{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

async function cachePatchedShell(response){
  if(!response || !response.ok) return response;
  const patched=await htmlResponseFrom(response);
  const cache=await caches.open(CACHE);
  await cache.put('/index.html',patched.clone());
  await cache.put('/',patched.clone());
  return patched;
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(CORE.map(async url=>{
      try{
        const response=await fetch(url,{cache:'reload'});
        if(response && response.ok){
          if(url==='/' || url==='/index.html'){
            const patched=await htmlResponseFrom(response);
            await cache.put(url,patched.clone());
          }else{
            await cache.put(url,response.clone());
          }
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

  if(isJobsHealthProbe(url)){
    event.respondWith(handleJobsHealthProbe(req));
    return;
  }

  if(isSupabaseRestRequest(url)){
    event.respondWith(fetchSupabaseWithLastKnownFallback(req));
    return;
  }

  if(url.origin===self.location.origin){
    if(url.pathname.startsWith('/api/')) return;

    if(req.mode==='navigate'){
      event.respondWith((async()=>{
        try{
          const fresh=await fetch(req,{cache:'no-store'});
          if(fresh && fresh.ok) return await cachePatchedShell(fresh);
          const cached=(await caches.match('/index.html')) || (await caches.match('/'));
          return cached ? await htmlResponseFrom(cached) : fresh;
        }catch(_e){
          const cached=(await caches.match('/index.html')) || (await caches.match('/'));
          return cached ? await htmlResponseFrom(cached) : Response.error();
        }
      })());
      return;
    }

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
