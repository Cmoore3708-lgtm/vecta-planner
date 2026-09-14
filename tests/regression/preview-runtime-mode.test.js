import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/supabase-config.js';

const ENV_KEYS = [
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'VECTA_TEST_SUPABASE_URL',
  'VECTA_TEST_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY'
];

function callHandler(env) {
  const before = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  let statusCode = 0;
  let body;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { body = value; return this; }
  };
  try {
    handler({}, res);
    return { statusCode, body };
  } finally {
    for (const key of ENV_KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('the V355 audit branch is local-only even if a test database exists', () => {
  const result = callHandler({
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'audit/system-simplification-v355',
    VECTA_TEST_SUPABASE_URL: 'https://example.supabase.co',
    VECTA_TEST_SUPABASE_PUBLISHABLE_KEY: 'test-key'
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { auditPreview: true });
});

test('a preview with no isolated database falls back to local-only mode', () => {
  const result = callHandler({ VERCEL_ENV: 'preview' });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, { auditPreview: true });
});

test('a configured non-audit preview receives only its isolated database config', () => {
  const result = callHandler({
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'feature/ordinary-preview',
    VECTA_TEST_SUPABASE_URL: 'https://example.supabase.co',
    VECTA_TEST_SUPABASE_PUBLISHABLE_KEY: 'test-key'
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body, {
    supabaseUrl: 'https://example.supabase.co',
    supabasePublishableKey: 'test-key'
  });
});

test('production still fails closed when its database config is absent', () => {
  const result = callHandler({ VERCEL_ENV: 'production' });
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /not configured/i);
});
