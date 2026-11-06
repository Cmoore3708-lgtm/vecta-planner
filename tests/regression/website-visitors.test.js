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
  async function run(method, headers, query={}) { const result = {}; await websiteVisitorsHandler({method,headers,query}, {setHeader(){},status(s){result.status=s;return this;},json(d){result.data=d;return this;},end(){return this;}}); return result; }
  try {
    assert.equal((await run('GET', visitor)).status, 401); assert.equal(calls.length, 0);
    const cookie = (await managerSessionCookie({user:'manager',password:'visitor-test'})).split(';')[0];
    assert.equal((await run('GET', {host:'vecta-planner.vercel.app',cookie})).data.today, 4);
    assert.equal((await run('POST', visitor)).status, 204);
    assert.deepEqual(Object.keys(calls[1].body).sort(), ['p_day','p_hash']);
    assert.ok(!JSON.stringify(calls[1]).includes('192.0.2.5'));
    assert.equal((await run('POST',visitor,{exclude:'1'})).status,204);
    assert.ok(calls[2].url.endsWith('/exclude_website_visit'));
    assert.equal(calls[2].body.p_hash,calls[1].body.p_hash);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await run('POST', visitor)).status, 204); assert.equal(calls.length, 3);
  } finally { globalThis.fetch=originalFetch; for(const [name,value] of Object.entries(saved)) { if(value===undefined)delete process.env[name];else process.env[name]=value; } }
});

test('ignore-my-visits persists across page loads, removes today once and suppresses all later collection', async () => {
  const storage=new Map(),calls=[];
  function open(search='') {
    const {document}=parseHTML('<html><body></body></html>');
    const context={document,URL,Intl,Date,AbortSignal,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},location:{hostname:'www.vectamotors.co.uk',href:'https://www.vectamotors.co.uk/'+search},history:{state:null,replaceState(){}},navigator:{onLine:true},window:{addEventListener(){}},setInterval(){},fetch:async url=>{calls.push(url);return {ok:true};}};
    vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-website-visit.js',import.meta.url),'utf8'),context);
    return document;
  }
  const optedOut=open('?vecta_visitors=exclude');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storage.get('vecta_ignore_my_visits'),'1');
  assert.match(optedOut.getElementById('vectaVisitorPreferenceNotice').textContent,/now ignored/);
  assert.deepEqual(calls,['https://vecta-planner.vercel.app/api/admin-website?visitors=1&exclude=1']);
  open();open('?reg=EXAMPLE');assert.equal(calls.length,1);
  open('?vecta_visitors=include');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(storage.has('vecta_ignore_my_visits'),false);
  assert.equal(calls.at(-1),'https://vecta-planner.vercel.app/api/admin-website?visitors=1');
});

test('workshop confirmation requires a saved website preference and goes to the initiating planner only', () => {
  const script = fs.readFileSync(new URL('../../public/js/vecta-website-visit.js',import.meta.url),'utf8');
  assert.equal(script, fs.readFileSync(new URL('../../website/js/vecta-website-visit.js',import.meta.url),'utf8'));
  function open(referrer, blocked = false) {
    const {document} = parseHTML('<html><body></body></html>');
    document.referrer = referrer;
    const messages = [], storage = new Map();
    const context = {
      document, URL, AbortSignal,
      window:{opener:{postMessage:(...args)=>messages.push(args)}},
      localStorage:{
        setItem(key,value){ if (blocked) throw Error('Storage blocked'); storage.set(key,value); },
        getItem:key=>storage.get(key)
      },
      location:{hostname:'www.vectamotors.co.uk',href:'https://www.vectamotors.co.uk/?vecta_visitors=exclude#workshop-statistics'},
      history:{replaceState(){}}, fetch:async()=>({ok:true})
    };
    vm.runInNewContext(script, context);
    return {messages, document};
  }
  const planner = 'https://vecta-planner.vercel.app';
  assert.deepEqual(open(planner+'/').messages,[['vecta:visits-excluded',planner]]);
  const blocked = open(planner+'/',true);
  assert.deepEqual(blocked.messages,[]);
  assert.match(blocked.document.body.textContent,/could not save/);
  assert.deepEqual(open('https://example.com/').messages,[]);
  assert.deepEqual(open('').messages,[]);
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
