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
  for (const asset of assets) {
    assert.ok(fs.existsSync(asset), `source asset is missing: ${asset}`);
    assert.match(copier, new RegExp(`['"]${asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
});

