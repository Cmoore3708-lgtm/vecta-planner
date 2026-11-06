import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { bookingAnalyticsReceipt, readBookingAnalyticsReceipt } from '../../lib/website-analytics-receipt.js';
import { websiteVisitorsHandler, londonDay } from '../../lib/website-visitors.js';
import { managerSessionCookie } from '../../middleware.js';

const booking = { id: '11111111-1111-4111-8111-111111111111', created_at: '2026-07-01T22:59:50Z' };
test('booking receipts verify saved identity, reject forgery and expire without extending retries', () => {
  const now = Date.parse(booking.created_at), token = bookingAnalyticsReceipt(booking, 'secret', now);
  assert.equal(readBookingAnalyticsReceipt(token, 'secret', now + 20000).day, '2026-07-01');
  assert.equal(readBookingAnalyticsReceipt(token, 'secret', now).id, booking.id);
  assert.equal(bookingAnalyticsReceipt(booking, 'secret', now + 10000), token);
  assert.equal(readBookingAnalyticsReceipt(token, 'secret', now + 900001), null);
  assert.equal(readBookingAnalyticsReceipt(token, 'wrong', now), null);
  assert.equal(readBookingAnalyticsReceipt(token.replace('111', '222') + 'x', 'secret', now), null);
  assert.equal(bookingAnalyticsReceipt(booking, 'secret', now + 900001), undefined);
  assert.equal(bookingAnalyticsReceipt({ ...booking, id: 'not-a-booking' }, 'secret', now), undefined);
});

test('history remains manager-only and booking attribution requires a verified receipt', async () => {
  const names = ['VECTA_MAIN_USER','VECTA_MAIN_PASSWORD','VITE_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','VERCEL_ENV','VERCEL_PROJECT_NAME','VERCEL_PROJECT_PRODUCTION_URL'];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]])), original = globalThis.fetch;
  Object.assign(process.env, { VECTA_MAIN_USER:'manager',VECTA_MAIN_PASSWORD:'graphs-test',VITE_SUPABASE_URL:'https://mock.invalid',SUPABASE_SERVICE_ROLE_KEY:'secret',VERCEL_ENV:'production',VERCEL_PROJECT_NAME:'vecta-planner',VERCEL_PROJECT_PRODUCTION_URL:'vecta-planner.vercel.app' });
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({url,body:JSON.parse(options.body)});return {ok:true,status:200,json:async()=>({days:[]})}; };
  const headers = {origin:'https://www.vectamotors.co.uk',referer:'https://www.vectamotors.co.uk/','user-agent':'Mozilla/5.0 Safari/605','x-vercel-forwarded-for':'192.0.2.1'};
  async function run(method, body, query={}, h=headers) { const result={};await websiteVisitorsHandler({method,body,query,headers:h},{setHeader(){},status(code){result.status=code;return this;},json(data){result.data=data;return this;},end(){return this;}});return result; }
  try {
    assert.equal((await run('GET',null,{history:'1'})).status,401);assert.equal(calls.length,0);
    const cookie=(await managerSessionCookie({user:'manager',password:'graphs-test'})).split(';')[0];
    await run('GET',null,{history:'1',days:'30'},{host:'vecta-planner.vercel.app',cookie});
    assert.match(calls.at(-1).url,/website_visitor_history$/);assert.equal(calls.at(-1).body.p_days,30);
    await run('POST',JSON.stringify({kind:'progress',registration:'DO-NOT-STORE'}));
    assert.equal(calls.at(-1).body.p_kind,'progress');assert.ok(!JSON.stringify(calls).includes('DO-NOT-STORE'));
    const count=calls.length;
    assert.equal((await run('POST',{receipt:'forged'})).status,400);assert.equal(calls.length,count);
    const receipt=bookingAnalyticsReceipt({...booking,created_at:new Date().toISOString()},'secret');
    await run('POST',{receipt});assert.equal(calls.at(-1).body.p_request,booking.id);assert.equal(calls.at(-1).body.p_kind,'booking');
    await run('POST',{receipt},{exclude:'1'});assert.match(calls.at(-1).url,/exclude_website_visit$/);
  } finally { globalThis.fetch=original;for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});

