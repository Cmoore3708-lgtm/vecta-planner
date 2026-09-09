import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './helpers.js';

const html = source();
const worker = source('public/service-worker.js');

test('an app update cannot reload over queued or in-progress work', () => {
  assert.match(html, /vectaPendingSync\(\)\.length\|\|vectaSyncInFlight\|\|plannerInteractionBusy/);
  assert.match(html, /vectaCreateDailyBackup\(true,'before-app-update'\)/);
});

test('offline mode retains a last-known workshop shell and data fallback', () => {
  assert.match(worker, /caches\.match\('\/index\.html'\)/);
  assert.match(worker, /fetchSupabaseWithLastKnownFallback/);
  assert.match(html, /vectaRestoreLatestBackupIfNeeded\(\)/);
});

test('background push still sets badge and displays a notification', () => {
  assert.match(worker, /addEventListener\('push'/);
  assert.match(worker, /setAppBadge/);
  assert.match(worker, /showNotification/);
});

test('notification clicks focus or open the website-booking screen', () => {
  assert.match(worker, /addEventListener\('notificationclick'/);
  assert.match(worker, /client\.navigate\(target\)/);
  assert.match(worker, /clients\.openWindow/);
  assert.match(worker, /view=websiteRequests/);
});
