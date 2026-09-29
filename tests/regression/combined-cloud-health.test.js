import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/supabase-config.js';

function response() {
  return {
    code: 0,
    body: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('the merged health endpoint probes Test without disclosing its service key', async () => {
  const originalFetch = globalThis.fetch;
  const originals = Object.fromEntries(['VERCEL_ENV', 'VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
  process.env.VERCEL_ENV = 'preview';
  process.env.VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY = 'mock-service-key';
  let called = false;
  globalThis.fetch = async (url, options) => {
    called = true;
    assert.match(url, /^https:\/\/brqsejjykrubxuofavuu\.supabase\.co\/rest\/v1\/jobs\?/);
    assert.equal(options.headers.apikey, 'mock-service-key');
    return { ok: true, status: 200 };
  };
  try {
    const result = response();
    await handler({ method: 'GET', query: { health: '1' } }, result);
    assert.equal(called, true);
    assert.equal(result.code, 200);
    assert.equal(result.body.ok, true);
    assert.equal(JSON.stringify(result.body).includes('mock-service-key'), false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('the health route rejects other methods before requesting data', async () => {
  const result = response();
  await handler({ method: 'POST', query: { health: '1' } }, result);
  assert.equal(result.code, 405);
});
