import { HaynesError, normaliseReg, validReg, vehicleResult } from './haynes-vehicle.js';
const text = v => String(v || '').replace(/\s+/g,' ').trim().slice(0,600);
export function serviceRequest(raw) {
  const registration = normaliseReg(raw?.registration), mileage = Number(raw?.mileage);
  if (!validReg(registration) || !Number.isSafeInteger(mileage) || mileage <= 0 || mileage > 2000000) throw new HaynesError('INVALID_REQUEST');
  const period = String(raw.period || '');
  if (period && !/^mp_\d+$/.test(period)) throw new HaynesError('INVALID_REQUEST');
  const system = String(raw.system || '');
  if (system && !/^ms_\d+$/.test(system)) throw new HaynesError('INVALID_REQUEST');
  if (raw.scheduleMode && raw.scheduleMode !== 'choose') throw new HaynesError('INVALID_REQUEST');
  return { registration, mileage, period, ...(system ? {system} : {}), ...(raw.scheduleMode === 'choose' ? {scheduleMode:'choose'} : {}) };
}
export function serviceResult(raw, request) {
  const input = serviceRequest(request);
  if (Number(raw?.mileage) !== input.mileage || (input.period && input.period !== raw.period)) throw new HaynesError('MISMATCH');
  const vehicle = vehicleResult(raw.vehicle,input.registration);
  const schedules = serviceScheduleChoices(raw.schedules);
  if (raw.kind === 'schedule_choices') {
    if (input.system || input.period || input.scheduleMode !== 'choose' || schedules.length < 2) throw new HaynesError('MISMATCH');
    return {kind:'schedule_choices',vehicle,mileage:input.mileage,period:'',schedules,source:'HaynesPro',fetchedAt:vehicle.fetchedAt,requiresConfirmation:true};
  }
  if (input.system && raw.system !== input.system) throw new HaynesError('MISMATCH');
  if (raw.kind === 'period_choices') {
    if (!input.system || input.period || input.scheduleMode !== 'choose') throw new HaynesError('MISMATCH');
    const periods = publicServicePeriods(raw.periods);
    if (!periods.length) throw new HaynesError('INCOMPLETE');
    return {kind:'period_choices',vehicle,mileage:input.mileage,period:'',system:raw.system,conditions:text(raw.conditions),schedules,periods,source:'HaynesPro',fetchedAt:vehicle.fetchedAt,requiresConfirmation:true};
  }
  if (!/^mp_\d+$/.test(raw.period || '') || !text(raw.schedule)) throw new HaynesError('INCOMPLETE');
  const list = value => Array.isArray(value) ? value.slice(0,80).map(text).filter(Boolean) : [];
  const oil = Array.isArray(raw.oil) ? raw.oil.slice(0,12).map(x=>({ applicability:text(x.applicability), specification:text(x.specification), capacity:text(x.capacity) })).filter(x=>x.specification || x.capacity) : [];
  const periods = publicServicePeriods(raw.periods);
  return {...(/^ms_\d+$/.test(raw.system||'') ? {system:raw.system,schedules} : {}),vehicle,mileage:input.mileage,period:raw.period,schedule:text(raw.schedule),conditions:text(raw.conditions),oil,parts:list(raw.parts),additional:list(raw.additional),periods,source:'HaynesPro',fetchedAt:vehicle.fetchedAt,ageMonths:Number.isInteger(raw.ageMonths)&&raw.ageMonths>=0&&raw.ageMonths<1200?raw.ageMonths:null,requiresConfirmation:true};
}
// Return bounded public labels and IDs; never supplier URLs, CSRF fields or HTML.
export function serviceScheduleChoices(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 40) throw new HaynesError('INCOMPLETE');
  const seen = new Set();
  return raw.map(choice => {
    const id = String(choice?.id || ''), label = text(choice?.label);
    if (!/^ms_\d+$/.test(id) || !label || seen.has(id)) throw new HaynesError('INCOMPLETE');
    seen.add(id); return {id,label};
  });
}
function publicServicePeriods(raw) {
  if (!Array.isArray(raw)) return [];
  const seen=new Set();
  return raw.slice(0,100).filter(p=>/^mp_\d+$/.test(p?.id||'')&&text(p.label)&&!seen.has(p.id)&&(seen.add(p.id),true)).map(p=>({id:p.id,label:text(p.label)}));
}
export function servicePeriodLinks(links,{system,typeId}) {
  const seen=new Set();
  return links.filter(link=>{
    try { const u=new URL(link.href),id=u.searchParams.get('maintenancePeriodId');
      if(u.origin!=='https://www.workshopdata.com'||u.pathname!=='/touch/site/layout/maintenanceSchedule'||u.searchParams.get('typeId')!==typeId||u.searchParams.get('maintenanceSystemId')!==system||!/^mp_\d+$/.test(id||'')||!text(link.label)||seen.has(id))return false;
      seen.add(id);return true;
    } catch {return false;}
  });
}
// Supplier renders duplicate desktop/mobile links: deduplicate before comparing intervals.
export function selectServicePeriod(links,{mileage,period,system,typeId,ageMonths}) {
  const available=servicePeriodLinks(links,{system,typeId});
  if(period)return available.find(x=>new URL(x.href).searchParams.get('maintenancePeriodId')===period);
  const periods=available.filter(x=>/^\d[\d,]* miles\/\d+ months$/.test(x.label)).sort((a,b)=>Number(a.label.split(' ')[0].replace(/,/g,''))-Number(b.label.split(' ')[0].replace(/,/g,'')));
  const milePeriod=periods.find(x=>Number(x.label.split(' ')[0].replace(/,/g,''))>=mileage);
  if(!milePeriod)return undefined;
  return milePeriod;
}
