import { normaliseReg, validReg, vehicleResult, HaynesError } from '../../lib/haynes-vehicle.js';

export function createLookupService(lookup, { now = Date.now, ttl = 86400000, maxQueue = 3, maxCache = 500, dailyLimit = 500, failureTtl = 300000 } = {}) {
  const cache = new Map(), pending = new Map(), failures = new Map();
  let tail = Promise.resolve(), circuitUntil = 0, circuitCode = '', count = 0, day = '';
  return async input => {
    const registration = normaliseReg(input);
    if (!validReg(registration)) throw new HaynesError('INVALID_REGISTRATION');
    const hit = cache.get(registration);
    if (hit && hit.expires > now()) return { ...hit.data, cached: true };
    cache.delete(registration);
    const failure = failures.get(registration);
    if (failure && failure.expires > now()) throw new HaynesError(failure.code);
    failures.delete(registration);
    if (pending.has(registration)) return pending.get(registration);
    if (circuitUntil > now()) throw new HaynesError(circuitCode);
    if (pending.size >= maxQueue) throw new HaynesError('BUSY');
    const today = new Date(now()).toISOString().slice(0, 10);
    if (day !== today) { day = today; count = 0; }
    if (count >= dailyLimit) throw new HaynesError('DAILY_LIMIT');
    count++;
    const promise = tail.then(async () => {
      // A previous queued lookup may have opened the circuit.
      if (circuitUntil > now()) throw new HaynesError(circuitCode);
      const data = vehicleResult(await lookup(registration), registration);
      if (cache.size >= maxCache) cache.delete(cache.keys().next().value);
      cache.set(registration, { data, expires: now() + ttl });
      return { ...data, cached: false };
    }).catch(error => {
      if (['UNAVAILABLE','AMBIGUOUS','INCOMPLETE','MISMATCH'].includes(error.code)) {
        if (failures.size >= maxCache) failures.delete(failures.keys().next().value);
        failures.set(registration, { code: error.code, expires: now() + (error.reason === 'TIMEOUT' || error.reason === 'BROWSER_ERROR' ? Math.min(failureTtl,15000) : failureTtl) });
      }
      if (['LOGIN_REQUIRED', 'VERIFICATION_REQUIRED'].includes(error.code)) {
        circuitUntil = now() + 60000; circuitCode = error.code;
      }
      throw error;
    }).finally(() => pending.delete(registration));
    pending.set(registration, promise);
    tail = promise.catch(() => {});
    return promise;
  };
}

