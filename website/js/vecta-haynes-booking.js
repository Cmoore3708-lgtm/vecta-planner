(function(root){
  const reg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const make = value => {const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');return {VW:'VOLKSWAGEN',MERCEDES:'MERCEDESBENZ'}[key]||key;};
  const safeImage = value => /^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(value || '') ? value : '';
  function unavailableMessage(reason) {
    return ({
      OFFLINE: 'Detailed vehicle information is temporarily offline. You can continue your booking; we’ll confirm the details.',
      NOT_PAIRED: 'Detailed vehicle information is temporarily offline. You can continue your booking; we’ll confirm the details.',
      BUSY: 'Vehicle lookup is busy. Please try again shortly, or continue your booking.',
      TIMEOUT: 'Vehicle lookup took too long. Please retry, or continue your booking.',
      LOGIN_REQUIRED: 'Detailed vehicle information is temporarily unavailable. You can continue your booking.',
      VERIFICATION_REQUIRED: 'Detailed vehicle information is temporarily unavailable. You can continue your booking.',
      DAILY_LIMIT: 'Detailed vehicle information is temporarily unavailable. You can continue your booking.'
    })[reason] || 'Detailed vehicle information is unavailable. Your MOT lookup is still available.';
  }
  function createController({ getRegistration, getMake, getModel = () => '', onChange, fetcher = root.fetch.bind(root) }) {
    let generation = 0, abort = null, warm = null;
    const artworkKey='vecta_booking_artwork_v1',artworkCache=new Map();
    try{for(const v of JSON.parse(root.localStorage?.getItem(artworkKey)||'[]'))if(reg(v?.registration)&&safeImage(v?.imageUrl))artworkCache.set(reg(v.registration),v);}catch{}
    function rememberArtwork(v){
      if(!safeImage(v?.imageUrl))return;
      const value={registration:reg(v.registration),make:v.make,model:v.model,vehicle:[v.make,v.model].join(' '),imageUrl:safeImage(v.imageUrl),colour:v.colour||'',source:'SavedArtwork',...(v.generic?{generic:true}:{}),...(v.manual?{manual:true}:{})};
      artworkCache.delete(value.registration);artworkCache.set(value.registration,value);while(artworkCache.size>100)artworkCache.delete(artworkCache.keys().next().value);
      try{root.localStorage?.setItem(artworkKey,JSON.stringify([...artworkCache.values()]));}catch{}
      return value;
    }
    function prefetch(registration) {
      const requested = reg(registration);
      // Only recognise a complete modern plate automatically; personalised and
      // older plates still work through the normal lookup after identification.
      if (!/^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(requested)) return null;
      if (warm?.registration === requested && Date.now() - warm.at < 30000) return warm.promise;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const promise = Promise.resolve().then(() => fetcher('/api/haynes-vehicle?reg=' + encodeURIComponent(requested), {signal: controller.signal, cache: 'no-store'}))
        .then(async response => ({ok: response.ok, data: await response.json()}))
        .catch(() => null).finally(() => clearTimeout(timer));
      warm = {registration: requested, at: Date.now(), promise};
      return promise;
    }
    function reset() { generation++; abort?.abort(); abort = null; onChange({ status: 'idle', vehicle: null }); }
    async function lookup(registration) {
      reset();
      const current = generation, requested = reg(registration);
      if (requested !== reg(getRegistration())) return;
      const requestAbort = new AbortController(); abort = requestAbort;
      const timer = setTimeout(() => requestAbort.abort(), 30000);
      onChange({ status: 'loading', vehicle: null });
      const expected={make:getMake(),model:getModel()};
      const matches=vehicle=>make(vehicle?.make)===make(expected.make)&&(!expected.model||root.VectaVehicleImage?.vehicleMatches?.(vehicle,expected)===true);
      const local=artworkCache.get(requested);
      let savedArtwork=local&&matches(local)?local:null,matched=false;
      if(savedArtwork)onChange({status:'artwork',vehicle:savedArtwork});
      const currentRequest=()=>current===generation&&requested===reg(getRegistration());
      // Paint saved artwork immediately while technical identification runs separately.
      const artworkTask=expected.make&&expected.model?Promise.resolve().then(()=>fetcher('/api/vehicle-artwork?'+new URLSearchParams({reg:requested,make:expected.make,model:expected.model}),{signal:requestAbort.signal,cache:'no-store'}))
        .then(async response=>({ok:response.ok,data:await response.json()}))
        .then(({ok,data})=>{const v=data.vehicle;if(ok&&data.status==='ARTWORK'&&reg(v?.registration)===requested&&safeImage(v?.imageUrl)&&matches(v)){
          savedArtwork=rememberArtwork(v);
          if(currentRequest()&&!matched)onChange({status:'artwork',vehicle:savedArtwork});
        }}).catch(()=>{}):Promise.resolve();
      try {
        const early = warm?.registration === requested && Date.now() - warm.at < 30000 ? await warm.promise : null;
        const response = early || await fetcher('/api/haynes-vehicle?reg=' + encodeURIComponent(requested), { signal: requestAbort.signal, cache: 'no-store' });
        const data = early ? early.data : await response.json();
        if (current !== generation || requested !== reg(getRegistration())) return;
        const vehicle = data.vehicle;
        if (response.ok && data.status === 'MATCHED' && reg(vehicle?.registration) === requested && matches(vehicle) && vehicle?.variant && vehicle?.model) {
          matched=true;
          // A valid engine match can lack a drawing: keep the independently saved image.
          await artworkTask;
          if(!currentRequest())return;
          const display={ ...vehicle, imageUrl: savedArtwork?.manual?savedArtwork.imageUrl:safeImage(vehicle.imageUrl)||savedArtwork?.imageUrl||'',colour:savedArtwork?.colour||'',...(savedArtwork?.manual?{manual:true}:{}) };
          rememberArtwork(display);onChange({ status: 'matched', vehicle:display });
        } else {await artworkTask;if(!currentRequest())return;onChange(savedArtwork?{status:'artwork',vehicle:savedArtwork}:{ status: data.status === 'AMBIGUOUS' ? 'ambiguous' : 'unavailable', vehicle: null, reason: ['OFFLINE','NOT_PAIRED','BUSY','LOGIN_REQUIRED','VERIFICATION_REQUIRED','DAILY_LIMIT'].includes(data.status) ? data.status : 'UNAVAILABLE' });}
      } catch {
        await artworkTask;
        if (currentRequest()) onChange(savedArtwork?{status:'artwork',vehicle:savedArtwork}:{ status: 'unavailable', vehicle: null, reason: requestAbort.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE' });
      } finally { clearTimeout(timer); }
    }
    return { reset, lookup, prefetch };
  }
  root.VectaHaynesBooking = { createController, safeImage, unavailableMessage };
})(typeof window === 'undefined' ? globalThis : window);

