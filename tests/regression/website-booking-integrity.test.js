import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../api/website-booking.js', import.meta.url), 'utf8');
const bookingPage = fs.readFileSync(new URL('../../public/booking.html', import.meta.url), 'utf8');

function namedFunctionSource(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('accepting an inbox request has a per-request concurrency lock', () => {
  const source = namedFunctionSource('createJobFromWebsiteRequest');
  assert.match(html, /var websiteRequestCreateBusy=\{\}/);
  assert.match(source, /if\(!id\|\|websiteRequestCreateBusy\[id\]\)return/);
  assert.match(source, /websiteRequestCreateBusy\[id\]=true/);
  assert.match(source, /finally\{\s*delete websiteRequestCreateBusy\[id\]/);
});

test('accepting a request reopens an existing linked job instead of duplicating it', () => {
  const source = namedFunctionSource('createJobFromWebsiteRequest');
  assert.match(source, /websiteRequestIdFromJob\(j\)===id/);
  assert.match(source, /existingRequest&&existingRequest\.job_id/);
  assert.match(source, /select\('job_id,status'\)/);
  assert.ok(source.indexOf('if(existingJob)') < source.indexOf('var j={id:uid()'), 'duplicate checks must run before job creation');
});

test('manual acceptance closes the request only after the job is saved', () => {
  const open = namedFunctionSource('createJobFromWebsiteRequest');
  assert.match(open, /openWebsiteRequestJobCard\(r,j\)/);
  assert.doesNotMatch(open, /upsertRemote|deleteRemote|\.update\(/);
  const accept = namedFunctionSource('acceptWebsiteRequestJob');
  assert.match(accept, /saveJob\(jobId,async function\(job\)/);
  assert.match(accept, /result\.error\|\|!result\.data\|\|result\.data\.length!==1/);
  const save = namedFunctionSource('saveJob');
  assert.ok(save.indexOf('syncSavedJobBundleInBackground') < save.indexOf('await onConfirmed(j)'), 'server save must precede request closure');
});

test('public booking submissions cannot create or allocate planner jobs', () => {
  assert.match(api, /status:'awaiting_review'/);
  assert.match(api, /confirmed:false/);
  assert.match(api, /Accept & create job/);
  assert.doesNotMatch(api, /rest\(url,key,'jobs','POST'/);
  assert.doesNotMatch(api, /job_id:/);
  assert.doesNotMatch(api, /technician:String\(b\.technician\)/);
  assert.match(bookingPage, /Confirm booking/);
  assert.match(bookingPage, /Booking confirmed/);
  assert.match(bookingPage, /Your booking is confirmed/);
  assert.doesNotMatch(bookingPage, /not yet confirmed|will review your request and confirm whether/);
});

test('website request deletion cannot delete customer, vehicle, job or invoice data', () => {
  const source = namedFunctionSource('deleteWebsiteRequestCompletely');
  assert.match(source, /website_booking_requests/);
  assert.doesNotMatch(source, /deleteRemote\('(jobs|customers|vehicles|invoices|service_records)'/);
});


test('opening Website Bookings refreshes the inbox from cloud before relying on cache', () => {
  const refresh = namedFunctionSource('refreshWebsiteRequestsFromCloud');
  const nav = namedFunctionSource('renderNav');
  assert.match(refresh, /vectaFetchAllRemoteRows\('website_booking_requests',12000\)/);
  assert.match(refresh, /app\.websiteRequests=rows\.map\(fromRemote\)/);
  assert.match(nav, /vectaNavigateTo\(b.dataset.view\)/);
  const navigate=namedFunctionSource('vectaNavigateTo');
  assert.match(navigate, /view==='websiteRequests'\)refreshWebsiteRequestsFromCloud\(\)/);
  assert.match(navigate, /if\(ok&&view==='websiteRequests'\)render\(\)/);
});
