const allowed=new Set(['Oil & Filter Change','Interim Service','Full Service','Major Service','EV Servicing','MOT','Diagnostics / warning light','Brakes','Tyres','Other']);
export function bookingTypes(body){
 const raw=body.job_types;
 if(!Array.isArray(raw)||!raw.length||raw.length>12)throw inputError();
 const types=[...new Set(raw.map(value=>{
  let type=String(value||'').trim();
  if(type==='Service')type=String(body.service_choice||'Full Service');
  if(/^interim service$/i.test(type))type='Interim Service';
  if(!allowed.has(type))throw inputError();return type;
 }))];
 return types;
}
function inputError(){const e=Error('Select valid work types before choosing an appointment.');e.code='BOOKING_INPUT';return e;}
