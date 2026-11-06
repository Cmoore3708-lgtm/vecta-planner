import assert from 'node:assert/strict';
import test from 'node:test';
import middleware, { config } from '../../website/middleware.js';
import workshopConfig from '../../api/supabase-config.js';

const commit = 'a'.repeat(40);
const origin = 'https://vecta-planner-git-amendment-nmuk-launch-readiness-vectaplanner.vercel.app';
const request = (path, method = 'GET') => new Request('https://standalone.example' + path, { method });

test('standalone booking previews can only reach the workshop preview for the same commit', async t => {
  const env = process.env;
  t.mock.method(globalThis, 'fetch', async () => { throw Error('Unexpected network request'); });
  const old = Object.fromEntries(['VERCEL_ENV', 'VERCEL_BRANCH_URL', 'VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_COMMIT_SHA','VECTA_TEST_SUPABASE_URL'].map(key => [key, env[key]]));
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });
  Object.assign(env, {
    VERCEL_ENV: 'preview',
    VERCEL_BRANCH_URL: 'vecta-website-git-amendment-nmuk-launch-readiness-vectaplanner.vercel.app',
    VERCEL_GIT_COMMIT_SHA: commit,
    VERCEL_GIT_COMMIT_REF: 'amendment/nmuk-launch-readiness',
    VECTA_TEST_SUPABASE_URL: 'https://brqsejjykrubxuofavuu.supabase.co'
  });
  assert.ok(config.matcher.includes('/api/:path*'));
  for (const path of ['/api/website-booking', '/api/service-price', '/api/availability', '/api/customer-history', '/api/job-progress']) {
    assert.equal((await middleware(request(path, 'POST'))).status, 503);
  }
  assert.equal((await middleware(request('/api/availability?tyrePhoto=1&action=release'))).status, 503);
  assert.equal((await middleware(request('/api/availability?action=release'))).headers.get('x-middleware-next'), '1');
  assert.equal((await middleware(request('/booking', 'POST'))).status, 503);
  function openPreview(query) {
    const res={headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},send(){return this},end(){return this}};
    return workshopConfig({method:'GET', query},res);
  }
  for (const path of ['/booking', '/booking/', '/booking/index.html', '/booking.html']) {
    const result = await middleware(request(path + '?reg=ZZ26SQA'));
    assert.equal(result.status, 307);
    const target=new URL(result.headers.get('Location'));
    assert.equal(target.origin,origin);
    assert.equal(target.pathname,'/api/supabase-config');
    const opened=openPreview(Object.fromEntries(target.searchParams));
    assert.equal(opened.code,307);
    assert.equal(opened.headers.Location,'/booking.html?reg=ZZ26SQA');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
  const query={action:'open-website-preview', commit, to:'/booking.html'};
  assert.equal(openPreview({...query, commit:'b'.repeat(40)}).code,409);
  assert.equal(openPreview({...query,to:'//outside.example/booking.html'}).code,400);
  env.VECTA_TEST_SUPABASE_URL='https://jywufozycuwuoshlulwl.supabase.co';
  assert.equal(openPreview(query).code,503);
  delete env.VERCEL_BRANCH_URL;
  assert.equal(new URL((await middleware(request('/booking'))).headers.get('Location')).origin,origin);
  env.VERCEL_BRANCH_URL = 'evil.example';
  assert.equal((await middleware(request('/booking'))).status, 503);
  env.VERCEL_ENV = 'production';
  assert.equal(openPreview(query).code,409);
  for (const [path, method] of [['/booking', 'GET'], ['/api/website-booking', 'POST']]) {
    assert.equal((await middleware(request(path, method))).headers.get('x-middleware-next'), '1');
  }
});
