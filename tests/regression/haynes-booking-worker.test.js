import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { parseHTML } from 'linkedom';
import { vehicleResult, HaynesError } from '../../lib/haynes-vehicle.js';
import { createLookupService } from '../../workers/haynes/service.mjs';
import { createHandler } from '../../workers/haynes/http.mjs';
import { readVehicle } from '../../workers/haynes/dom.mjs';
import proxy from '../../lib/haynes-proxy.js';
import availability from '../../api/availability.js';

const raw = { registration: 'FX69XWU', make: 'NISSAN', model: 'Qashqai (J11)', variant: '1.7 dCi', engineCode: 'R9N-401', modelYears: '2018 - 2020', typeId: 't_619016977', imageUrl: 'https://www.haynespro-assets.com/workshop/images/319004648.svgz' };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('vehicle reader tolerates the empty document during result navigation', () => {
  const result = vm.runInNewContext('(' + readVehicle.toString() + ')()', { document: { body: null } });
  assert.equal(result.registration, '');
  assert.equal(result.login, false);
  assert.equal(result.ambiguous, false);
});

test('vehicle extraction uses registration, model breadcrumbs and representative image', () => {
  const { document } = parseHTML(`<html><body><a href="https://www.workshopdata.com/touch/site/layout/makesOverview?makeId=m_500">NISSAN</a><a href="https://www.workshopdata.com/touch/site/layout/modelOverview?modelId=d_1">Qashqai (J11)</a><a href="https://www.workshopdata.com/touch/site/layout/modelTypes?modelId=d_1">1.7 dCi (R9N-401) 2018 - 2020</a><div>Vehicle Registration Number: FX69XWU\nVIN: example\nRegistration Date: 30/09/2019</div><img src="${raw.imageUrl}"></body></html>`);
  Object.defineProperty(document, 'images', { value: document.querySelectorAll('img') });
  const result = vm.runInNewContext('(' + readVehicle.toString() + ')()', { document, location: new URL('https://www.workshopdata.com/touch/site/layout/modelDetail?typeId=t_619016977'), URL });
  assert.equal(result.engineCode, 'R9N-401'); assert.equal(result.variant, '1.7 dCi');
  assert.equal(result.model, raw.model); assert.equal(result.registration, raw.registration);
  assert.equal(vehicleResult(result, raw.registration).imageUrl, raw.imageUrl);
});

test('wrong registrations and ambiguous matches fail closed; VIN and arbitrary images never leave worker', () => {
  assert.throws(() => vehicleResult(raw, 'AB12CDE'), { code: 'MISMATCH' });
  assert.throws(() => vehicleResult({ ...raw, ambiguous: true }, raw.registration), { code: 'AMBIGUOUS' });
  const data = vehicleResult({ ...raw, vin: 'secret', cookie: 'secret', imageUrl: 'https://evil.example/a.svg' }, raw.registration);
  assert.equal(data.imageUrl, ''); assert.equal(data.vin, undefined); assert.equal(data.cookie, undefined);
});

test('queue serialises supplier access, deduplicates repeat registration, expires cache and limits size', async () => {
  let calls = [], now = 0; const gate = deferred();
  const service = createLookupService(async registration => { calls.push(registration); if (calls.length === 1) await gate.promise; return { ...raw, registration }; }, { now: () => now, ttl: 50 });
  const a = service('FX69 XWU'), b = service('FX69XWU'), c = service('AB12CDE');
  await Promise.resolve(); assert.deepEqual(calls, ['FX69XWU']);
  gate.resolve(); await Promise.all([a, b, c]); assert.deepEqual(calls, ['FX69XWU', 'AB12CDE']);
  assert.equal((await service('FX69XWU')).cached, true);
  now = 60; assert.equal((await service('FX69XWU')).cached, false);
});

test('bounded queue and daily supplier quota reject excess work', async () => {
  const gate = deferred();
  const service = createLookupService(async registration => { await gate.promise; return { ...raw, registration }; }, { maxQueue: 1, dailyLimit: 1 });
  const first = service(raw.registration);
  await assert.rejects(service('AB12CDE'), { code: 'BUSY' });
  gate.resolve(); await first;
  await assert.rejects(service('AB12CDE'), { code: 'DAILY_LIMIT' });
});

test('expired login opens circuit and does not make repeat supplier requests', async () => {
  let calls = 0;
  const service = createLookupService(async () => { calls++; throw new HaynesError('LOGIN_REQUIRED'); });
  await assert.rejects(service(raw.registration), { code: 'LOGIN_REQUIRED' });
  await assert.rejects(service('AB12CDE'), { code: 'LOGIN_REQUIRED' });
  assert.equal(calls, 1);
});

