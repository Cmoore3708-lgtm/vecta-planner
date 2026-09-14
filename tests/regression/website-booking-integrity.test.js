import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../api/website-booking.js', import.meta.url), 'utf8');

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
  const source = namedFunctionSource('createJobFromWebsiteRequest');
  const jobSave = source.indexOf("await upsertRemote('jobs',j");
  const requestClose = source.indexOf("var bookedResult=await remoteClient.from('website_booking_requests').update({status:'booked'})");
  assert.ok(jobSave > -1 && requestClose > jobSave, 'job save must precede request closure');
  assert.match(source, /bookedResult\.error[\s\S]*?app\.jobs=app\.jobs\.filter[\s\S]*?deleteRemote\('jobs',j\.id\)/);
});

test('public confirmed booking rejects a live slot collision', () => {
  assert.match(api, /booking_date=eq\.\$\{encodeURIComponent\(job\.booking_date\)\}/);
  assert.match(api, /technician=eq\.\$\{encodeURIComponent\(job\.technician\)\}/);
  assert.match(api, /if\(clash\)return res\.status\(409\)/);
  assert.ok(api.indexOf('if(clash)') < api.lastIndexOf("'website_booking_requests','POST',request"), 'collision must be rejected before confirmed booking records are written');
});

test('website request deletion cannot delete customer, vehicle, job or invoice data', () => {
  const source = namedFunctionSource('deleteWebsiteRequestCompletely');
  assert.match(source, /website_booking_requests/);
  assert.doesNotMatch(source, /deleteRemote\('(jobs|customers|vehicles|invoices|service_records)'/);
});
