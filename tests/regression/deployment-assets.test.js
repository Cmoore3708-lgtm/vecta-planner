import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const copier = fs.readFileSync('scripts/copy-static-assets.mjs', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

test('production build copies every canonical same-origin script and stylesheet', () => {
  const assetPattern = /(?:src|href)=["'](\/(?:js\/[^"']+\.js|app\.css))["']/g;
  const assets = [...html.matchAll(assetPattern)].map(match => match[1].slice(1));
  assert.ok(assets.includes('app.css'));
  assert.match(packageJson.scripts.build, /copy-static-assets\.mjs/);
  assert.doesNotMatch(packageJson.scripts.build, /vite build/);
  for (const asset of assets) {
    assert.ok(fs.existsSync(asset), `source asset is missing: ${asset}`);
    assert.match(copier, new RegExp(`['"]${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
});

test('static build retains every public entry page without stale output', () => {
  assert.match(copier, /fs\.rmSync\('dist'/);
  assert.match(copier, /'index\.html'/);
  assert.match(copier, /'approval\.html'/);
  assert.match(copier, /'booking\.html'/);
});

test('the deployable page shell stays small and the main program is external', () => {
  assert.ok(Buffer.byteLength(html) < 200_000, 'index.html must stay below 200 KB');
  assert.match(html, /<script src="\/js\/vecta-app\.js"><\/script>/);
  assert.ok(fs.statSync('js/vecta-app.js').size > 100_000);
  assert.doesNotMatch(html, /data:image\/webp;base64,/);
  assert.ok(fs.existsSync('assets/vecta-logo.webp'));
});

test('service worker caches the modular application assets', () => {
  const worker = fs.readFileSync('service-worker.js', 'utf8');
  assert.match(worker, /'\/js\/vecta-app\.js'/);
  assert.match(worker, /'\/assets\/vecta-logo\.webp'/);
  assert.match(worker, /v344-modular-source/);
});
