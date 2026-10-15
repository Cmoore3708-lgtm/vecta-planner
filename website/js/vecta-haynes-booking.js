(function(root){
  const reg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const make = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
  function createController({ getRegistration, getMake, onChange, fetcher = root.fetch.bind(root) }) {
    let generation = 0, abort = null, warm = null;
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
      try {
        const early = warm?.registration === requested && Date.now() - warm.at < 30000 ? await warm.promise : null;
        const response = early || await fetcher('/api/haynes-vehicle?reg=' + encodeURIComponent(requested), { signal: requestAbort.signal, cache: 'no-store' });
        const data = early ? early.data : await response.json();
        if (current !== generation || requested !== reg(getRegistration())) return;
        const vehicle = data.vehicle;
        if (response.ok && data.status === 'MATCHED' && reg(vehicle?.registration) === requested && make(vehicle?.make) === make(getMake()) && vehicle?.variant && vehicle?.model) {
          onChange({ status: 'matched', vehicle: { ...vehicle, imageUrl: safeImage(vehicle.imageUrl) } });
        } else onChange({ status: data.status === 'AMBIGUOUS' ? 'ambiguous' : 'unavailable', vehicle: null, reason: ['OFFLINE','NOT_PAIRED','BUSY','LOGIN_REQUIRED','VERIFICATION_REQUIRED','DAILY_LIMIT'].includes(data.status) ? data.status : 'UNAVAILABLE' });
      } catch {
        if (current === generation && requested === reg(getRegistration())) onChange({ status: 'unavailable', vehicle: null, reason: requestAbort.signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE' });
      } finally { clearTimeout(timer); }
    }
    return { reset, lookup, prefetch };
  }
  root.VectaHaynesBooking = { createController, safeImage, unavailableMessage };
})(typeof window === 'undefined' ? globalThis : window);

