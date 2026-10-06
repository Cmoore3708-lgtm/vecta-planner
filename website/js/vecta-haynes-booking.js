(function(root){
  const reg = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const make = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const safeImage = value => /^https:\/\/www\.haynespro-assets\.com\/workshop\/images\/\d+\.(svgz?|png|jpe?g|webp)$/.test(value || '') ? value : '';
  function createController({ getRegistration, getMake, onChange, fetcher = root.fetch.bind(root) }) {
    let generation = 0, abort = null;
    function reset() { generation++; abort?.abort(); abort = null; onChange({ status: 'idle', vehicle: null }); }
    async function lookup(registration) {
      reset();
      const current = generation, requested = reg(registration);
      if (requested !== reg(getRegistration())) return;
      const requestAbort = new AbortController(); abort = requestAbort;
      const timer = setTimeout(() => requestAbort.abort(), 30000);
      onChange({ status: 'loading', vehicle: null });
      try {
        const response = await fetcher('/api/haynes-vehicle?reg=' + encodeURIComponent(requested), { signal: requestAbort.signal, cache: 'no-store' });
        const data = await response.json();
        if (current !== generation || requested !== reg(getRegistration())) return;
        const vehicle = data.vehicle;
        if (response.ok && data.status === 'MATCHED' && reg(vehicle?.registration) === requested && make(vehicle?.make) === make(getMake()) && vehicle?.variant && vehicle?.model) {
          onChange({ status: 'matched', vehicle: { ...vehicle, imageUrl: safeImage(vehicle.imageUrl) } });
        } else onChange({ status: data.status === 'AMBIGUOUS' ? 'ambiguous' : 'unavailable', vehicle: null });
      } catch {
        if (current === generation && requested === reg(getRegistration())) onChange({ status: 'unavailable', vehicle: null });
      } finally { clearTimeout(timer); }
    }
    return { reset, lookup };
  }
  root.VectaHaynesBooking = { createController, safeImage };
})(typeof window === 'undefined' ? globalThis : window);
