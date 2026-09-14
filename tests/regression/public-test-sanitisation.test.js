import test from 'node:test';
import assert from 'node:assert/strict';
import { source } from './helpers.js';

const html = source();
const worker = source('service-worker.js');

test('public test build declares synthetic-only mode', () => {
  assert.match(html, /VECTA_PUBLIC_SYNTHETIC_TEST\s*=\s*true/);
  assert.match(html, /SYNTHETIC TEST DATA · NOT LIVE/);
  assert.match(html, /data:application\/json/);
});

test('public test build contains no embedded production datasets', () => {
  assert.doesNotMatch(html, /window\.INITIAL_FLEET_VEHICLES\s*=\s*\[\s*\{/);
  assert.doesNotMatch(html, /window\.INITIAL_MAINTENANCE_PLANS\s*=\s*\[\s*\{/);
  assert.doesNotMatch(html, /window\.NMUK_2026_JOBS\s*=\s*\[\s*\{/);
  assert.doesNotMatch(html, /window\.CONTRACTOR_2026_JOBS\s*=\s*\[\s*\{/);
});

test('public test build contains no known real customer email domains', () => {
  assert.doesNotMatch(html, /nissan-nmuk\.co\.uk|@nmuk\.co\.uk|e4electricalservices\.co\.uk|@fms\.uk\.net/i);
});

test('public test build contains no known real customer labels or targeted registrations', () => {
  assert.doesNotMatch(html, /(["'])(?:OWBEN|RAMS|TEMPLEMAN|BIDVEST|UNIPRESS|WPC|FMS|JEB|E4 ELECTRICAL|E4)\1/);
  assert.doesNotMatch(html, /\b(?:FG05\s*BZV|HN22\s*UHV|NK72\s*KTD|NK72\s*KTJ|TCS\s*T2)\b/i);
});

test('public test build contains the latest integrity repairs', () => {
  assert.match(html, /VECTA_FINANCIAL_AUDIT_V1|financial integrity/i);
  assert.match(worker, /v346-mobile-sync-unlock/);
  assert.match(
    html,
    /vectaSetStartupLoading\(false\);render\(\);\s*if\(!window\.VECTA_PUBLIC_SYNTHETIC_TEST\)vectaSetStartupLoading\(true/,
    'the synthetic test dashboard must render before its background cloud sync'
  );
  assert.doesNotMatch(html, /fetchAllRows\('invoices'\)/);
  assert.match(html, /vectaFetchAllRemoteRows\('invoices',9000\)/);
  assert.match(html, /function connectSupabase\(\)\{\s*if\(remoteClient\)return true;/);
  assert.doesNotMatch(html, /id=["']v207-fleet-due-sync-repair["']/);
  assert.doesNotMatch(html, /id=["']v212-fleet-safety-service-anchor-rule["']/);
  assert.doesNotMatch(html, /id=["']v213-tax-due-repair["']/);
  assert.doesNotMatch(html, /id=["']v277-mainsec-date-and-nmuk-authority-fix["']/);
  assert.match(html, /vectaRepairCompletionDatesFromLinkedEvidence/);
  assert.match(html, /todayTotal=invoiceFinanceJobs\('today'\)\.reduce/);
  assert.match(html, /var vectaStartupWatchdog=setTimeout/);
  assert.match(html, /req\.onblocked=/);
});

test('public Test sync stays interactive and excludes production-history repair passes', () => {
  assert.match(html, /if\(window\.VECTA_PUBLIC_SYNTHETIC_TEST\)\{\s*await flushPendingSync\(\);\s*await pullRemote\(\{skipDashboardCore:true\}\);\s*render\(\);startCloudSync\(\);updateConnectivityUI\(\);\s*return;/);
  assert.match(html, /if\(window\.VECTA_PUBLIC_SYNTHETIC_TEST\)\{\s*applyTaskStateOverrides\(\);saveLocal\(\);[\s\S]*?return;\s*\}\s*\/\* Every cloud job/);
  assert.match(html, /if\(vectaReconnectBusy\)return false;/);
  assert.equal((html.match(/window\.addEventListener\('online'/g) || []).length, 1, 'only one guarded online synchronisation handler is permitted');
});
