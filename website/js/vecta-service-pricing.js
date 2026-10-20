(function(root){
  const registration = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
  // Accept only a service refill explicitly including the oil filter. Never
  // extract a number from viscosity, gearbox capacity, dry fill or a range.
  function oilQuantity(oil){
    if(!Array.isArray(oil)||!oil.length)return null;
    const quantities=new Set();
    for(const row of oil){
      const capacity=String(row?.capacity||'').trim();
      const match=capacity.match(/^Engine sump,\s*including filter\s+(\d+(?:[.,]\d{1,3})?)\s*\(l\)$/i);
      if(!match)return null;
      const litres=Number(match[1].replace(',','.'));
      if(!Number.isFinite(litres)||litres<1||litres>15)return null;
      quantities.add(litres);
    }
    return quantities.size===1?[...quantities][0]:null;
  }
  function fuelKind(value){
    const fuel=String(value||'').toLowerCase();
    const petrol=/\bpetrol\b/.test(fuel),diesel=/\bdiesel\b/.test(fuel);
    return petrol!==diesel?(petrol?'petrol':'diesel'):null;
  }
  function prices(litres,fuel){
    const kind=fuelKind(fuel);
    if(typeof litres!=='number'||!Number.isFinite(litres)||litres<1||litres>15||!kind)return null;
    const money=value=>Math.round((value+Number.EPSILON)*100)/100;
    const roundUp=value=>Math.ceil(money(value)/5)*5;
    const oilCost=money(litres*10);
    return {source:'HaynesPro',oilLitres:litres,fuel:kind,vatIncluded:true,
      oil:roundUp(oilCost+40),full:roundUp(oilCost+115),major:roundUp(oilCost+(kind==='petrol'?200:165))};
  }
  function matchesIdentity(a,b){
    return !!a&&!!b&&registration(a.registration)===registration(b.registration)&&
      /^t_\d+$/.test(a.typeId||'')&&a.typeId===b.typeId&&
      String(a.engineCode||'').trim().toUpperCase()===String(b.engineCode||'').trim().toUpperCase();
  }
  function createController({onChange,fetcher=(...args)=>root.fetch(...args),timeout=2000}){
    let generation=0,abort=null;
    function reset(){generation++;abort?.abort();abort=null;onChange(null);}
    async function lookup(vehicle){
      reset();const current=generation,controller=new AbortController();abort=controller;
      let timer;
      try{
        const query=new URLSearchParams({reg:vehicle.registration,typeId:vehicle.typeId,engineCode:vehicle.engineCode||''});
        const data=await Promise.race([
          Promise.resolve().then(()=>fetcher('/api/haynes-pricing?'+query,{signal:controller.signal,cache:'no-store'})).then(async r=>r.ok?await r.json():null),
          new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeout);})
        ]);
        if(current!==generation)return;
        if(data?.status==='MATCHED'&&data.source==='HaynesPro'&&matchesIdentity(data,vehicle)&&typeof data.oilLitres==='number'&&Number.isFinite(data.oilLitres)&&data.oilLitres>=1&&data.oilLitres<=15)onChange(data);
      }catch{}finally{clearTimeout(timer);}
    }
    return {lookup,reset};
  }
  root.VectaServicePricing={oilQuantity,fuelKind,prices,matchesIdentity,createController};
})(typeof window==='undefined'?globalThis:window);
