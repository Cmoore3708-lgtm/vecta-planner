import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../../api/supabase-config.js';

const ENV_KEYS = [
  'VERCEL_ENV',
  'VERCEL_GIT_COMMIT_REF',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_PROJECT_NAME',
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

test('a non-audit preview with missing environment variables still uses only the isolated Test database', () => {
  const result = callHandler({ VERCEL_ENV: 'preview' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.supabaseUrl, 'https://brqsejjykrubxuofavuu.supabase.co');
  assert.match(result.body.supabasePublishableKey, /^eyJ/);
  assert.doesNotMatch(result.body.supabaseUrl, /jywufozycuwuoshlulwl/);
});

test('the Fleet repair branch cannot be mistaken for the local-only audit preview', () => {
  const result = callHandler({
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'fix/fleet-false-service-completions'
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.supabaseUrl, 'https://brqsejjykrubxuofavuu.supabase.co');
  assert.equal(result.body.auditPreview, undefined);
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

test('the dedicated Test project uses the isolated database even when Vercel marks it as production', () => {
  const result = callHandler({
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'vecta-workshop-pro-test.vercel.app',
    VERCEL_PROJECT_NAME: 'vecta-workshop-pro-test'
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.supabaseUrl, 'https://brqsejjykrubxuofavuu.supabase.co');
  assert.match(result.body.supabasePublishableKey, /^eyJ/);
  assert.doesNotMatch(result.body.supabaseUrl, /jywufozycuwuoshlulwl/);
});

test('production still fails closed when its database config is absent', () => {
  const result = callHandler({ VERCEL_ENV: 'production' });
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /not configured/i);
});
