import fs from 'node:fs';
import path from 'node:path';

const [sourceArgument, outputArgument] = process.argv.slice(2);
const sourcePath = sourceArgument || process.env.VECTA_LATEST_SOURCE;
const outputPath = outputArgument || 'index.html';
if (!sourcePath || !outputPath) {
  throw new Error('Set VECTA_LATEST_SOURCE or pass <latest-live-index.html> [test-index.html]');
}

let html = fs.readFileSync(sourcePath, 'utf8');
const original = html;

function assignmentEnd(text, start) {
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (ch === ';') return i + 1;
  }
  throw new Error(`Could not find assignment terminator at ${start}`);
}

function removeDataAssignment(marker, replacement) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Required production-data assignment was not found: ${marker}`);
  const end = assignmentEnd(html, start);
  html = html.slice(0, start) + replacement + html.slice(end);
}

// These are data payloads, not application logic. The test database supplies
// comprehensive fictional records after the application connects.
removeDataAssignment('window.INITIAL_FLEET_VEHICLES =', 'window.INITIAL_FLEET_VEHICLES = [];');
removeDataAssignment('window.INITIAL_MAINTENANCE_PLANS =', 'window.INITIAL_MAINTENANCE_PLANS = [];');
removeDataAssignment('window.CONTRACTOR_2026_JOBS=', 'window.CONTRACTOR_2026_JOBS=[];');
removeDataAssignment('window.CONTRACTOR_2026_NEW_VEHICLES=', 'window.CONTRACTOR_2026_NEW_VEHICLES=[];');
removeDataAssignment('window.CONTRACTOR_FINANCIAL_HISTORY=', 'window.CONTRACTOR_FINANCIAL_HISTORY={};');
removeDataAssignment('window.NMUK_FINANCIAL_HISTORY=', 'window.NMUK_FINANCIAL_HISTORY={};');
removeDataAssignment('window.NMUK_2026_JOBS=', 'window.NMUK_2026_JOBS=[];');
removeDataAssignment('var HISTORICAL_COMPLETION_SEED=', 'var HISTORICAL_COMPLETION_SEED=[];');

// Targeted production migrations remain useful regression scenarios, but use
// fictional identifiers in the public test build.
const literalReplacements = new Map([
  ['KX18 EYC', 'TST26 EYC'],
  ['KX18EYC', 'TST26EYC'],
  ['MAIN SEC', 'TST MAIN'],
  ['MAINSEC', 'TSTMAIN'],
  ['AXLE 1', 'TST AXLE'],
  ['AXLE1', 'TSTAXLE'],
  ['NK16 CYO', 'TST26 TAX'],
  ['NK16CYO', 'TST26TAX'],
  ['NK72 KTF', 'TST26 KTF'],
  ['NK72KTF', 'TST26KTF'],
  ['NK72 KTD', 'TST26 KTD'],
  ['NK72KTD', 'TST26KTD'],
  ['NK72 KTJ', 'TST26 KTJ'],
  ['NK72KTJ', 'TST26KTJ'],
  ['FG05 BZV', 'TST26 BZV'],
  ['FG05BZV', 'TST26BZV'],
  ['HN22 UHV', 'TST26 UHV'],
  ['HN22UHV', 'TST26UHV'],
  ['TCS T2', 'TST UNIT2'],
  ['TCST2', 'TSTUNIT2']
]);
for (const [from, to] of literalReplacements) html = html.split(from).join(to);

const customerLabels = new Map([
  ['OWBEN', 'NORTHSTAR TEST'],
  ['RAMS', 'RIVER TEST'],
  ['TEMPLEMAN', 'TEMPLE TEST'],
  ['BIDVEST', 'BEACON LOGISTICS TEST'],
  ['UNIPRESS', 'UNITY TEST'],
  ['WPC', 'WESTPORT TEST'],
  ['FMS', 'FACILITIES TEST'],
  ['JEB', 'JUNCTION TEST'],
  ['E4 ELECTRICAL', 'BEACON TEST'],
  ['E4', 'BEACON TEST']
]);
for (const [from, to] of customerLabels) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`(["'])${escaped}\\1`, 'g'), (_match, quote) => `${quote}${to}${quote}`);
}

// No personal or customer email address may survive in a public synthetic build.
html = html.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'test-contact@example.invalid');