test('worker HTTP requires authentication and returns only validated vehicle results', async () => {
  const token = 't'.repeat(32);
  const server = http.createServer(createHandler(createLookupService(async () => ({ ...raw, vin: 'hidden' })), token));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/lookup';
    assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 401);
    const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: JSON.stringify({ registration: raw.registration }) });
    const data = await response.json(); assert.equal(data.status, 'MATCHED'); assert.equal(data.vehicle.vin, undefined);
    const invalid = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token }, body: '{}' });
    assert.equal(invalid.status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

async function callProxy(reg) {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await proxy({ method: 'GET', query: { reg } }, res); return res;
}
test('Haynes route reuses availability without changing ordinary requests', async () => {
  const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites.find(r => r.source === '/api/haynes-vehicle'), { source: '/api/haynes-vehicle', destination: '/api/availability?haynes=1' });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await availability({ method: 'GET', query: {} }, res);
  assert.equal(res.code, 405); assert.deepEqual(res.body, { error: 'Method not allowed' });
});
test('Vercel proxy stays disabled in production and never exposes worker token or raw errors', async () => {
  const saved = { env: process.env.VERCEL_ENV, url: process.env.HAYNES_WORKER_URL, token: process.env.HAYNES_WORKER_TOKEN, fetch: global.fetch };
  try {
    process.env.VERCEL_ENV = 'production'; assert.equal((await callProxy(raw.registration)).code, 404);
    process.env.VERCEL_ENV = 'preview'; delete process.env.HAYNES_WORKER_TOKEN; assert.equal((await callProxy(raw.registration)).body.status, 'NOT_CONFIGURED');
    process.env.HAYNES_WORKER_TOKEN = 'x'.repeat(32); process.env.HAYNES_WORKER_URL = 'https://worker.example';
    let sent;
    global.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, json: async () => ({ status: 'MATCHED', vehicle: { ...raw, token: 'secret', vin: 'hidden' } }) }; };
    const response = await callProxy(raw.registration);
    assert.equal(response.body.status, 'MATCHED'); assert.equal(response.body.vehicle.token, undefined);
    assert.deepEqual(sent, { registration: raw.registration });
    global.fetch = async () => { throw Error('secret upstream failure'); };
    assert.deepEqual((await callProxy(raw.registration)).body, { status: 'UNAVAILABLE' });
  } finally {
    for (const [key, value] of [['VERCEL_ENV', saved.env], ['HAYNES_WORKER_URL', saved.url], ['HAYNES_WORKER_TOKEN', saved.token]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    global.fetch = saved.fetch;
  }
});

const client = fs.readFileSync(new URL('../../public/js/vecta-haynes-booking.js', import.meta.url), 'utf8');
for (const failure of ['offline', 'unknown', 'ambiguous']) {
  test(`Test form preserves DVSA details and advisories when Haynes is ${failure}`, async () => {
    const html = fs.readFileSync(new URL('../../public/haynes-booking-test.html', import.meta.url), 'utf8');
    const { document } = parseHTML(html);
    const root = { document, URL, URLSearchParams, location: { search: '' }, AbortController, console, setTimeout, clearTimeout, alert() {} };
    root.window = root;
    root.fetch = async url => {
      if (String(url).includes('/api/haynes-vehicle')) {
        if (failure === 'offline') throw Error('connection unavailable');
        return { ok: true, json: async () => ({ status: failure === 'ambiguous' ? 'AMBIGUOUS' : 'UNAVAILABLE' }) };
      }
      return { ok: true, json: async () => String(url).includes('/api/vehicle-lookup') ? { vehicle: 'NISSAN QASHQAI', make: 'NISSAN', advisories: ['Tyre worn'], latestMileage: 42000, motExpiryDate: '2027-09-30', engineCapacity: 1749 } : {} };
    };
    vm.createContext(root); vm.runInContext(client, root);
    for (const source of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean)) vm.runInContext(source, root);
    await new Promise(resolve => setImmediate(resolve));
    await vm.runInContext("state.form.registration='FX69XWU';lookup('FX69XWU')", root);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(vm.runInContext('state.lookup', root), 'success');
    assert.equal(vm.runInContext('state.form.haynes_identity', root), null);
    assert.equal(vm.runInContext('state.form.engine_size', root), 1749);
    assert.match(document.body.textContent, /Tyre worn/);
    assert.match(document.body.textContent, failure === 'ambiguous' ? /More than one vehicle variant/ : /Detailed vehicle information is unavailable/);
    assert.equal(document.querySelector('[data-haynes-confirm]'), null);
    vm.runInContext("state.form.inspect_mot_advisories='yes';render()", root);
    const next = document.querySelector('#next');
    assert.equal(next.hasAttribute('disabled'), false);
    await next.onclick();
    assert.equal(vm.runInContext('state.step', root), 2);
  });
}
function controller(fetcher, registration = raw.registration, expectedMake = 'NISSAN') {
  const root = { AbortController, setTimeout, clearTimeout, fetch: fetcher }; vm.runInNewContext(client, root);
  let latest, currentReg = registration;
  const control = root.VectaHaynesBooking.createController({ getRegistration: () => currentReg, getMake: () => expectedMake, onChange: value => { latest = value; }, fetcher });
  return { control, latest: () => latest, setReg: value => { currentReg = value; } };
}
test('late Haynes responses cannot populate a different registration', async () => {
  const gate = deferred(); const c = controller(async () => { await gate.promise; return { ok: true, json: async () => ({ status: 'MATCHED', vehicle: raw }) }; });
  const pending = c.control.lookup(raw.registration); c.setReg('AB12CDE'); c.control.reset(); gate.resolve(); await pending;
  assert.equal(c.latest().status, 'idle'); assert.equal(c.latest().vehicle, null);
});
test('client rejects conflicting make and missing match; failure does not block booking', async () => {
  const c = controller(async () => ({ ok: true, json: async () => ({ status: 'MATCHED', vehicle: raw }) }), raw.registration, 'FORD');
  await c.control.lookup(raw.registration); assert.equal(c.latest().status, 'unavailable');
  const d = controller(async () => { throw Error('timeout'); }); await d.control.lookup(raw.registration); assert.equal(d.latest().status, 'unavailable');
});

