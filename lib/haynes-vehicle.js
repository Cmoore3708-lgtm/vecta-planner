export const normaliseReg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const normaliseMake = value => {
  const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  return {VW:'VOLKSWAGEN',MERCEDES:'MERCEDESBENZ'}[key]||key;
};
// Compare official model families, allowing trim suffixes and supplier chassis codes.
// Never equate different numeric models (NV200/NV400, CX3/CX30, 208/2008).
export function vehicleMatches(value, expected={}) {
  if(!value)return false;
  if(expected.make&&normaliseMake(value.make)!==normaliseMake(expected.make))return false;
  const model=(v,manufacturer)=>{
    let text=String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
      .replace(/\([^)]*\)/g,' ').replace(/[^A-Z0-9]+/g,' ').trim().replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/,'');
    const parts=text.split(' ');
    for(let count=3;count>0;count--)if(parts.length>count&&normaliseMake(parts.slice(0,count).join(' '))===normaliseMake(manufacturer)){text=parts.slice(count).join(' ');break;}
    const brand=normaliseMake(manufacturer);
    if(brand&&text.startsWith(brand)&&/^\d/.test(text.slice(brand.length)))text=text.slice(brand.length);
    text=text.replace(/([A-Z])\s+(?=\d)/g,'$1').replace(/(\d)\s+(?=[A-Z](?:\s|$))/g,'$1');
    if(brand==='MERCEDESBENZ')text=text.replace(/^([A-Z]{1,3})(?: CLASS|\d{3}[A-Z]*)(?= |$)/,'$1');
    if(brand==='BMW')text=text.replace(/^([1-8])(?:\d{2}[A-Z]*| SERIES)(?= |$)/,'$1');
    return text;
  };
  const wanted=model(expected.model,expected.make||value.make);if(!wanted)return true;
  return String(value.model||'').split('/').some(part=>{
    const actual=model(part,value.make);return !!actual&&(actual===wanted||wanted.startsWith(actual+' ')||actual.startsWith(wanted+' '));
  });
}
export function validReg(value) { return /^[A-Z0-9]{2,8}$/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && !/^(?:UNKNOWN|NOREG|NOTKNOWN|PENDING|RESCUE)\d*$/.test(value); }
export class HaynesError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function imageUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://www.haynespro-assets.com' && /^\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(url.pathname) && !url.search && !url.hash) return url.href;
  } catch {}
  return '';
}
const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 180);
// Public allowlist: never expose VIN, cookies, page HTML or supplier URLs.
export function vehicleResult(raw, registration) {
  if (!raw || normaliseReg(raw.registration) !== registration) throw new HaynesError('MISMATCH');
  if (raw.ambiguous) throw new HaynesError('AMBIGUOUS');
  if (!/^t_\d+$/.test(raw.typeId || '') || !clean(raw.make) || !clean(raw.model) || !clean(raw.variant)) throw new HaynesError('INCOMPLETE');
  const result = {
    registration, make: clean(raw.make), model: clean(raw.model), variant: clean(raw.variant),
    engineCode: clean(raw.engineCode), modelYears: clean(raw.modelYears),
    vehicle: [clean(raw.make), clean(raw.model), clean(raw.variant)].join(' '),
    typeId: raw.typeId, ...(/^\d{1,12}$/.test(String(raw.ktypNr || '')) ? {ktypNr: String(raw.ktypNr)} : {}), imageUrl: imageUrl(raw.imageUrl),
    source: 'HaynesPro', fetchedAt: raw.fetchedAt || new Date().toISOString()
  };
  if (!Number.isFinite(Date.parse(result.fetchedAt))) throw new HaynesError('INCOMPLETE');
  return result;
}