const testHead = `
<meta name="robots" content="noindex,nofollow">
<script id="vecta-public-synthetic-guard">
(function(){
  window.VECTA_PUBLIC_SYNTHETIC_TEST = true;
  try{
    if(localStorage.getItem('vecta:test-fixture-version')!=='4'){
      localStorage.clear();
      localStorage.setItem('vecta:test-fixture-version','4');
      if('caches' in window)caches.keys().then(function(keys){return Promise.all(keys.map(function(k){return caches.delete(k)}))});
    }
  }catch(_error){}
})();
</script>`;
html = html.replace(/<head(\s[^>]*)?>/i, match => `${match}${testHead}`);
html = html.replace(/<body(\s[^>]*)?>/i, match => `${match}<div id="vectaSyntheticBanner" style="position:fixed;z-index:2147483647;right:12px;bottom:12px;background:#7f1d1d;color:#fff;padding:8px 12px;border-radius:999px;font:700 11px Arial;letter-spacing:.04em;box-shadow:0 5px 18px #0004">SYNTHETIC TEST DATA · NOT LIVE</div>`);

// These blocks repair historic production-only fleet imports. A public
// synthetic build deliberately contains none of those imports, so running the
// repairs only creates false ReferenceErrors before the isolated fleet fixture
// has loaded.
for (const id of [
  'v207-fleet-due-sync-repair',
  'v212-fleet-safety-service-anchor-rule',
  'v213-tax-due-repair',
  'v277-mainsec-date-and-nmuk-authority-fix'
]) {
  html = html.replace(new RegExp(`<script\\s+id=["']${id}["'][^>]*>[\\s\\S]*?<\\/script>`, 'i'), '');
}

// The current paged downloader replaced the legacy fetchAllRows helper.
html = html.replace(
  "var rows=await fetchAllRows('invoices');",
  "var rows=await vectaFetchAllRemoteRows('invoices',9000);"
);

// Reuse one Supabase client for the lifetime of the page. Recreating the auth
// client against the same storage key causes undefined concurrent behaviour.
html = html.replace(
  'function connectSupabase(){\n  remoteClient=null;\n  if(!app.settings.supabaseUrl||!app.settings.supabaseAnonKey||!window.supabase) return false;\n  try{remoteClient=window.supabase.createClient(app.settings.supabaseUrl,app.settings.supabaseAnonKey);return true;}catch(e){console.warn(e);return false;}\n}',
  'function connectSupabase(){\n  if(remoteClient)return true;\n  if(!app.settings.supabaseUrl||!app.settings.supabaseAnonKey||!window.supabase) return false;\n  try{remoteClient=window.supabase.createClient(app.settings.supabaseUrl,app.settings.supabaseAnonKey);return true;}catch(e){console.warn(e);return false;}\n}'
);

// A public test system must always be immediately usable, even when its
// synthetic database is slow or temporarily unavailable. Render the last
// synthetic/local state first and let the authoritative refresh replace it.
const startupBind = '  bindTop();\n  vectaSetStartupLoading(true,\'Loading workshop…\',\'Checking live jobs and tasks before showing the dashboard.\');';
if (!html.includes(startupBind)) throw new Error('Required startup loading sequence was not found');
html = html.replace(startupBind, '  bindTop();\n  vectaSetStartupLoading(false);render();\n  if(!window.VECTA_PUBLIC_SYNTHETIC_TEST)vectaSetStartupLoading(true,\'Loading workshop…\',\'Checking live jobs and tasks before showing the dashboard.\');');
html = html.replace(
  "  vectaSetStartupLoading(true,'Loading workshop…','Checking live jobs and tasks before showing the dashboard.');\n  var jobsP=vectaFetchAllRemoteRows('jobs',9000);",
  "  if(!window.VECTA_PUBLIC_SYNTHETIC_TEST)vectaSetStartupLoading(true,'Loading workshop…','Checking live jobs and tasks before showing the dashboard.');\n  var jobsP=vectaFetchAllRemoteRows('jobs',9000);"
);

