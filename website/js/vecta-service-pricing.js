(function(root) {
  const services = ['Oil & Filter Change','Full Service','Major Service','Interim Service','EV Major Service'];
  function request(form) {
    if (!form.job_types?.includes('Service') || !services.includes(form.service_choice) || form.nevos_vehicle === 'yes') return null;
    const registration = String(form.registration || '').toUpperCase().replace(/\s/g,'');
    if (!/^[A-Z0-9]{5,8}$/.test(registration)) return null;
    const mileage = form.mileage_unknown || form.mileage === '' ? null : Number(form.mileage);
    if (mileage !== null && (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2000000)) return null;
    return {registration,service:form.service_choice,mileage,range:form.parts_range || 'Mid Range'};
  }
  function createController({getForm,onChange,fetcher = root.fetch.bind(root),now = Date.now,wait = ms => new Promise(r=>setTimeout(r,ms))}) {
    let generation = 0, key = '', controller = null, expiryTimer = null, value = {status:'idle',quote:null};
    const publish = next => {value=next;onChange(next);};
    function currentQuote() {
      const input=request(getForm());
      return input && value.status==='matched' && value.quote.expiresAt>now() && JSON.stringify(value.quote.request)===JSON.stringify(input) ? value.quote : null;
    }
    function update() {
      const input=request(getForm()), nextKey=JSON.stringify(input);
      if (key===nextKey && !(value.status==='matched' && !currentQuote())) return;
      key=nextKey;generation++;controller?.abort();clearTimeout(expiryTimer);controller=new AbortController();
      const active=generation,signal=controller.signal;
      if (!input) {value={status:'idle',quote:null};return;}
      value={status:'loading',quote:null};
      // Debounce mileage edits, then poll a shared queue job without blocking navigation.
      void (async()=>{
        await wait(500);
        if(active!==generation)return;
        publish(value);
        const started=now();
        try {
          while(active===generation && now()-started<165000) {
            const response=await fetcher('/api/service-price',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),cache:'no-store'});
            const data=await response.json();
            if(active!==generation)return;
            if(!response.ok)throw Error('UNAVAILABLE');
            if(data.status==='PENDING'){await wait(2000);continue;}
            if(data.status==='MATCHED' && data.quote?.expiresAt>now() && typeof data.quote.token==='string' &&
              JSON.stringify(data.quote.request)===JSON.stringify(input) && Number.isSafeInteger(data.quote.totalPence) && data.quote.totalPence>0) {
              expiryTimer=setTimeout(()=>{if(active===generation)publish({status:'unavailable',quote:null});},data.quote.expiresAt-now());
              publish({status:'matched',quote:data.quote});return;
            }
            publish({status:data.status==='DISABLED'?'disabled':'unavailable',quote:null});return;
          }
          if(active===generation)publish({status:'unavailable',quote:null});
        } catch {if(active===generation)publish({status:'unavailable',quote:null});}
      })();
    }
    function reset(){key='';generation++;controller?.abort();clearTimeout(expiryTimer);value={status:'idle',quote:null};}
    return {update,reset,currentQuote};
  }
  root.VectaServicePricing={createController,request};
})(typeof window==='undefined'?globalThis:window);
