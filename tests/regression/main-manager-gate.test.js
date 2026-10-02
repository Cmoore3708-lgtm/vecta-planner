import test from 'node:test';
import assert from 'node:assert/strict';
import { managerGate, requiresManagerLogin } from '../../middleware.js';

const credentials = { user: 'Manager', password: 'a-long-secret:with-characters' };
function request(path, authorization) {
  return new Request('https://vecta-planner.vercel.app' + path, {
    headers: authorization ? { authorization } : {}
  });
}

test('Main and unknown routes require a manager sign-in', () => {
  for (const path of ['/', '/index.html', '/finance', '/index.html?from=phone']) {
    assert.equal(requiresManagerLogin(new URL(request(path).url).pathname), true, path);
    const response = managerGate(request(path), credentials);
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get('www-authenticate'), /Basic realm="VECTA Main"/);
  }
});

test('public booking, approval and shared assets remain reachable', () => {
  for (const path of ['/booking', '/booking/', '/booking.html', '/approval.html', '/api/website-booking', '/api/fleet-nightly-refresh', '/assets/vecta-header.png', '/icons/vecta-192.png', '/js/vecta-planner-rules.js', '/service-worker.js', '/manifest.webmanifest', '/supabase.min.js']) {
    assert.equal(managerGate(request(path), credentials), null, path);
  }
});

test('correct manager credentials allow Main; wrong credentials and missing configuration fail closed', () => {
  const valid = 'Basic ' + Buffer.from(credentials.user + ':' + credentials.password).toString('base64');
  assert.equal(managerGate(request('/', valid), credentials), null);
  assert.equal(managerGate(request('/', 'Basic ' + Buffer.from('Manager:wrong').toString('base64')), credentials).status, 401);
  assert.equal(managerGate(request('/', 'Bearer token'), credentials).status, 401);
  assert.equal(managerGate(request('/', valid), { user: '', password: '' }).status, 503);
});

test('Test planner uses preview access while production and unknown routes stay protected', () => {
  const original = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'preview';
    for (const path of ['/', '/index.html', '/admin.html', '/site-preview.html', '/booking-preview.html']) {
      assert.equal(managerGate(request(path), { user: '', password: '' }), null, path);
    }
    assert.equal(managerGate(request('/finance'), credentials).status, 401);
    process.env.VERCEL_ENV = 'production';
    for (const path of ['/', '/index.html', '/admin.html']) {
      assert.equal(managerGate(request(path), credentials).status, 401, path);
      assert.equal(managerGate(request(path), { user: '', password: '' }).status, 503, path);
    }
  } finally {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  }
});