// Static preview deployments cannot expose server functions. The publishable
// synthetic key is safe for browsers and keeps the test UI independent of any
// production Vercel environment variables.
const publicTestConfig = encodeURIComponent(JSON.stringify({
  supabaseUrl: 'https://rmbmbpqwvghxuyeykjhh.supabase.co',
  supabasePublishableKey: 'sb_publishable_g_Ey4NLLhW6aZye_bPZWlw_nE7Skh0z'
}));
html = html.replace("fetch('/api/supabase-config'", `fetch('data:application/json,${publicTestConfig}'`);

if (html === original) throw new Error('Sanitiser made no changes');
if (/nissan-nmuk\.co\.uk|@nmuk\.co\.uk|e4electricalservices\.co\.uk|@fms\.uk\.net/i.test(html)) {
  throw new Error('Safety stop: a known real customer email domain remains');
}
if (/\b(?:FG05\s*BZV|HN22\s*UHV|NK72\s*KTD|NK72\s*KTJ|TCS\s*T2)\b/i.test(html)) {
  throw new Error('Safety stop: a known real registration remains');
}
if (/(["'])(?:OWBEN|RAMS|TEMPLEMAN|BIDVEST|UNIPRESS|WPC|FMS|JEB|E4 ELECTRICAL|E4)\1/.test(html)) {
  throw new Error('Safety stop: a known real customer label remains as a data value');
}
if (/window\.INITIAL_FLEET_VEHICLES\s*=\s*\[\s*\{|window\.NMUK_2026_JOBS\s*=\s*\[\s*\{|window\.CONTRACTOR_2026_JOBS\s*=\s*\[\s*\{/i.test(html)) {
  throw new Error('Safety stop: an embedded production data array remains');
}
if (!/VECTA_PUBLIC_SYNTHETIC_TEST/.test(html)) throw new Error('Synthetic test guard was not installed');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html);

const sourceRoot = path.dirname(path.resolve(sourcePath));
const outputRoot = path.dirname(path.resolve(outputPath));
const syncedFiles = [
  ['public/service-worker.js', 'service-worker.js'],
  ['public/js/vecta-job-rules.js', 'js/vecta-job-rules.js'],
  ['public/js/vecta-invoice-rules.js', 'js/vecta-invoice-rules.js'],
  ['public/js/vecta-planner-rules.js', 'js/vecta-planner-rules.js'],
  ['public/js/vecta-finance-rules.js', 'js/vecta-finance-rules.js'],
  ['public/js/vecta-fleet-rules.js', 'js/vecta-fleet-rules.js'],
  ['public/js/vecta-booking-rules.js', 'js/vecta-booking-rules.js'],
  ['public/js/vecta-offline-sync-rules.js', 'js/vecta-offline-sync-rules.js'],
  ['public/supabase.min.js', 'supabase.min.js'],
  ['public/manifest.webmanifest', 'manifest.webmanifest'],
  ['public/icons/vecta-192.png', 'icons/vecta-192.png'],
  ['public/icons/vecta-512.png', 'icons/vecta-512.png']
];
for (const [sourceRelative, outputRelative] of syncedFiles) {
  const from = path.join(sourceRoot, sourceRelative);
  const to = path.join(outputRoot, outputRelative);
  if (!fs.existsSync(from)) throw new Error(`Required latest-build file is missing: ${sourceRelative}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

console.log(JSON.stringify({sourceBytes: Buffer.byteLength(original), outputBytes: Buffer.byteLength(html), syncedFiles: syncedFiles.length}));
