import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('service save and print helpers are executable scripts, never page text', () => {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /^\s*<!doctype html>/i);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
  const source = scripts.join('\n');
  assert.match(source, /async function saveServiceSheetAndClose\(/);
  assert.match(source, /async function printWhenImagesReady\(\)\s*\{\s*var root=document\.getElementById\('printSheet'\);\s*if\(root&&window\.prepareHaynesServicePrint\)/);
  for (const script of scripts) new vm.Script(script);
});