const flush = () => new Promise(resolve=>setImmediate(resolve));
function fixture(days=7) {
  const date=londonDay();
  return {date,started_at:new Date().toISOString(),activity_started_at:new Date().toISOString(),days:Array.from({length:days},(_,i)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-days+1+i);return {date:d.toISOString().slice(0,10),visitors:10,booking_visitors:8,requests:3,confirmed:2,converted_visitors:1,partial:i===days-1};})};
}
test('click-through graphs distinguish requests, bookings, unique conversions and missing history', async () => {
  const {document,window}=parseHTML('<html><head></head><body><div id="websiteVisitorStats"><div class="visitorHeading">Website visitors</div><div class="visitorDay">Today</div><div class="visitorDay">Yesterday</div></div></body></html>');
  window.matchMedia = () => ({matches:false});
  let response=fixture(), calls=0;
  const context={document,window,navigator:{onLine:true},Intl,Date,Number,AbortController,setTimeout,clearTimeout,setInterval(){},fetch:async()=>{calls++;return {ok:true,json:async()=>response};}};
  vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-website-graphs.js',import.meta.url),'utf8'),context);
  assert.equal(calls,0,'loading the planner does not request history');
  const trigger=document.querySelector('.visitorTrigger');
  // Native dialog methods are provided by browsers, not linkedom.
  window.HTMLElement.prototype.showModal=function(){this.open=true;};
  window.HTMLElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  trigger.click();await flush();
  const modal=document.getElementById('websiteGraphs');
  assert.equal(modal.open,true);assert.equal(calls,1);
  assert.deepEqual(Array.from(modal.querySelectorAll('.wg-card strong')).map(n=>n.textContent),['70','14','12.5%']);
  assert.match(modal.textContent,/21 online requests · 7 awaiting acceptance/);
  response=fixture(30);response.days.forEach(r=>{r.visitors=null;r.booking_visitors=null;r.requests=null;r.confirmed=null;r.converted_visitors=null;});
  modal.querySelector('[data-days="30"]').click();await flush();
  assert.deepEqual(Array.from(modal.querySelectorAll('.wg-card strong')).map(n=>n.textContent),['—','—','—']);
  assert.match(modal.textContent,/Blank days were not tracked/);
  response=fixture(30);response.date='2000-01-01';modal.querySelector('[data-days="30"]').click();await flush();
  assert.equal(modal.querySelector('.wg-content').hidden,true);assert.match(modal.querySelector('.wg-status').textContent,/temporarily unavailable/);
  modal.querySelector('.wg-close').click();assert.equal(modal.open,false);
});

test('the workshop statistics link stays available until its own website tab confirms exclusion', () => {
  const storage = new Map();
  const popup = {};
  let opens = [];
  function dashboard(phone = false) {
    const {document,window} = parseHTML('<html><body><div id="websiteVisitorStats"></div></body></html>');
    window.matchMedia = () => ({matches:phone});
    window.open = url => { opens.push(url); return popup; };
    window.HTMLElement.prototype.showModal = function () { this.open = true; };
    const context = {
      document, window, navigator:{onLine:false}, setInterval(){},
      localStorage:{getItem:key=>storage.get(key), setItem:(key,value)=>storage.set(key,value)}
    };
    vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-website-graphs.js',import.meta.url),'utf8'),context);
    document.querySelector('.visitorTrigger').click();
    return {window, link:() => document.querySelector('.wg-top a')};
  }
  const desk = dashboard();
  assert.equal(dashboard(true).link(), null);
  desk.link().click();
  assert.deepEqual(opens, ['https://www.vectamotors.co.uk/?vecta_visitors=exclude#workshop-statistics']);
  function confirm(origin, source) {
    const event = Object.assign(new desk.window.Event('message'), {origin,source,data:'vecta:visits-excluded'});
    desk.window.dispatchEvent(event);
  }
  confirm('https://example.com', popup);
  confirm('https://www.vectamotors.co.uk', {});
  assert.ok(desk.link());
  assert.equal(storage.size, 0);
  confirm('https://www.vectamotors.co.uk', popup);
  assert.equal(desk.link(), null);
  assert.equal(dashboard().link(), null);
});

test('public collector classifies progress-only views and suppresses opt-out booking events', async () => {
  function browser(path, ignored=false) {
    const {document,window}=parseHTML('<html><body></body></html>'),calls=[],storage=new Map(ignored?[['vecta_ignore_my_visits','1']]:[]);
    const context={document,window,location:{hostname:'www.vectamotors.co.uk',pathname:path,href:'https://www.vectamotors.co.uk'+path},navigator:{onLine:true},localStorage:{getItem:key=>storage.get(key)},URL,Intl,Date,AbortSignal,setInterval(){},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true};}};
    vm.runInNewContext(fs.readFileSync(new URL('../../public/js/vecta-website-visit.js',import.meta.url),'utf8'),context);
    return {document,window,calls,storage};
  }
  let b=browser('/track');await flush();assert.equal(b.calls[0].body.kind,'progress');
  b=browser('/booking');await flush();assert.equal(b.calls[0].body.kind,'browse');
  b.window.dispatchEvent(new b.window.CustomEvent('vecta:website-booking-created',{detail:{receipt:'signed-token'}}));await flush();assert.equal(b.calls.at(-1).body.receipt,'signed-token');
  b.storage.set('vecta_ignore_my_visits','1');const before=b.calls.length;
  b.window.dispatchEvent(new b.window.CustomEvent('vecta:website-booking-created',{detail:{receipt:'signed-token'}}));assert.equal(b.calls.length,before);
  b=browser('/booking',true);b.window.dispatchEvent(new b.window.CustomEvent('vecta:website-booking-created',{detail:{receipt:'signed-token'}}));assert.equal(b.calls.length,0);
});
