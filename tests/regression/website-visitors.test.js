import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { londonDay, visitorFingerprint, publicVisit, websiteVisitorsHandler } from '../../lib/website-visitors.js';
import { managerSessionCookie } from '../../middleware.js';

const visitor = { origin: 'https://www.vectamotors.co.uk', referer: 'https://www.vectamotors.co.uk/', 'user-agent': 'Mozilla/5.0 Safari/605.1.15', 'x-vercel-forwarded-for': '192.0.2.5' };
test('unique visitor keys deduplicate page visits, rotate at UK midnight and discard raw identifiers', () => {
  const hash = visitorFingerprint(visitor, 'test-secret', '2026-07-01');
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(visitorFingerprint({ ...visitor, referer: 'https://www.vectamotors.co.uk/booking?reg=PRIVATE' }, 'test-secret', '2026-07-01'), hash);
  assert.notEqual(visitorFingerprint(visitor, 'test-secret', '2026-07-02'), hash);
  assert.notEqual(visitorFingerprint({ ...visitor, 'x-vercel-forwarded-for': '192.0.2.6' }, 'test-secret', '2026-07-01'), hash);
  assert.equal(londonDay(new Date('2026-07-01T23:01:00Z')), '2026-07-02');
  assert.equal(londonDay(new Date('2026-11-01T23:01:00Z')), '2026-11-01');
  assert.equal(londonDay(new Date('2026-03-29T23:01:00Z')), '2026-03-30');
  assert.equal(londonDay(new Date('2026-10-25T23:01:00Z')), '2026-10-25');
  assert.equal(visitorFingerprint({ ...visitor, 'user-agent': 'Googlebot' }, 'secret', '2026-07-01'), null);
  assert.equal(visitorFingerprint({ ...visitor, dnt: '1' }, 'secret', '2026-07-01'), null);
  assert.equal(visitorFingerprint({ ...visitor, 'sec-gpc': '1' }, 'secret', '2026-07-01'), null);
});
test('collection accepts public pages and rejects workshop, mechanics, previews and unrelated origins', () => {
  assert.equal(publicVisit(visitor), true);
  assert.equal(publicVisit({ ...visitor, origin: 'https://vecta-planner.vercel.app', referer: 'https://vecta-planner.vercel.app/booking' }), true);
  for (const url of ['https://vecta-planner.vercel.app/', 'https://vecta-planner.vercel.app/index.html', 'https://vecta-mechanic-dashboard.vercel.app/', 'https://vecta-planner-git-test.vercel.app/', 'https://evil.example/']) {
    assert.equal(publicVisit({ ...visitor, origin: new URL(url).origin, referer: url }), false, url);
  }
});
test('count API is manager-only; collector cannot read totals; Preview cannot write live data', async () => {
  const names = ['VECTA_MAIN_USER','VECTA_MAIN_PASSWORD','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VERCEL_ENV','VERCEL_PROJECT_NAME','VERCEL_PROJECT_PRODUCTION_URL'];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]])), originalFetch = globalThis.fetch;
  Object.assign(process.env, { VECTA_MAIN_USER: 'manager', VECTA_MAIN_PASSWORD: 'visitor-test', VITE_SUPABASE_URL: 'https://mock.invalid', SUPABASE_SERVICE_ROLE_KEY: 'secret-for-tests', VERCEL_ENV: 'production', VERCEL_PROJECT_NAME: 'vecta-planner', VERCEL_PROJECT_PRODUCTION_URL: 'vecta-planner.vercel.app' });
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url, body:JSON.parse(options.body)}); return {ok:true,status:200,json:async()=>({date:londonDay(),today:4,yesterday:null})}; };
  async function run(method, headers) { const result = {}; await websiteVisitorsHandler({method,headers}, {setHeader(){},status(s){result.status=s;return this;},json(d){result.data=d;return this;},end(){return this;}}); return result; }
  try {
    assert.equal((await run('GET', visitor)).status, 401); assert.equal(calls.length, 0);
    const cookie = (await managerSessionCookie({user:'manager',password:'visitor-test'})).split(';')[0];
    assert.equal((await run('GET', {host:'vecta-planner.vercel.app',cookie})).data.today, 4);
    assert.equal((await run('POST', visitor)).status, 204);
    assert.deepEqual(Object.keys(calls[1].body).sort(), ['p_day','p_hash']);
    assert.ok(!JSON.stringify(calls[1]).includes('192.0.2.5'));
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await run('POST', visitor)).status, 204); assert.equal(calls.length, 2);
  } finally { globalThis.fetch=originalFetch; for(const [name,value] of Object.entries(saved)) { if(value===undefined)delete process.env[name];else process.env[name]=value; } }
});

test('dashboard distinguishes untracked days, zero visitors and unavailable data; mechanics do not fetch counts', async () => {
  async function browser(data, mechanic=false) {
    const {document}=parseHTML('<div id="websiteVisitorStats" hidden><strong id="websiteVisitorsToday">—</strong><strong id="websiteVisitorsYesterday">—</strong></div>');
    let calls=0;
    const context={document,window:{VECTA_MECHANIC_DEPLOYMENT:mechanic,addEventListener(){}},navigator:{onLine:true},Intl,Date,Number,AbortSignal,setInterval(){},fetch:async()=>{calls++;return {ok:true,json:async()=>data};}};
    vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-website-visitors.js',import.meta.url),'utf8'),context);
    await new Promise(resolve=>setImmediate(resolve));
    return {document,calls};
  }
  let b=await browser({date:londonDay(),today:0,yesterday:null});
  assert.equal(b.document.getElementById('websiteVisitorsToday').textContent,'0');
  assert.equal(b.document.getElementById('websiteVisitorsYesterday').textContent,'—');
  b=await browser({date:'2020-01-01',today:100,yesterday:200});
  assert.equal(b.document.getElementById('websiteVisitorsToday').textContent,'—');
  b=await browser({},true);assert.equal(b.calls,0);assert.equal(b.document.getElementById('websiteVisitorStats').hidden,true);
});
