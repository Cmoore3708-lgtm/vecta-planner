import assert from 'node:assert/strict';
import test from 'node:test';
import middleware, { config } from '../../website/middleware.js';

const commit = 'a'.repeat(40);
const origin = 'https://vecta-planner-git-amendment-nmuk-launch-readiness-vectaplanner.vercel.app';
const request = (path, method = 'GET') => new Request('https://standalone.example' + path, { method });

test('standalone booking previews can only reach the workshop preview for the same commit', async t => {
  const env = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Unexpected network request'); });
  const old = Object.fromEntries(['VERCEL_ENV', 'VERCEL_BRANCH_URL', 'VERCEL_GIT_COMMIT_SHA'].map(key => [key, env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });
  Object.assign(env, {
    VERCEL_ENV: 'preview',
    VERCEL_BRANCH_URL: 'vecta-website-git-amendment-nmuk-launch-readiness-vectaplanner.vercel.app',
    VERCEL_GIT_COMMIT_SHA: commit
  });
  assert.ok(config.matcher.includes('/api/:path*'));
  for (const path of ['/api/website-booking', '/api/service-price', '/api/availability', '/api/customer-history', '/api/job-progress']) {
    assert.equal((await middleware(request(path, 'POST'))).status, 503);
  }
  assert.equal((await middleware(request('/api/availability?tyrePhoto=1&action=release'))).status, 503);
  assert.equal((await middleware(request('/api/availability?action=release'))).headers.get('x-middleware-next'), '1');
  assert.equal((await middleware(request('/booking', 'POST'))).status, 503);
  assert.equal((await middleware(request('/booking'))).status, 503);

  const release = { application: 'workshop', environment: 'preview', commit };
  globalThis.fetch.mock.mockImplementation(async (url, options) => {
    assert.equal(url, origin + '/api/supabase-config?action=release');
    assert.equal(options.redirect, 'error');
    return Response.json(release);
  });
  for (const path of ['/booking', '/booking/', '/booking/index.html', '/booking.html']) {
    const result = await middleware(request(path + '?reg=ZZ26SQA'));
    assert.equal(result.status, 307);
    assert.equal(result.headers.get('Location'), origin + '/booking.html?reg=ZZ26SQA');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
  release.environment = 'production';
  assert.equal((await middleware(request('/booking'))).status, 503);
  release.environment = 'preview';
  release.commit = 'b'.repeat(40);
  assert.equal((await middleware(request('/booking'))).status, 503);
  env.VERCEL_BRANCH_URL = 'evil.example';
  assert.equal((await middleware(request('/booking'))).status, 503);
  env.VERCEL_ENV = 'production';
  for (const [path, method] of [['/booking', 'GET'], ['/api/website-booking', 'POST']]) {
    assert.equal((await middleware(request(path, method))).headers.get('x-middleware-next'), '1');
  }
});
