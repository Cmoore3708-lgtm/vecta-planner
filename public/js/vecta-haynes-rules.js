(function(root){
  'use strict';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const reg=value=>clean(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
  function safeUrl(value){const u=new URL(value);if(u.origin!=='https://www.workshopdata.com'||!u.pathname.startsWith('/touch/site/layout/'))throw Error('Unexpected data source.');return u.href;}
  function interval(label){const m=clean(label).match(/^([\d,]+)\s*miles\s*\/\s*(\d+)\s*months$/i);return m?{miles:Number(m[1].replace(/,/g,'')),months:Number(m[2])}:null;}
  function ukEngine(sections){
    const candidates=sections.filter(s=>{
      const label=clean(s.label);if(!/^Engine\b/i.test(label))return false;
      if(/except[^)]*(?:Europe|United Kingdom|\bUK\b)/i.test(label))return false;
      return /Europe|United Kingdom|\bUK\b/i.test(label)||/^Engine$/i.test(label)||/Engine\s*\(\s*except\b/i.test(label);
    });
    if(candidates.length!==1)throw Error('Engine oil has multiple or unsupported regional variants. Confirm the correct specification in HaynesPro.');
    return candidates[0];
  }
  function suggest(periods,mileage,registrationDate,now=new Date()){
    if(!Number.isInteger(Number(mileage))||Number(mileage)<=0)throw Error('Enter current mileage.');
    const d=String(registrationDate||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const months=d?Math.max(0,(now.getUTCFullYear()-Number(d[3]))*12+now.getUTCMonth()+1-Number(d[2])):0;
    const options=periods.map(p=>({...p,...interval(p.label)})).filter(p=>p.miles&&p.months).sort((a,b)=>a.months-b.months);
    return options.find(p=>p.miles>=Number(mileage)&&p.months>=months)||null;
  }
  function normalise(raw,request){
    if(reg(raw.registration)!==reg(request.registration))throw Error('Vehicle registration did not match.');
    if(!raw.vehicle||!interval(raw.period)||raw.period!==request.period)throw Error('Service interval did not match.');
    safeUrl(raw.sourceUrl);
    const operations=[...new Set((raw.operations||[]).map(clean).filter(s=>s&&!/^FOLLOW UP\b/i.test(s)))];
    if(operations.length<3)throw Error('The service checklist is incomplete.');
    const oil=(raw.oil||[]).map(clean).filter(s=>/Engine oil|Engine sump|oil drain plug/i.test(s));
    if(!oil.some(s=>/SAE\s*\d/i.test(s))||!oil.some(s=>/including filter.*\d[.,]?\d*\s*\(l\)/i.test(s)))throw Error('Oil specification or fill quantity is missing.');
    const textList=items=>[...new Set((items||[]).map(clean).filter(Boolean))].slice(0,200);
    return {version:1,provider:'HaynesPro',registration:reg(raw.registration),vehicle:clean(raw.vehicle),period:raw.period,conditions:clean(request.conditions),mileage:Number(request.mileage),fetchedAt:new Date().toISOString(),sourceUrl:safeUrl(raw.sourceUrl),operations:operations.slice(0,200),parts:textList(raw.parts),additionalWork:textList(raw.additionalWork),oil,labourHours:Number.isFinite(Number(raw.labourHours))?Number(raw.labourHours):null};
  }
  root.VectaHaynesRules={clean,reg,safeUrl,interval,ukEngine,suggest,normalise};
})(globalThis);
