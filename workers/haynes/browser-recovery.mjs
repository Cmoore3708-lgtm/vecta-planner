import { HaynesError } from '../../lib/haynes-vehicle.js';

function unavailable(reason = 'BROWSER_ERROR') {
  const error = new HaynesError('UNAVAILABLE');
  error.reason = reason;
  error.stage = 'BROWSER';
  return error;
}
async function bounded(promise, timeoutMs, reason) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(unavailable(reason)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// A stalled request owns only its own pages. Restart the shared browser only
// after other requests finish; never replay a lookup or clear its login profile.
export function createBrowserRecovery(open, { failureLimit = 3, cleanupMs = 2000, openMs = 20000, onRecovery = () => {} } = {}) {
  let context = null, opening = null, restart = false, failures = 0, stopped = false;
  let active = 0;
  const drained = new Set();
  async function ready() {
    if (stopped) throw unavailable();
    if (restart && active) await new Promise(resolve => drained.add(resolve));
    if (stopped) throw unavailable();
    if (opening) return opening;
    if (context && !restart) return context;
    opening = (async () => {
      if (context) {
        await bounded(context.close(), cleanupMs, 'BROWSER_ERROR');
        context = null;
        onRecovery();
      }
      const launch = Promise.resolve().then(open);
      // A browser that opens after the timeout must not retain the profile lock.
      let expired = false;
      launch.then(c => { if (expired || stopped) c.close().catch(() => {}); }, () => {});
      try { context = await bounded(launch, openMs, 'TIMEOUT'); }
      catch (error) { expired = true; throw error; }
      const opened = context;
      context.on?.('close', () => { if(context === opened) restart = true; });
      restart = false; failures = 0;
      return context;
    })().finally(() => { opening = null; });
    return opening;
  }
  return {
    async run(factory, input, timeoutMs) {
      const started = Date.now();
      const current = await bounded(ready(), timeoutMs, 'TIMEOUT'), pages = new Set();
      let ended = false;
      active++;
      const scope = {
        async newPage() {
          const page = await current.newPage();
          pages.add(page);
          if (ended) { page.close().catch(() => {}); throw unavailable(); }
          return page;
        }
      };
      try {
        const result = await bounded(Promise.resolve().then(() => factory(scope)(input)), Math.max(1, timeoutMs - (Date.now() - started)), 'TIMEOUT');
        failures = 0;
        return result;
      } catch (caught) {
        const error = caught instanceof HaynesError ? caught : unavailable(caught.name === 'TimeoutError' ? 'TIMEOUT' : 'BROWSER_ERROR');
        if (/page, context or browser has been closed|target closed/i.test(caught.message || '')) error.browserDetail = 'PAGE_CLOSED';
        if (error.reason === 'TIMEOUT' || error.reason === 'BROWSER_ERROR' || error.name === 'TimeoutError') {
          if (++failures >= failureLimit || error.browserDetail === 'PAGE_CLOSED') restart = true;
        }
        throw error;
      } finally {
        ended = true;
        const cleanup = await bounded(Promise.allSettled([...pages].map(page => Promise.resolve().then(() => page.close()))), cleanupMs, 'BROWSER_ERROR').catch(() => null);
        if(!cleanup || cleanup.some(result => result.status === 'rejected')) restart = true;
        active--;
        if (!active) { for (const resolve of drained) resolve(); drained.clear(); }
      }
    },
    async close() {
      stopped = true;
      for (const resolve of drained) resolve();
      drained.clear();
      if (context) await bounded(context.close(), cleanupMs, 'BROWSER_ERROR').catch(() => {});
    }
  };
}
