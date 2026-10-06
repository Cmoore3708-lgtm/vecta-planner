export const normaliseReg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function validReg(value) { return /^[A-Z0-9]{2,8}$/.test(value); }
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
    typeId: raw.typeId, imageUrl: imageUrl(raw.imageUrl),
    source: 'HaynesPro', fetchedAt: raw.fetchedAt || new Date().toISOString()
  };
  if (!Number.isFinite(Date.parse(result.fetchedAt))) throw new HaynesError('INCOMPLETE');
  return result;
}
