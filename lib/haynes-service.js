import { HaynesError, normaliseReg, validReg, vehicleResult } from './haynes-vehicle.js';
const text = v => String(v || '').replace(/\s+/g,' ').trim().slice(0,600);
export function serviceRequest(raw) {
  const registration = normaliseReg(raw?.registration), mileage = Number(raw?.mileage);
  if (!validReg(registration) || !Number.isSafeInteger(mileage) || mileage <= 0 || mileage > 2000000) throw new HaynesError('INVALID_REQUEST');
  const period = String(raw.period || '');
  if (period && !/^mp_\d+$/.test(period)) throw new HaynesError('INVALID_REQUEST');
  return { registration, mileage, period };
}
export function serviceResult(raw, request) {
  const input = serviceRequest(request);
  if (Number(raw?.mileage) !== input.mileage || (input.period && input.period !== raw.period)) throw new HaynesError('MISMATCH');
  const vehicle = vehicleResult(raw.vehicle,input.registration);
  if (!/^mp_\d+$/.test(raw.period || '') || !text(raw.schedule)) throw new HaynesError('INCOMPLETE');
  const list = value => Array.isArray(value) ? value.slice(0,80).map(text).filter(Boolean) : [];
  const oil = Array.isArray(raw.oil) ? raw.oil.slice(0,12).map(x=>({ applicability:text(x.applicability), specification:text(x.specification), capacity:text(x.capacity) })).filter(x=>x.specification || x.capacity) : [];
  const periods = Array.isArray(raw.periods) ? raw.periods.filter(x=>/^mp_\d+$/.test(x.id || '') && /^\d[\d,]* miles\/\d+ months$/.test(text(x.label))).slice(0,100).map(x=>({id:x.id,label:text(x.label)})) : [];
  return {vehicle,mileage:input.mileage,period:raw.period,schedule:text(raw.schedule),conditions:text(raw.conditions),oil,parts:list(raw.parts),additional:list(raw.additional),periods,source:'HaynesPro',fetchedAt:vehicle.fetchedAt,ageMonths:Number.isInteger(raw.ageMonths)&&raw.ageMonths>=0&&raw.ageMonths<1200?raw.ageMonths:null,requiresConfirmation:true};
}
