import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseEnvironment } from '../../api/_database-environment.js';

const KEYS = [
  'VERCEL_ENV',
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VECTA_TEST_SUPABASE_URL',
  'VECTA_TEST_SUPABASE_PUBLISHABLE_KEY',
  'VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY'
];

function withEnvironment(values, run) {
  const before = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try { return run(); }
  finally {
    for (const key of KEYS) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test('preview uses the restricted test project but never inherits production service access', () => {
  withEnvironment({
    VERCEL_ENV: 'preview',
    SUPABASE_URL: 'https://jywufozycuwuoshlulwl.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'production-secret'
  }, () => {
    const publicConfig = databaseEnvironment();
    assert.equal(publicConfig.url, 'https://rmbmbpqwvghxuyeykjhh.supabase.co');
    assert.equal(publicConfig.preview, true);
    assert.throws(() => databaseEnvironment({ requireService: true }), /service access is not configured/);
  });
});

test('preview rejects the production project even if entered as a test variable', () => {
  withEnvironment({
    VERCEL_ENV: 'preview',
    VECTA_TEST_SUPABASE_URL: 'https://jywufozycuwuoshlulwl.supabase.co',
    VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY: 'wrong-secret'
  }, () => assert.throws(() => databaseEnvironment({ requireService: true }), /cannot use the production database/));
});

test('preview uses only its isolated test database credentials', () => {
  withEnvironment({
    VERCEL_ENV: 'preview',
    SUPABASE_URL: 'https://jywufozycuwuoshlulwl.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'production-secret',
    VECTA_TEST_SUPABASE_URL: 'https://rmbmbpqwvghxuyeykjhh.supabase.co',
    VECTA_TEST_SUPABASE_PUBLISHABLE_KEY: 'test-public',
    VECTA_TEST_SUPABASE_SERVICE_ROLE_KEY: 'test-secret'
  }, () => {
    const config = databaseEnvironment({ requireService: true });
    assert.equal(config.url, 'https://rmbmbpqwvghxuyeykjhh.supabase.co');
    assert.equal(config.key, 'test-secret');
    assert.equal(config.preview, true);
  });
});

test('production continues to use the existing production variables', () => {
  withEnvironment({
    VERCEL_ENV: 'production',
    SUPABASE_URL: 'https://jywufozycuwuoshlulwl.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'production-public',
    SUPABASE_SERVICE_ROLE_KEY: 'production-secret'
  }, () => {
    const config = databaseEnvironment({ requireService: true });
    assert.equal(config.url, 'https://jywufozycuwuoshlulwl.supabase.co');
    assert.equal(config.key, 'production-secret');
    assert.equal(config.preview, false);
  });
});