test('Test page shows Haynes without modifying advisories or allowing booking writes', async () => {
  const html = fs.readFileSync(new URL('../../public/haynes-booking-test.html', import.meta.url), 'utf8');
  const { document } = parseHTML(html);
  const root = { document, URL, URLSearchParams, location: { search: '' }, AbortController, console, setTimeout, clearTimeout, alert() {} };
  root.window = root; root.fetch = async url => ({ ok: true, json: async () => String(url).includes('/api/haynes-vehicle') ? { status: 'MATCHED', vehicle: vehicleResult(raw, raw.registration) } : String(url).includes('/api/vehicle-lookup') ? { vehicle: 'NISSAN QASHQAI', make: 'NISSAN', advisories: ['Tyre worn'], latestMileage: 42000, motExpiryDate: '2027-09-30', engineCapacity: 1749 } : {} });
  vm.createContext(root); vm.runInContext(client, root);
  for (const source of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(Boolean)) vm.runInContext(source, root);
  await new Promise(resolve => setImmediate(resolve));
  await vm.runInContext("state.form.registration='FX69XWU';lookup('FX69XWU')", root);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(document.body.textContent, /R9N-401/); assert.match(document.body.textContent, /Tyre worn/);
  assert.equal(vm.runInContext('state.form.engine_size', root), 1749);
  const yes = document.querySelector('[data-haynes-confirm="yes"]'); yes.onclick();
  assert.equal(vm.runInContext('state.form.haynes_identity.engineCode', root), 'R9N-401');
  assert.equal(vm.runInContext('serviceEngineSize()', root), 1700);
  assert.equal(vm.runInContext('serviceGuidePrices(serviceEngineSize()).full', root), 165);
  vm.runInContext("haynesState.vehicle.variant='1.6 DiG-T 190';state.form.engine_size=1618;state.form.job_types=['Service'];state.form.service_choice='Full Service'", root);
  assert.equal(vm.runInContext('estimateCost()', root), 155);
  vm.runInContext("haynesState.status='unavailable';state.form.engine_size_manual=''", root);
  assert.equal(vm.runInContext('serviceGuidePrices(serviceEngineSize())', root), null);
  vm.runInContext("state.form.engine_size_manual=2000", root);
  assert.equal(vm.runInContext('estimateCost()', root), 165);
  vm.runInContext("haynesState.status='confirmed';state.form.engine_size_manual=''", root);

  assert.deepEqual(Array.from(vm.runInContext('state.form.mot_advisories', root)), ['Tyre worn']);
  for (let step = 1; step <= 5; step++) {
    vm.runInContext(`state.step=${step};render()`, root);
    assert.equal(document.querySelectorAll('.vehicle-photo[data-haynes-slot]').length, 1);
    assert.match(document.querySelector('.vehicle-photo').textContent, /R9N-401/);
    assert.doesNotMatch(document.querySelector('.vehicle-photo').textContent, /Vehicle details confirmed|Representative model image/);
    if(step>1)assert.match(document.querySelector('.vehicle-summary .advisories').textContent, /Tyre worn/);
  }

  assert.doesNotMatch(html, /fetch\('\/api\/website-booking/);
  assert.match(html, /send.disabled=true/);
});
